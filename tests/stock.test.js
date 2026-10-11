import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultStages,emptyPosition,calculateIBS,calculateStageOrders,calculateVR,getVRCycle,createStock,inspectVRSettings,applyVRSettings,saveSharedVRSettings,updateStockPosition,retireSOXL,migrateOrderTypes,getStageHighlight} from '../src/stock/model.js';
import {parseChart} from '../scripts/stock-market.js';
import {normalizeState,createBackupPayload,splitBackupPayload} from '../src/dashboard/model.js';

const withOtherAsset=()=>{
 const stock=createStock();
 stock.assets.push({id:'other-asset',symbol:'QQQ',stages:[]});
 return stock;
};

test('new Stock state contains only TQQQ with the spreadsheet strategy',()=>{
 const stock=createStock();
 assert.deepEqual(stock.assets.map(asset=>asset.symbol),['TQQQ']);
 assert.equal(stock.assets[0].stages.length,8);
 assert.equal(stock.profiles.length,2);
 assert.equal(retireSOXL(stock),stock);
 for(const stage of stock.assets[0].stages) {
  assert.ok(stage.rules.filter(rule=>rule.side==='buy').every(rule=>rule.order==='loc'));
  assert.deepEqual(stage.rules.filter(rule=>rule.side==='sell').map(rule=>rule.order),['loc','loc','limit']);
 }
 assert.equal(migrateOrderTypes(stock),stock);
});

test('legacy and restored TQQQ order types migrate once without replacing inputs or strategy edits',()=>{
 const stock=withOtherAsset(), asset=stock.assets[0];
 delete asset.orderTypesVersion;
 for(const stage of asset.stages) stage.rules=stage.rules.map(rule=>({...rule,order:'limit'}));
 asset.stages[7].rules[0].order='moc';
 asset.stages[0].rules[0].percent=-8;
 asset.stages[0].rules.at(-1).row=2;
 asset.stages[0].rules.splice(4,1); // Sparse sell row 2 must not shift the limit order into LOC.
 asset.vr={lower:20,upper:40,invest:60};
 stock.profiles[0].positions[asset.id]={...emptyPosition(),average:78.68,held:9,capacity:31};
 stock.profiles[1].positions[asset.id]={...emptyPosition(),average:100,held:95,capacity:5};
 const before=structuredClone(stock), migrated=migrateOrderTypes(stock), upgraded=migrated.assets[0];
 assert.deepEqual(stock,before);
 assert.equal(migrated.profiles,stock.profiles);
 assert.equal(migrated.assets[1],stock.assets[1]);
 assert.equal(upgraded.id,asset.id);
 assert.equal(upgraded.vr,asset.vr);
 assert.equal(upgraded.orderTypesVersion,1);
 const withoutOrder=rule=>{ const {order,...fields}=rule;return fields; };
 assert.deepEqual(upgraded.stages.map(stage=>({...stage,rules:stage.rules.map(withoutOrder)})),asset.stages.map(stage=>({...stage,rules:stage.rules.map(withoutOrder)})));
 assert.equal(upgraded.stages[0].rules.at(-1).order,'limit');
 const result=calculateIBS(stock.profiles[1].positions[asset.id],upgraded.stages);
 assert.deepEqual(result.orders.map(rule=>[rule.order,rule.price,rule.quantity]),[['loc',100,12],['loc',90,12],['limit',100,71]]);
 assert.equal(migrateOrderTypes(migrated),migrated);
 const restored=normalizeState(splitBackupPayload(JSON.parse(JSON.stringify(createBackupPayload(normalizeState({stock:before}),[],null)))).state);
 assert.deepEqual(migrateOrderTypes(restored.stock),migrated);
 upgraded.stages[7].rules[0].order='moc'; // A later explicit editor choice survives reload and backup restore.
 const saved=normalizeState(splitBackupPayload(JSON.parse(JSON.stringify(createBackupPayload(normalizeState({stock:migrated}),[],null)))).state);
 assert.equal(migrateOrderTypes(saved.stock),saved.stock);
 assert.equal(saved.stock.assets[0].stages[7].rules[0].order,'moc');
});

