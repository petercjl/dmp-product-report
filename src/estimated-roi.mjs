// Application estimate: equal target, requested period and mapped channel.
// Cross-endpoint attribution equivalence is not asserted.
export function estimateDirectRoi(amount,spend){
 const missing={kind:'missing',raw:null};
 if(typeof spend!=='number'||!Number.isFinite(spend)||spend<=0)return missing;
 if(!amount||!['exact','range'].includes(amount.kind))return missing;
 const lo=amount.kind==='exact'?amount.value:amount.lower,hi=amount.kind==='exact'?amount.value:amount.upper;
 if(!Number.isFinite(lo)||!Number.isFinite(hi)||lo<0||hi<lo)return missing;
 const lower=lo/spend,upper=hi/spend;
 if(!Number.isFinite(lower)||!Number.isFinite(upper))return missing;
 if(lower===upper)return {kind:'exact',raw:lower,value:lower};
 // Outward-rounded labels contain the full unrounded interval.
 const a=(Math.floor(lower*100)/100).toFixed(2),b=(Math.ceil(upper*100)/100).toFixed(2);
 return {kind:'range',raw:a+'~'+b,lower,upper};
}
