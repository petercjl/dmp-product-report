(()=>{'use strict';const el=document.querySelector('#portrait-data');if(!el)return;const profile=JSON.parse(el.textContent),tabs=document.querySelector('.portrait-tabs'),brief=document.querySelector('#portrait-brief'),charts=document.querySelector('#portrait-charts'),compare=document.querySelector('#portrait-compare');
const palette=['#476cdb','#8ca5ea','#e5ae65','#8cbaad','#b79cce','#b7c4d9','#d3d9e3','#d9bfaf'];
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rich=x=>esc(x).replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>');
const num=x=>Number(x).toLocaleString('zh-CN'),percent=x=>Number.isFinite(x)?(x*100).toFixed(2)+'%':'未返回';
const rate=r=>r.platformRate!==null&&r.platformRate!==''&&Number.isFinite(Number(r.platformRate))?Number(r.platformRate):null;
const color=(d,r)=>r.label==='未知'?'#d3d9e3':palette[[...new Set(profile.behaviors.flatMap(b=>b.dimensions.filter(x=>x.id===d.id).flatMap(x=>x.rows.filter(v=>v.label!=='未知').map(v=>v.label))))].sort().indexOf(r.label)%palette.length];
const dim=(b,id)=>b.dimensions.find(d=>d.id===id),top=d=>d?.rows.filter(r=>r.label!=='未知').sort((a,b)=>b.count-a.count)[0];
function orderedRows(d){
 const rank=r=>{
  if(r.label==='未知'||r.optionValue==='unknown')return 9999;
  if(d.id==='consumption')return Number(r.label.match(/L(\d+)/i)?.[1]??999);
  if(d.id==='age')return Number(r.label.match(/\d+/)?.[0]??999);
  if(d.id==='city')return ['一线城市','准一线城市','二线城市','三线城市','四线城市','五线城市'].indexOf(r.label)<0?999:['一线城市','准一线城市','二线城市','三线城市','四线城市','五线城市'].indexOf(r.label);
  if(d.id==='gender')return ['女性用户','男性用户'].indexOf(r.label)<0?999:['女性用户','男性用户'].indexOf(r.label);
  return 999;
 };
 return [...d.rows].sort((a,b)=>rank(a)-rank(b)||a.label.localeCompare(b.label,'zh-CN'));
}
function chart(d){
 if(!d)return '';
 const label=esc(d.label),head=`<div class="portrait-chart-head"><h3>${label}</h3><small>${d.multiLabel?'标签可重叠':'含未知分类'}</small></div>`;
 if(d.status!=='returned'||!(d.countSum>0))return `<article class="portrait-chart">${head}<p class="portrait-missing">${d.status==='empty'?'平台返回空列表':d.status==='returned'?'返回人数为0，无法计算构成':'画像未取得'}</p></article>`;
 if(d.multiLabel){const max=Math.max(...d.rows.map(r=>rate(r)??0),.01);return `<article class="portrait-chart portrait-tags">${head}${d.rows.map(r=>`<div class="portrait-bar-row"><span>${esc(r.label)}</span><div class="portrait-bar-track"><div class="portrait-bar-fill" style="width:${Math.max(0,rate(r)??0)/max*100}%"></div></div><b>${percent(rate(r))} · ${num(r.count)}</b></div>`).join('')}<p class="portrait-rate-note">条形使用平台原始占比，可能合计超过100%；标签计数合计 ${num(d.countSum)}，不作为去重人数。</p></article>`;}
 const rows=orderedRows(d);
 const peak=Math.max(...rows.map(r=>r.count/d.countSum*100));
 // Four equal intervals, rounded to a readable step with headroom above the peak.
 const target=peak*1.12/4, magnitude=10**Math.floor(Math.log10(target||1));
 const step=[1,1.25,1.5,2,2.5,3,4,5,7.5,10].map(n=>n*magnitude).find(n=>n>=target)??10*magnitude;
 const axisMax=Math.min(100,step*4),ticks=[4,3,2,1,0].map(n=>n*axisMax/4);

 const axisLabel=r=>d.id==='consumption'?r.label.replace('购买力',''):d.id==='city'?r.label.replace('城市',''):r.label.replace('用户','');
 return `<article class="portrait-chart" data-dimension="${esc(d.id)}">${head}<div class="portrait-column-chart" data-axis-max="${axisMax}" aria-label="${label}构成占比，返回人数${d.countSum}"><div class="portrait-y-axis" aria-hidden="true">${ticks.map(v=>`<span style="top:${(1-v/axisMax)*100}%">${Number(v.toFixed(6))}%</span>`).join('')}</div><div class="portrait-columns" style="--columns:${rows.length}">${rows.map(r=>{const share=r.count/d.countSum;return `<div class="portrait-column" data-category="${esc(r.label)}" data-share="${share}"><div class="portrait-column-plot"><div class="portrait-column-bar" style="height:${share*100/axisMax*100}%;background:${color(d,r)}"><b class="portrait-column-value">${percent(share)}</b></div></div><div class="portrait-column-label">${esc(axisLabel(r))}</div><div class="portrait-column-count">${num(r.count)}人</div></div>`;}).join('')}</div></div><p class="portrait-rate-note">返回人数 ${num(d.countSum)} · 占比含未知分类</p></article>`;

}
function show(id){const b=profile.behaviors.find(b=>b.id===id);if(!b)return;tabs.querySelectorAll('button').forEach(t=>{const on=t.dataset.audienceType===id;t.setAttribute('aria-selected',String(on));t.tabIndex=on?0:-1;});const a=profile.analyses[id];brief.innerHTML=a?`<div class="business-kicker">${esc(a.label)} · 读取于 ${esc(b.fetchedAt?new Date(b.fetchedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+'（北京时间）':'未知')}</div><h3>${esc(a.conclusion)}</h3><ol>${a.evidence.map(e=>`<li>${rich(e)}</li>`).join('')}</ol><p class="business-note">${esc(a.note)}</p>`:'<p>画像尚未取得</p>';charts.innerHTML=b.dimensions.length?b.dimensions.map(chart).join(''):'<p class="portrait-missing">该行为人群尚未采集。</p>';document.querySelector('#portrait-active').setAttribute('aria-labelledby','portrait-tab-'+id);}
tabs.innerHTML=profile.behaviors.map((b,i)=>`<button id="portrait-tab-${esc(b.id)}" role="tab" aria-controls="portrait-active" aria-selected="${i===0}" data-audience-type="${esc(b.id)}">${esc(b.label)}人群<small>${dim(b,'gender')?.countSum??'—'}人</small></button>`).join('');
tabs.querySelectorAll('button').forEach((b,i)=>{b.onclick=()=>show(b.dataset.audienceType);b.onkeydown=e=>{const all=[...tabs.querySelectorAll('button')];let next;if(e.key==='ArrowRight')next=(i+1)%all.length;if(e.key==='ArrowLeft')next=(i+all.length-1)%all.length;if(e.key==='Home')next=0;if(e.key==='End')next=all.length-1;if(next!==undefined){e.preventDefault();all[next].click();all[next].focus();}};});
compare.innerHTML='<thead><tr><th>行为</th><th>返回人数¹</th><th>主要性别</th><th>主要年龄</th><th>主要购买力</th><th>主要城市</th></tr></thead><tbody>'+profile.behaviors.map(b=>`<tr><td>${esc(b.label)}</td><td>${dim(b,'gender')?.countSum??'未取得'}</td>${['gender','age','consumption','city'].map(id=>{const d=dim(b,id),r=top(d);return `<td>${r?esc(r.label)+' '+percent(r.count/d.countSum):'未返回'}</td>`;}).join('')}</tr>`).join('')+'</tbody>';compare.insertAdjacentHTML('afterend','<p class="portrait-rate-note">¹ 人数取性别维度返回分类之和；表内各特征分别取该维度占比最高的已知分类。</p>');show('purchase');})();