test('IBS matches the spreadsheet example and corrected stage six',()=>{
 const stages=defaultStages();
 const a=calculateIBS({...emptyPosition(),average:78.68,held:9,capacity:31},stages);
 assert.equal(a.ratio,22.5);
 assert.deepEqual(a.orders.map(r=>[r.price,r.quantity]),[[73.96,1],[78.68,1],[81.03,2],[81.04,1],[84.19,1],[88.12,7]]);
 const six=calculateIBS({...emptyPosition(),average:100,held:65,capacity:35},stages);
 assert.equal(six.orders.at(-1).price,105);
 assert.equal(calculateIBS({...emptyPosition(),average:100,held:40,capacity:60},stages).stage.name,'2단계');
});
test('zero holdings cannot produce a sell and quantity totals never exceed holdings',()=>{
 for(let held=0;held<20;held++){
 const r=calculateIBS({...emptyPosition(),average:100,held,capacity:10},defaultStages());
 assert.ok(r.orders.filter(x=>x.side==='sell').reduce((a,x)=>a+x.quantity,0)<=held);
 assert.ok(r.orders.filter(x=>x.side==='buy').reduce((a,x)=>a+x.quantity,0)<=10);
 }
 assert.ok(calculateIBS({...emptyPosition(),average:1},[]).error);
});

test('spreadsheet small-lot corrections and remaining quantities work with LOC and limit orders',()=>{
 const stages=defaultStages();
 for(const [held,quantities] of [[1,[1,0,0]],[2,[1,1,0]],[3,[1,1,1]]]) {
  const result=calculateIBS({...emptyPosition(),average:100,held,capacity:100},stages);
  assert.deepEqual(result.orders.filter(order=>order.side==='sell').map(order=>order.quantity),quantities);
 }
 const final=calculateIBS({...emptyPosition(),average:100,held:95,capacity:5},stages);
 assert.deepEqual(final.orders.map(order=>[order.order,order.price,order.quantity]),[['loc',100,12],['loc',90,12],['limit',100,71]]);
 const moc=structuredClone(stages);
 moc[7].rules[0].order='moc';
 assert.deepEqual(calculateIBS({...emptyPosition(),average:100,held:95,capacity:5},moc).orders.map(order=>[order.price,order.quantity]),[[null,12],[90,12],[100,71]]);
});

test('two displayed positions stay isolated across edits and asset switches',()=>{
 const stock=withOtherAsset(), [asset,otherAsset]=stock.assets, [a,y]=stock.profiles;
 a.positions[asset.id]={...emptyPosition(),average:78.68,held:9,capacity:31,valuation:1200000};
 y.positions[asset.id]={...emptyPosition(),average:60,held:12,capacity:28};
 const before=structuredClone(stock);
 const edited=updateStockPosition(stock,a.id,asset.id,{held:10});
 const switched=updateStockPosition(edited,a.id,otherAsset.id,{average:40,held:2,capacity:8});
 assert.deepEqual(stock,before);
 assert.deepEqual(switched.profiles[1],before.profiles[1]);
 assert.deepEqual(switched.profiles[0].positions[asset.id],{...before.profiles[0].positions[asset.id],held:10});
 assert.equal(switched.profiles[0].positions[otherAsset.id].average,40);
 assert.deepEqual(switched.profiles.map(profile=>profile.id),before.profiles.map(profile=>profile.id));
 assert.equal(updateStockPosition(stock,'missing',asset.id,{held:99}),stock);
});

