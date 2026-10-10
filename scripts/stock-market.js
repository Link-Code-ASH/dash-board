import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const dateKey = seconds => new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(seconds*1000));
export function parseChart(json, symbol, now = new Date()) {
  const chart=json.chart?.result?.[0];
  if(!chart?.timestamp?.length) throw new Error(`${symbol}: 시세 응답 없음`);
  const close=chart.indicators?.quote?.[0]?.close;
  const end=chart.meta?.currentTradingPeriod?.regular?.end;
  const today=dateKey(now.getTime()/1000);
  const records=chart.timestamp.map((t,i)=>({date:dateKey(t),close:close?.[i]})).filter(r=>Number.isFinite(r.close)&&r.close>0&& (symbol==='KRW=X'||r.date<today||(r.date===today&&Number.isFinite(end)&&now.getTime()/1000>=end+120)));
  if(!records.length) throw new Error(`${symbol}: 완료된 거래일 없음`);
  const latest=records.at(-1);
  const monday=new Date(`${today}T12:00:00Z`);
  monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()+6)%7));
  const cutoff=monday.toISOString().slice(0,10);
  const weekly=records.filter(r=>r.date<cutoff).at(-1);
  return {symbol,...latest,weeklyClose:weekly?.close??null,weeklyDate:weekly?.date??null,source:'Yahoo Finance',fetchedAt:now.toISOString(),kind:symbol==='KRW=X'?'환율 일별 최근값':'정규장 종가'};
}
export async function fetchMarket(symbols=['TQQQ','SOXL'], previous={}) {
  const quotes={...previous.quotes},errors={};
  await Promise.all([...new Set([...symbols,'KRW=X'])].map(async symbol=>{
    try {
      let result;
      for(const host of ['query1','query2']) {
        try {
          const response=await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`,{headers:{'User-Agent':'HUB stock dashboard'},signal:AbortSignal.timeout(12000)});
          if(!response.ok) throw new Error(`HTTP ${response.status}`);
          result=parseChart(await response.json(),symbol); break;
        } catch(error) { if(host==='query2') throw error; }
      }
      quotes[symbol]=result;
    } catch(error) {errors[symbol]=error.message;}
  }));
  return {version:1,checkedAt:new Date().toISOString(),quotes,errors};
}
export function stockMarketPlugin() {
  let cache;
  return {name:'stock-market',configureServer(server){server.middlewares.use('/__stock-market',async(req,res)=>{
    if(!cache||Date.now()-new Date(cache.checkedAt).getTime()>300000) cache=await fetchMarket(['TQQQ','SOXL'],cache);
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(cache));
  });}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const file=new URL('../public/market/latest.json',import.meta.url);
  let previous={};try{previous=JSON.parse(await readFile(file,'utf8'));}catch{}
  const symbols=JSON.parse(await readFile(new URL('../public/market/symbols.json',import.meta.url),'utf8'));
  const result=await fetchMarket(symbols,previous);
  await mkdir(new URL('../public/market/',import.meta.url),{recursive:true});
  await writeFile(file,JSON.stringify(result,null,2)+'\n');
  console.log(`Market snapshot: ${Object.keys(result.quotes).join(', ')}; failures: ${Object.keys(result.errors).join(', ')||'none'}`);
  if(Object.keys(result.errors).length) process.exitCode=1;
}
