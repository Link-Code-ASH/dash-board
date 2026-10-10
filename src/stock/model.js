export const uid = () => globalThis.crypto.randomUUID();
export const round = (n, digits = 0) => Math.sign(n) * Math.round((Math.abs(n) + Number.EPSILON) * 10 ** digits) / 10 ** digits;
const rule = (side, percent, divisor, mode = side === 'buy' ? 'capacity' : 'held', offset = 0, special = '') => ({ id: uid(), side, percent, divisor, mode, offset, special, order: 'limit' });
export function defaultStages() {
  const bounds = [40, 45, 50, 55, 60, 70, 90, 100];
  const buys = [[[-6,30],[0,30],[3,20]], [[-2,20],[2,20]], [[0,20]], [[-6,30],[-3,15]], [[-8,30],[-4,15]], [[-10,25],[-5,25]], [[-11,16]], []];
  const sells = [[3,7,12,8,8],[2,6,9,7,7],[0,4,8,7,7],[-3,0,7,8,5],[-4,-1,6,6,6],[-5,0,5,5,5],[-11,-6,0,4,4],[0,-10,0,8,8]];
  return bounds.map((upper, i) => {
    const [p,q,r,d,e] = sells[i];
    const rows = buys[i].map(([pct, div], j) => rule('buy',pct,div,'capacity',j === buys[i].length-1 ? -0.01 : 0));
    rows.push(rule('sell',p,d,'held',0,i===0?'small-first':''),rule('sell',q,e,'held',0,i===0?'small-second':''),rule('sell',r,1,'remaining'));
    if(i===7) rows[0].order='moc';
    return { id:uid(), name:`${i+1}단계`, upper, rules:rows };
  });
}
export function createStock() {
  return { version:1, assets:[{id:uid(),symbol:'TQQQ',stages:defaultStages()}], profiles:['본인','여자친구'].map(name=>({id:uid(),name,positions:{}})) };
}
export function retireSOXL(stock) {
  const retiring=stock.assets.filter(asset=>typeof asset.symbol==='string'&&asset.symbol.trim().toUpperCase()==='SOXL');
  if(!retiring.length) return stock;
  const ids=new Set(retiring.map(asset=>asset.id));
  return {...stock,assets:stock.assets.filter(asset=>!ids.has(asset.id)),archivedAssets:[...(stock.archivedAssets||[]).filter(asset=>!ids.has(asset.id)),...retiring]};
}
export function getStageHighlight(stageId, accounts=[]) {
  if(!stageId) return '';
  const matches=accounts.filter(account=>account.result?.stage?.id===stageId);
  const a=matches.some(account=>account.label==='A'), y=matches.some(account=>account.label==='Y');
  return a&&y?'stage-both':a?'stage-a':y?'stage-y':'';
}
export function emptyPosition() { return { average:0,held:0,capacity:0,krwCash:0,fxCash:0,valuation:0,desired:1,lower:25,upper:35,invest:70 }; }
const vrKeys = ['lower','upper','invest'];
const readVRSettings = source => {
  const fallback=emptyPosition();
  return Object.fromEntries(vrKeys.map(key=>{
    const value=source?.[key]===undefined?fallback[key]:source[key];
    return [key,typeof value==='string'&&value.trim()!==''&&Number.isFinite(Number(value))?Number(value):value];
  }));
};
export function inspectVRSettings(asset, profiles=[]) {
  const shared=!!asset?.vr && typeof asset.vr==='object' && !Array.isArray(asset.vr);
  const legacy=profiles.map(profile=>({profileId:profile.id,settings:readVRSettings(profile.positions?.[asset?.id])}));
  const settings=shared?readVRSettings(asset.vr):legacy[0]?.settings||readVRSettings();
  const conflict=!shared&&legacy.some(profile=>vrKeys.some(key=>Number(profile.settings[key])!==Number(settings[key])));
  return {shared,conflict,settings,legacy};
}
export function applyVRSettings(position, asset) {
  const result={...emptyPosition(),...position};
  return {...result,...readVRSettings(inspectVRSettings(asset).shared?asset.vr:result)};
}
export function saveSharedVRSettings(stock, assetId, settings) {
  if(!stock.assets.some(asset=>asset.id===assetId)) return stock;
  return {...stock,assets:stock.assets.map(asset=>asset.id===assetId?{...asset,vr:{...asset.vr,...readVRSettings(settings)}}:asset)};
}
export function updateStockPosition(stock, profileId, assetId, patch) {
  if(!stock.assets.some(asset=>asset.id===assetId)||!stock.profiles.some(profile=>profile.id===profileId)) return stock;
  return {...stock,profiles:stock.profiles.map(profile=>profile.id===profileId?{...profile,positions:{...profile.positions,[assetId]:{...emptyPosition(),...profile.positions?.[assetId],...patch}}}:profile)};
}
export function calculateIBS(position, stages) {
  const {average, held, capacity}=position;
  if (![average,held,capacity].every(n=>Number.isFinite(Number(n))&&Number(n)>=0) || !Number.isInteger(Number(held)) || !Number.isInteger(Number(capacity))) return {error:'평단가와 수량을 확인해 주세요.'};
  const sorted=[...stages].sort((a,b)=>a.upper-b.upper);
  if (!sorted.length) return {error:'이 종목의 전략을 먼저 설정해 주세요.'};
  if (sorted.some((s,i)=>!Number.isFinite(Number(s.upper))||s.upper<=0||s.upper>100||(i>0&&Number(s.upper)===Number(sorted[i-1].upper))) || Number(sorted.at(-1).upper)!==100) return {error:'구간 상한은 서로 다른 0~100% 값이어야 하고 마지막은 100%여야 합니다.'};
  if(sorted.some(s=>s.rules.some(r=>!Number.isFinite(Number(r.percent))||Number(r.percent)<=-100||!Number.isFinite(Number(r.offset))||!Number.isFinite(Number(r.divisor))||(r.mode==='fixed'?r.divisor<0||!Number.isInteger(Number(r.divisor)):r.divisor<=0)))) return {error:'매매 비율과 수량 계산 값을 확인해 주세요.'};
  const ratio=Number(held)+Number(capacity)>0 ? Number(held)/(Number(held)+Number(capacity))*100 : 0;
  // Each boundary belongs to the next stage; 100% stays in the final stage.
  const stage=sorted.find(s=>ratio<s.upper)||sorted.at(-1);
  let sold=0,bought=0;
  const orders=stage.rules.map(r=>{
    let quantity=r.mode==='remaining'?Number(held)-sold:r.mode==='fixed'?Number(r.divisor):round((r.mode==='held'?Number(held):Number(capacity))/Number(r.divisor));
    if(r.special==='small-first'&&held<=3) quantity=held>0?1:0;
    if(r.special==='small-second'&&held<=3) quantity=held>1?1:0;
    const raw=quantity;
    quantity=Math.max(0,Math.min(Number.isFinite(quantity)?quantity:0,r.side==='sell'?Number(held)-sold:Number(capacity)-bought));
    if(r.side==='sell') sold+=quantity; else bought+=quantity;
    return {...r,quantity,capped:raw!==quantity,price:r.order==='moc'?null:round(round(Number(average)*(1+Number(r.percent)/100),2)+Number(r.offset),2)};
  });
  return {ratio,stage,orders,error:Number(average)<=0?'평단가를 입력해 주세요.':orders.some(r=>r.price!==null&&r.price<=0)?'가격 보정 후 주문 가격이 0 이하입니다. 규칙을 확인해 주세요.':null};
}
export function calculateVR(p, close, weeklyClose, fx) {
  const cash=Number(p.krwCash)+Number(p.fxCash), total=cash+Number(p.valuation);
  if (![p.krwCash,p.fxCash,p.valuation,p.desired,p.lower,p.upper,p.invest].every(n=>Number.isFinite(Number(n))&&Number(n)>=0)||!(p.lower<p.upper&&p.upper<=100&&p.invest>0&&p.invest<=100)||!Number.isInteger(Number(p.desired))) return {error:'금액, 구매 수량과 비율 범위를 확인해 주세요.'};
  if (!(close>0&&fx>0&&weeklyClose>0)) return {error:'종가·지난주 종가·환율을 불러오면 계산됩니다.'};
  const ratio=total>0?cash/total*100:0, price=close*fx;
  const action=total===0?'유지':ratio<p.lower?'매도':ratio>p.upper?'매수':'유지';
  const quantity=action==='매도'?Math.ceil((p.lower/100*total-cash)/price):action==='매수'?Math.ceil((cash-p.upper/100*total)/price):0;
  return {cash,total,ratio,action,quantity,deposit:round(weeklyClose*fx/(p.invest/100),-4)*p.desired,price};
}