test('one asset strategy edit changes both calculations independently of the other asset',()=>{
 const stock=withOtherAsset(), asset=stock.assets[0];
 const positions=[{...emptyPosition(),average:100,held:9,capacity:31},{...emptyPosition(),average:200,held:3,capacity:37}];
 const changed=structuredClone(asset.stages);
 changed[0].rules[0].percent=-8;
 const original=positions.map(position=>calculateIBS(position,asset.stages));
 const results=positions.map(position=>calculateIBS(position,changed));
 assert.deepEqual(original.map(result=>result.orders[0].price),[94,188]);
 assert.deepEqual(results.map(result=>result.orders[0].price),[92,184]);
 assert.deepEqual(results.map(result=>result.orders.map(order=>order.id)),original.map(result=>result.orders.map(order=>order.id)));
 assert.deepEqual(stock.assets[1].stages,[]);
 assert.equal(asset.stages[0].rules[0].percent,-6);
});
test('VR uses KRW cash, last week for contribution and latest close for rebalancing',()=>{
 const p={...emptyPosition(),krwCash:600000,fxCash:200000,valuation:2165594};
 const r=calculateVR(p,81.28,81.01,1340.64);
 assert.equal(r.action,'유지');assert.equal(r.deposit,160000);
 assert.equal(calculateVR({...p,fxCash:20000000},81.28,81.01,1340.64).quantity,116);
 assert.ok(calculateVR({...p,lower:40,upper:35},81,81,1300).error);
 assert.ok(calculateVR(p,null,81,1300).error);
});

test('separate strategy tables calculate each account using the same unrounded rules',()=>{
 const stage=defaultStages()[0];
 const a=calculateStageOrders({...emptyPosition(),average:100,held:9,capacity:31},stage);
 const y=calculateStageOrders({...emptyPosition(),average:200,held:30,capacity:90},stage);
 assert.deepEqual(a.slice(0,3).map(order=>[order.price,order.quantity]),[[94,1],[100,1],[102.99,2]]);
 assert.deepEqual(y.slice(0,3).map(order=>[order.price,order.quantity]),[[188,3],[200,3],[205.99,5]]);
 assert.equal(stage.rules[0].divisor,30);
});

test('VR holdings independently compute valuation with latest close and exchange rate',()=>{
 const p={...emptyPosition(),held:999,vrHeld:20,krwCash:600000,fxCash:200000,valuation:123,desired:2};
 const before=structuredClone(p), result=calculateVR(p,80,75,1300);
 assert.equal(result.valuation,2080000);
 assert.equal(result.total,2880000);
 assert.equal(result.ratio,800000/2880000*100);
 assert.equal(result.deposit,280000);
 assert.equal(calculateVR({...p,held:0},80,75,1300).valuation,result.valuation);
 assert.equal(calculateVR(p,90,75,1300).valuation,2340000);
 assert.equal(calculateVR(p,80,75,1400).valuation,2240000);
 assert.deepEqual(p,before);
 const withoutWeekly=calculateVR(p,80,null,1300);
 assert.equal(withoutWeekly.valuation,result.valuation);
 assert.equal(withoutWeekly.action,result.action);
 assert.equal(withoutWeekly.deposit,null);
 assert.ok(withoutWeekly.depositError);
 for(const vrHeld of ['', ' ', null, undefined, false, -1,1.5,'bad']) assert.ok(calculateVR({...p,vrHeld},80,75,1300).error);
 assert.equal(calculateVR({...p,vrHeld:0},80,75,1300).valuation,0);
});

