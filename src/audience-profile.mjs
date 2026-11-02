export const audienceTypes=['purchase','browse','favorite','cart','search'];
export const audienceDimensions=['gender','age','consumption','city','segments'];
const labels={purchase:'购买',browse:'浏览',favorite:'收藏',cart:'加购',search:'搜索'};
const pct=x=>(x*100).toFixed(2)+'%';
export function buildAudienceProfile(itemId,reports){
  const behaviors=audienceTypes.map(type=>{
    const raw=reports.find(r=>r?.audienceType===type);
    if(!raw)return {id:type,label:labels[type],status:'not-collected',dimensions:[]};
    if(raw.audienceVersion!==1||raw.itemId!==itemId||raw.period?.days!==30||raw.period?.type!=='rolling')throw Error('AUDIENCE_ID_PERIOD_MISMATCH');
    if(new Set(raw.dimensions.map(d=>d.id)).size!==raw.dimensions.length||raw.dimensions.some(d=>!audienceDimensions.includes(d.id)))throw Error('AUDIENCE_DIMENSION_MISMATCH');
    for(const d of raw.dimensions){
      if(d.rows.some(r=>!Number.isFinite(r.count)||r.count<0)||d.status==='returned'&&(!d.rows.length||Math.abs(d.countSum-d.rows.reduce((n,r)=>n+r.count,0))>1e-8))throw Error('AUDIENCE_COUNT_MISMATCH');
    }
    return {id:type,label:labels[type],status:raw.status==='complete'&&audienceDimensions.every(id=>raw.dimensions.some(d=>d.id===id&&['returned','empty'].includes(d.status)))?'complete':'partial',fetchedAt:raw.finishedAt??raw.startedAt,period:raw.period,dimensions:raw.dimensions.map(({source,...d})=>({...d,source:{fetchedAt:source?.fetchedAt,path:source?.request?.path}}))};
  });
  const analyses=Object.fromEntries(behaviors.map(b=>{
    const best=id=>b.dimensions.find(d=>d.id===id)?.rows.filter(r=>r.label!=='未知').sort((a,b)=>b.count-a.count)[0];
    const top=['gender','age','consumption','city'].map(best),total=b.dimensions.find(d=>d.id==='gender')?.countSum;
    const evidence=[];
    for(const ids of [['gender','age'],['consumption','city']]){
      const text=ids.map(id=>{const r=best(id),d=b.dimensions.find(d=>d.id===id);return r&&d.countSum>0?`**${r.label}** ${r.count}人，占本维度${pct(r.count/d.countSum)}（分母${d.countSum}人）`:null;}).filter(Boolean).join('；');if(text)evidence.push(text+'。');
    }
    const s=best('segments');if(s)evidence.push(`策略标签以**${s.label}**最多，${s.count}个标签计数，平台占比${Number.isFinite(Number(s.platformRate))&&s.platformRate!==null?pct(Number(s.platformRate)):'未返回'}；标签可能重叠。`);
    if(!evidence.length)evidence.push('当前行为未返回可解读画像，保留空结果及来源状态。');
    const available=top.filter(Boolean);
    return [b.id,{label:`近30天${b.label}人群特征`,conclusion:available.length?`${b.label}人群的主要特征：${available.map(r=>r.label).join('、')}。`:'画像数据不足，暂不能判断。',evidence,note:`性别维度返回${total??'未知'}人；各维度是独立分布，不能推断这些特征属于同一批人。滚动窗口日期未回显；行为之间不直接计算转化率。`}];
  }));
  return {version:1,itemId,days:30,periodType:'rolling',actualDatesVerified:false,status:behaviors.every(b=>b.status==='complete')?'complete':'partial',behaviors,analyses};
}
