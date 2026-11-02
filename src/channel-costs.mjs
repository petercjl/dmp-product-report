import {createHash} from 'node:crypto';

export const channels=[['keyword','关键词推广'],['wholeSite','货品全站推'],['audience','人群推广'],['content','内容运营'],['leads','线索推广']].map(([id,label])=>({id,label}));
const money=n=>Math.round((n+Number.EPSILON)*100)/100;
const valid=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
export function channelCosts(raw,itemId,period){
 const missing={status:'unavailable',unit:'CNY',totals:null,observedTotals:null,daily:[],coverage:null};
 if(!raw)return missing;
 if(raw.period?.startDate!==period.start||raw.period?.endDate!==period.end||raw.items?.length!==1||raw.items[0].itemId!==itemId)throw Error('COST_ID_DATE_MISMATCH');
 const c=raw.items[0].costs,q=c?.source?.request?.query;
 if(q&&(String(q.successItemId)!==itemId||q.startDate!==period.start||q.endDate!==period.end))throw Error('COST_TARGET_FILTER_MISMATCH');
 if(!q)return {...missing,reason:'identity-unverified'};
 const sourceHash=createHash('sha256').update(JSON.stringify(raw)).digest('hex');
 if(c?.unit!=='CNY')return {...missing,reason:'unit-unverified',sourceHash};
 const expected=[];for(let t=Date.parse(period.start+'T00:00:00Z');t<=Date.parse(period.end+'T00:00:00Z');t+=86400000)expected.push(new Date(t).toISOString().slice(0,10));
 const seen=new Set(),sums=Object.fromEntries(channels.map(c=>[c.id,0])),daily=[],duplicates=[],outside=[],invalid=[];
 for(const row of c.daily??[]){
  if(!expected.includes(row.date)){outside.push(row.date);continue;}
  if(seen.has(row.date)){duplicates.push(row.date);continue;}seen.add(row.date);
  if(!channels.every(c=>valid(row.values?.[c.id]))){invalid.push(row.date);continue;}
  const values=Object.fromEntries(channels.map(c=>[c.id,row.values[c.id]]));
  for(const c of channels)sums[c.id]+=values[c.id];
  daily.push({date:row.date,values,total:money(Object.values(values).reduce((a,b)=>a+b,0))});
 }
 const missingDates=expected.filter(d=>!daily.some(r=>r.date===d)),coverage={requestedDays:expected.length,validDays:daily.length,missingDates,duplicateDates:duplicates,outsideDates:outside,invalidDates:invalid};
 const declared=c.coverage??{},providerClean=['missingDates','duplicateDates','outsideDates','invalidRows','missingFields'].every(k=>!declared[k]?.length);
 const complete=c.status==='complete'&&providerClean&&daily.length===expected.length&&!duplicates.length&&!outside.length&&!invalid.length;
 const observedTotals=daily.length?{...Object.fromEntries(channels.map(c=>[c.id,money(sums[c.id])])),total:money(Object.values(sums).reduce((a,b)=>a+b,0))}:null;
 return {status:complete?'returned':daily.length?'partial':'unavailable',unit:'CNY',totals:complete?observedTotals:null,observedTotals,daily,coverage,sourceHash};
}