test('VR adjustment buys respect the cash budget in whole shares without limiting sells or deposits',()=>{
 const p={...emptyPosition(),vrHeld:0,krwCash:1000000,upper:5,lower:1,desired:2};
 const before=structuredClone(p), result=calculateVR(p,100,100,1000);
 assert.equal(result.action,'매수');
 assert.equal(result.targetQuantity,10);
 assert.equal(result.cashUseLimit,75);
 assert.equal(result.cashBudget,750000);
 assert.equal(result.quantity,7);
 assert.equal(result.capped,true);
 assert.ok(result.quantity*result.price<=result.cashBudget);
 assert.ok(result.cash-result.quantity*result.price>=result.cash*.25);
 assert.equal(calculateVR({...p,cashUseLimit:50},100,100,1000).quantity,5);
 assert.equal(calculateVR({...p,cashUseLimit:0},100,100,1000).quantity,0);
 const uncapped=calculateVR({...p,cashUseLimit:100},100,100,1000);
 assert.equal(uncapped.quantity,10);
 assert.equal(uncapped.capped,false);
 assert.equal(result.deposit,uncapped.deposit);
 const expensive=calculateVR({...p,krwCash:90000,lower:25,upper:35},100,100,1000);
 assert.equal(expensive.quantity,0);
 assert.equal(expensive.capped,true);
 const sell=calculateVR({...p,krwCash:0,vrHeld:10,lower:25,upper:35,cashUseLimit:0},100,100,1000);
 assert.equal(sell.action,'매도');
 assert.equal(sell.quantity,3);
 assert.equal(sell.capped,false);
 for(const cashUseLimit of ['',null,-1,101,'bad']) assert.ok(calculateVR({...p,cashUseLimit},100,100,1000).error);
 assert.deepEqual(p,before);
});

test('VR settings supply the new cash cap for legacy data and contribution split remains editable',()=>{
 const stock=createStock(), asset=stock.assets[0];
 const position={krwCash:1000000,fxCash:0,valuation:0,desired:1,lower:25,upper:35,invest:70};
 asset.vr={lower:25,upper:35,invest:70};
 stock.profiles[0].positions[asset.id]=position;
 const before=structuredClone(stock);
 assert.equal(inspectVRSettings(asset,stock.profiles).settings.cashUseLimit,75);
 assert.equal(applyVRSettings(position,asset).cashUseLimit,75);
 assert.equal(calculateVR(position,100,100,1000).cashUseLimit,75);
 const saved=saveSharedVRSettings(stock,asset.id,{lower:25,upper:35,invest:60,cashUseLimit:50});
 assert.equal(calculateVR(applyVRSettings(position,saved.assets[0]),100,100,1000).deposit,170000);
 assert.deepEqual(saved.assets[0].vr,{lower:25,upper:35,invest:60,cashUseLimit:50});
 assert.deepEqual(saved.profiles,before.profiles);
 assert.deepEqual(stock,before);
});

test('VR week alternation uses October 5 as contribution anchor including weekends and year boundaries',()=>{
 assert.deepEqual(getVRCycle('2026-10-05'),{mode:'contribution',start:'2026-10-05',end:'2026-10-09'});
 assert.deepEqual(getVRCycle('2026-10-11'),getVRCycle('2026-10-05'));
 assert.deepEqual(getVRCycle('2026-10-12'),{mode:'rebalance',start:'2026-10-12',end:'2026-10-16'});
 assert.equal(getVRCycle('2026-10-19').mode,'contribution');
 assert.equal(getVRCycle('2026-09-28').mode,'rebalance');
 assert.deepEqual(getVRCycle('2027-01-01'),{mode:'contribution',start:'2026-12-28',end:'2027-01-01'});
 assert.equal(getVRCycle('2027-01-04').mode,'rebalance');
 assert.equal(getVRCycle('invalid'),null);
});

test('legacy differing VR settings are detected and keep their original calculations',()=>{
 const stock=createStock(), asset=stock.assets[0], [a,y]=stock.profiles;
 const amounts={krwCash:400000,fxCash:0,valuation:600000};
 a.positions[asset.id]={...emptyPosition(),...amounts};
 y.positions[asset.id]={...emptyPosition(),...amounts,upper:45,invest:80};
 const before=structuredClone(stock), inspected=inspectVRSettings(asset,stock.profiles);
 assert.equal(inspected.shared,false);
 assert.equal(inspected.conflict,true);
 assert.deepEqual(inspected.settings,{lower:25,upper:35,invest:70,cashUseLimit:75});
 assert.deepEqual(inspected.legacy.map(entry=>entry.profileId),[a.id,y.id]);
 assert.deepEqual(stock.profiles.map(profile=>calculateVR(applyVRSettings(profile.positions[asset.id],asset),100,100,1000).action),['매수','유지']);
 assert.deepEqual(stock,before);
 y.positions[asset.id]={...y.positions[asset.id],lower:'25',upper:'35',invest:'70'};
 assert.equal(inspectVRSettings(asset,stock.profiles).conflict,false);
});

test('legacy VR numeric strings calculate numerically without changing stored positions',()=>{
 const stock=createStock(), asset=stock.assets[0], [a,y]=stock.profiles;
 a.positions[asset.id]={...emptyPosition(),krwCash:100000,valuation:900000,lower:'2',upper:'15',invest:'70'};
 y.positions[asset.id]={...emptyPosition(),lower:2,upper:15,invest:70};
 const before=structuredClone(stock), position=applyVRSettings(a.positions[asset.id],asset);
 assert.deepEqual(inspectVRSettings(asset,stock.profiles).settings,{lower:2,upper:15,invest:70,cashUseLimit:75});
 assert.equal(inspectVRSettings(asset,stock.profiles).conflict,false);
 const result=calculateVR(position,100,100,1000);
 assert.equal(result.error,undefined);
 assert.equal(result.action,'유지');
 assert.equal(result.deposit,140000);
 assert.deepEqual(stock,before);
 assert.equal(a.positions[asset.id].lower,'2');
});

test('saving shared VR settings affects both calculations without overwriting legacy positions',()=>{
 const stock=withOtherAsset(), [asset,otherAsset]=stock.assets, [a,y]=stock.profiles;
 a.positions[asset.id]={...emptyPosition(),krwCash:400000,valuation:600000,average:100,held:6,capacity:4};
 y.positions[asset.id]={...emptyPosition(),krwCash:800000,valuation:1200000,upper:45,invest:80,desired:2};
 const before=structuredClone(stock), settings={lower:20,upper:30,invest:50,cashUseLimit:50};
 const saved=saveSharedVRSettings(stock,asset.id,settings), savedAsset=saved.assets[0];
 assert.deepEqual(saved.profiles,before.profiles);
 assert.deepEqual(stock,before);
 assert.equal(saved.assets[1],otherAsset);
 assert.equal(savedAsset.id,asset.id);
 assert.deepEqual(savedAsset.stages,asset.stages);
 assert.deepEqual(inspectVRSettings(savedAsset,saved.profiles),{shared:true,conflict:false,settings,legacy:inspectVRSettings(asset,stock.profiles).legacy});
 const positions=saved.profiles.map(profile=>applyVRSettings(profile.positions[asset.id],savedAsset));
 assert.deepEqual(positions.map(position=>({lower:position.lower,upper:position.upper,invest:position.invest,cashUseLimit:position.cashUseLimit})),[settings,settings]);
 assert.equal(positions[0].average,100);
 assert.equal(positions[1].desired,2);
 assert.deepEqual(positions.map(position=>calculateVR(position,100,100,1000).quantity),[1,2]);
 assert.deepEqual(positions.map(position=>calculateVR(position,100,100,1000).deposit),[200000,400000]);
 assert.equal(saveSharedVRSettings(stock,'missing',settings),stock);
});

test('retiring SOXL preserves archived configuration and every account position idempotently',()=>{
 const stock=withOtherAsset(), soxl={id:'legacy-soxl',symbol:'SOXL',stages:defaultStages(),vr:{lower:20,upper:40,invest:60},custom:{memo:'preserve'}};
 stock.assets.splice(1,0,soxl);
 stock.archivedAssets=[{id:'already-archived',symbol:'UPRO',stages:[]},{id:soxl.id,symbol:'SOXL',stages:[],obsolete:true}];
 stock.profiles[0].positions[soxl.id]={...emptyPosition(),average:40,held:12,capacity:30,valuation:500000};
 stock.profiles[1].positions[soxl.id]={...emptyPosition(),average:45,held:3,capacity:8,krwCash:100000};
 const before=structuredClone(stock), retired=retireSOXL(stock);
 assert.deepEqual(retired.assets.map(asset=>asset.symbol),['TQQQ','QQQ']);
 assert.equal(retired.assets[0],stock.assets[0]);
 assert.equal(retired.assets[1],stock.assets[2]);
 assert.equal(retired.profiles,stock.profiles);
 assert.deepEqual(retired.profiles,before.profiles);
 assert.equal(retired.archivedAssets.length,2);
 assert.equal(retired.archivedAssets[0],stock.archivedAssets[0]);
 assert.equal(retired.archivedAssets[1],soxl);
 assert.equal(retireSOXL(retired),retired);
 assert.deepEqual(stock,before);
 const restored=normalizeState(splitBackupPayload(JSON.parse(JSON.stringify(createBackupPayload(normalizeState({stock:retired}),[],null)))).state);
 assert.deepEqual(restored.stock,retired);
 assert.equal(retireSOXL(restored.stock),restored.stock);
});

test('stage highlight maps A and Y to separate columns or an explicit shared overlap',()=>{
 const stages=defaultStages(), makeAccount=(label,held,capacity)=>({label,result:calculateIBS({...emptyPosition(),average:100,held,capacity},stages)});
 const separate=[makeAccount('A',9,31),makeAccount('Y',20,20)];
 assert.equal(getStageHighlight(stages[0].id,separate),'stage-a');
 assert.equal(getStageHighlight(stages[3].id,separate),'stage-y');
 assert.equal(getStageHighlight(stages[1].id,separate),'');
 const shared=[makeAccount('A',9,31),makeAccount('Y',3,37)];
 assert.equal(getStageHighlight(stages[0].id,shared),'stage-both');
 assert.equal(getStageHighlight(stages[1].id,shared),'');
 assert.equal(getStageHighlight(undefined,[{label:'A',result:{}}]),'');
 assert.equal(getStageHighlight(stages[0].id,[{label:'Z',result:shared[0].result}]),'');
});
test('parser excludes incomplete regular session and finds previous week on a holiday',()=>{
 const seconds=s=>Date.parse(s)/1000;
 const json={chart:{result:[{meta:{currentTradingPeriod:{regular:{end:seconds('2026-10-12T20:00:00Z')}}},timestamp:['2026-10-02T13:30:00Z','2026-10-08T13:30:00Z','2026-10-12T13:30:00Z'].map(seconds),indicators:{quote:[{close:[80,81,99]}]}}]}};
 const q=parseChart(json,'TQQQ',new Date('2026-10-12T17:00:00Z'));
 assert.equal(q.close,81);assert.equal(q.weeklyClose,81);assert.equal(q.date,'2026-10-08');
 assert.equal(parseChart(json,'TQQQ',new Date('2026-10-12T20:05:00Z')).close,99);
});
test('stock settings survive existing HUB normalization and backup',()=>{
 let stock=createStock();stock.profiles[0].positions[stock.assets[0].id]={...emptyPosition(),held:9};
 stock.profiles[1].positions[stock.assets[0].id]={...emptyPosition(),average:80,held:12,upper:45,invest:80,vrHeld:33};
 stock.profiles.push({id:'preserved-extra-profile',name:'기존 추가 계좌',positions:{[stock.assets[0].id]:{...emptyPosition(),held:5,custom:'preserved'}}});
 stock=saveSharedVRSettings(stock,stock.assets[0].id,{lower:20,upper:40,invest:60,cashUseLimit:45});
 const restored=normalizeState(splitBackupPayload(JSON.parse(JSON.stringify(createBackupPayload(normalizeState({stock}),[],null)))).state);
 assert.deepEqual(restored.stock,stock);
});
