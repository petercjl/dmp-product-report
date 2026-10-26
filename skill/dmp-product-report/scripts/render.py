#!/usr/bin/env python3
"""Independent standard-library renderer for the bundled report template."""
import pathlib,json,html,tempfile,importlib.util,sys,re
from urllib.parse import urlparse
sys.dont_write_bytecode=True
ROOT=pathlib.Path(__file__).resolve().parents[1]
def render(data_path,output):
 d=json.loads(pathlib.Path(data_path).read_text(encoding='utf-8'));out=pathlib.Path(output)
 if out.exists():raise ValueError('OUTPUT_EXISTS')
 if d.get('reportVersion')!=1 or set(d.get('modules',{}))!={'metrics','promotion','crowd'}:raise ValueError('REPORT_SCHEMA')
 esc=lambda x:html.escape(str(x),quote=True)
 def rich_text(text):
  return ''.join('<strong>'+esc(part[2:-2])+'</strong>' if part.startswith('**') and part.endswith('**') else esc(part) for part in re.split(r'(\*\*.*?\*\*)',text))
 def business_html(a):
  if not a.get('conclusion') or not a.get('evidence'):raise ValueError('BUSINESS_INTERPRETATION_REQUIRED')
  return '<article class="business-card"><div class="business-kicker">'+esc(a['label'])+'</div><h3>'+esc(a['conclusion'])+'</h3><ol>'+''.join('<li>'+rich_text(x)+'</li>' for x in a['evidence'])+'</ol>'+('<p class="business-strategy"><b>策略判断：</b>'+esc(a['strategy'])+'</p>' if a.get('strategy') else '')+('<p class="business-note">'+esc(a['note'])+'</p>' if a.get('note') else '')+'</article>'
 frames={}
 with tempfile.TemporaryDirectory(prefix='dmp-render-') as temp:
  for name,vm in d['modules'].items():
   folder=ROOT/'assets/templates'/name;spec=importlib.util.spec_from_file_location('report_'+name,folder/'renderer.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
   src=pathlib.Path(temp)/(name+'.json');dst=pathlib.Path(temp)/(name+'.html');src.write_text(json.dumps(vm,ensure_ascii=False),encoding='utf-8');manifest=json.loads((folder/'manifest.json').read_text());m.render_file(src,dst,cli_version='standalone',pack=manifest)
   embedded=dst.read_text(encoding='utf-8')
   if (name=='metrics' and d.get('metricAnalyses')) or (name=='promotion' and d.get('promotionAnalyses')) or (name=='crowd' and d.get('crowdAnalyses')):
    def emphasis(text):
     return ''.join('<strong>'+esc(part[2:-2])+'</strong>' if part.startswith('**') and part.endswith('**') else esc(part) for part in re.split(r'(\*\*.*?\*\*)',text))
    briefs=''
    sets=d['promotionAnalyses'] if name=='promotion' else {'default':d['metricAnalyses'] if name=='metrics' else d['crowdAnalyses']}
    scene_labels={scene['id']:scene['label'] for scene in vm.get('scenes',[])}
    expected={m['id'] for m in vm['metrics']}
    if set(sets)!=(set(scene_labels) if name=='promotion' else {'default'}) or any(set(items)!=expected for items in sets.values()):raise ValueError('BRIEF_IDENTITY_MISMATCH')
    for scene,items in sets.items():
     for index,(metric,a) in enumerate(items.items()):
      if not a.get('conclusion') or not isinstance(a.get('evidence'),list) or not a['evidence']:raise ValueError('BRIEF_CONTENT_REQUIRED')
      label=(scene_labels.get(scene,'')+' · ' if scene!='default' else '')+'分析结论'
      briefs+='<section class="metric-brief" data-analysis-scene="'+esc(scene)+'" data-analysis-metric="'+esc(metric)+'"'+(' hidden' if index else '')+'><div class="brief-label">'+esc(label)+'</div><h3>'+esc(a['conclusion'])+'</h3><ol>'+''.join('<li>'+emphasis(line)+'</li>' for line in a['evidence'])+'</ol>'+('<p class="brief-note">'+esc(a['note'])+'</p>' if a.get('note') else '')+'</section>'
    periods={p['id']:p for p in d['plan']['periods']}
    scope='；'.join(periods[k]['label']+' '+periods[k]['start']+' 至 '+periods[k]['end'] for k in ['near7','prior7','near30','prior30'])+'；8个完整自然周 '+periods['w1']['start']+' 至 '+periods['w8']['end']+'。'
    boundary={'promotion':'推广日期为请求范围；区间相同或重叠不能确认精确变化，缺失不当作0。','crowd':'日期为请求范围；构成占比以已返回分类之和为分母，平台合计单独核对；比例不取分类或周度简单平均。','metrics':'点击与访问不默认可加，原因判断需要额外证据。'}[name]
    briefs+='<details class="brief-scope"><summary>对照周期与口径</summary><p>'+esc(scope+' '+boundary)+'</p></details>'
    css='<style>.metric-brief{padding:0 0 18px;margin-bottom:18px;border-bottom:1px solid #e5eaf1}.metric-brief .brief-label{font-size:12px;color:#8a98aa;letter-spacing:1px;margin-bottom:7px}.metric-brief h3{font-size:19px;line-height:1.6;margin:0 0 17px;color:#253e5e;font-weight:650}.metric-brief ol{padding-left:23px;margin:0;color:#5b6e88;font-size:14px;line-height:1.9}.metric-brief li{padding-left:4px;margin:9px 0}.metric-brief li::marker{color:#8396b2;font-weight:600}.metric-brief strong{font-weight:650;color:#315bd6}.metric-brief .brief-note{font-size:12px;line-height:1.8;margin:14px 0 0;color:#8391a4}.brief-scope{font-size:12px;color:#8391a4;margin:-5px 0 20px}.brief-scope summary{cursor:pointer}.brief-scope p{line-height:1.8}@media(max-width:700px){.metric-brief h3{font-size:17px}.metric-brief ol{font-size:13px}}@media print{.metric-brief[hidden]{display:block!important}}</style>'
    embedded=embedded.replace('</head>',css+'</head>')
    marker='<div class="dimension-switch" id="dimension-switch"' if name=='metrics' else '<div class="chart-head">'
    embedded=embedded.replace(marker,briefs+marker,1)
    sync="<script>(()=>{const select=document.querySelector('#scene-select');const sync=()=>{const id=document.querySelector('[data-metric][aria-selected=\"true\"]')?.dataset.metric,scene=select?.value||'default';document.querySelectorAll('[data-analysis-metric]').forEach(e=>e.hidden=e.dataset.analysisMetric!==id||e.dataset.analysisScene!==scene);};new MutationObserver(sync).observe(document.querySelector('.tabs'),{subtree:true,attributes:true,attributeFilter:['aria-selected']});select?.addEventListener('change',sync);sync();})();</script>"
    embedded=embedded.replace('</body>',sync+'</body>')
   embedded=embedded.replace('</head>','<style>html{overflow-y:clip}body{overflow-y:visible}</style></head>')
   frames[name]='<iframe scrolling="no" title="'+esc({'metrics':'关键指标对比','promotion':'推广策略对比','crowd':'人群构成对比'}[name])+'" sandbox="allow-scripts allow-same-origin" loading="eager" srcdoc="'+esc(embedded)+'"></iframe>'
 conclusions=''
 for judgment in d['overview']:
  parts=''.join(('<strong>'+esc(s['text'])+'</strong>' if s.get('emphasis')=='strong' else '<em>'+esc(s['text'])+'</em>' if s.get('emphasis')=='italic' else esc(s['text'])) for s in judgment['segments'])
  conclusions+='<article class="judgment '+esc(judgment.get('tone','info'))+'"><h3>'+esc(judgment['title'])+'</h3><p>'+parts+'</p></article>'
 labels={'metrics':'关键指标对比','promotion':'推广策略对比','crowd':'人群构成对比'};panels=''
 for name,label in labels.items():
  analysis=''
  for a in d['analyses'][name]:
   evidence=''.join('<div class="evidence-item"><small>'+esc(e['label'])+'</small><strong>'+esc(e['value'])+'</strong></div>' for e in a.get('evidence',[]))
   findings=''.join('<li>'+esc(x)+'</li>' for x in a.get('findings',[]))
   table=a.get('table');table_html=''
   if table:
    table_html='<div class="analysis-table"><table><thead><tr>'+''.join('<th>'+esc(x)+'</th>' for x in table['columns'])+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+esc(x)+'</td>' for x in row)+'</tr>' for row in table['rows'])+'</tbody></table></div>'
   rich=bool(evidence or findings or table or a.get('note'))
   analysis+='<article'+(' class="analysis-card"' if rich else '')+'><h3>'+esc(a['title'])+'</h3>'+('<div class="analysis-period">'+esc(a['period'])+'</div>' if a.get('period') else '')+'<p>'+esc(a['text'])+'</p>'+('<div class="analysis-evidence">'+evidence+'</div>' if evidence else '')+table_html+('<ul class="analysis-findings">'+findings+'</ul>' if findings else '')+('<div class="analysis-note">'+esc(a['note'])+'</div>' if a.get('note') else '')+'</article>'
  analysis_html=('<div class="analysis"><h2 class="analysis-heading">数据分析</h2><div class="analysis-intro">基于已保存的周期数据 · 事实与待核实事项</div>'+analysis+'</div>') if analysis else ''
  module_data='<div class="frame-wrap">'+frames[name]+'</div>'+analysis_html
  business=d.get('businessInterpretations',{}).get(name)
  if business:module_data=business_html(business)+'<details class="module-detail" open><summary>查看指标图表与逐项证据</summary>'+module_data+'</details>'
  panels+='<section class="report-view" id="view-'+name+'" data-view="'+name+'" hidden><h2>'+label+'</h2>'+module_data+'</section>'
 overview=business_html(d['businessOverview']) if d.get('businessOverview') else '<div class="placeholder"><h3>概览内容待完善</h3></div>'
 if d.get('businessOverview'):overview+='<div class="overview-actions"><button type="button" data-go="metrics">查看经营解读</button><button type="button" data-go="promotion">查看推广解读</button><button type="button" data-go="crowd">查看客群解读</button></div>'

 counts={status:sum(m==status for c in d['coverage'] for m in c['modules'].values()) for status in ['returned','empty','unavailable']}
 coverage='<div class="coverage-table"><table><thead><tr><th>周期</th><th>查询日期</th><th>经营日期</th><th>推广场景</th><th>目标关键词</th><th>人群区间</th><th>人群数值</th></tr></thead><tbody>'
 names={'returned':'有返回','empty':'空结果','unavailable':'查询失败'}
 for c in d['coverage']:
  cells=[c['label'],c['start']+' 至 '+c['end'],'已核对' if c['metricsDateVerified'] else '未核实']+[names.get(c['modules'].get(k),'未执行') for k in ['scenes','keywords','crowdRanges','crowdTable']]
  coverage+='<tr>'+''.join('<td>'+esc(x)+'</td>' for x in cells)+'</tr>'
 coverage+='</tbody></table></div>'
 product=d.get('product') or {'itemId':d['itemId'],'title':None,'shop':{}}
 if product.get('itemId')!=d['itemId']:raise ValueError('PRODUCT_ID_MISMATCH')
 def safe_link(value):
  if not isinstance(value,str):return None
  u=urlparse(value);host=u.hostname or ''
  return value if u.scheme=='https' and not u.username and not u.password and (host=='taobao.com' or host.endswith('.taobao.com') or host=='tmall.com' or host.endswith('.tmall.com')) else None
 images=product.get('images') or ([product.get('image')] if product.get('image') else [])
 thumbs='';first_picture=None
 for i,image in enumerate(images[:5]):
  picture=image.get('dataUrl')
  if picture and not re.fullmatch(r'data:image/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+',picture):raise ValueError('PRODUCT_IMAGE_INVALID')
  if picture:
   if first_picture is None:first_picture=picture
   thumbs+='<button type="button" class="product-thumbnail" aria-label="查看第'+str(i+1)+'张主图" aria-pressed="'+('true' if picture==first_picture else 'false')+'"><img src="'+esc(picture)+'" alt="第'+str(i+1)+'张主图"></button>'
  else:thumbs+='<span class="product-thumbnail missing" title="主图未能嵌入">'+str(i+1)+'</span>'
 image_html='<img class="product-hero" src="'+esc(first_picture)+'" alt="商品主图">' if first_picture else '<span>暂无主图</span>'
 gallery='<div class="product-gallery"><div class="product-image">'+image_html+'</div><div class="product-thumbnails">'+thumbs+'</div></div>'
 shop=product.get('shop') or {};shop_name=shop.get('shopName') or '店铺名称未返回';shop_url=safe_link(shop.get('url'));item_url=safe_link(product.get('itemUrl'))
 links=('<a href="'+esc(item_url)+'" target="_blank" rel="noopener noreferrer">查看商品 ↗</a>' if item_url else '')+('<a href="'+esc(shop_url)+'" target="_blank" rel="noopener noreferrer">进入店铺 ↗</a>' if shop_url else '')
 sold=(product.get('soldCount') or {}).get('text') or '未返回'
 price=product.get('entryPrice') or {};price_text=price.get('text')
 if price_text:
  qualifier=price.get('qualifier') or '';price_text=('¥' if not re.search(r'[¥￥元]',str(price_text)) else '')+str(price_text)+(str(qualifier) if qualifier and str(qualifier) not in str(price_text) else '')
 else:price_text='未返回'
 reviews=(product.get('reviewCount') or {}).get('text') or '未返回'
 stats='<dl class="product-stats"><div><dt>已售件数</dt><dd>'+esc(sold)+'</dd></div><div><dt>入口价格</dt><dd>'+esc(price_text)+'</dd><small>'+esc(price.get('label') or '')+'</small></div><div><dt>用户评价数</dt><dd>'+esc(reviews)+'</dd></div></dl>'
 source=product.get('source') or {};buyer=source.get('capability')=='tbcli item summary'
 note='商品资料来源：淘宝买家浏览器 · 页面展示口径 · '+str(len(product.get('mainImages') or images))+'/5张主图' if buyer else '商品资料来源：DMP历史记录' if source else '商品资料尚未获取'
 if buyer:note+='；已售及评价数为页面口径，与DMP周期成交分别解释。'
 if product.get('status')=='unavailable':note='商品资料未返回；商品ID与经营数据分别保留。'
 product_html='<section class="product-card" aria-label="商品信息">'+gallery+'<div class="product-details"><h2 class="product-name">'+esc(product.get('title') or '商品名称未返回')+'</h2><div class="product-meta">商品 ID '+esc(d['itemId'])+' · '+esc(shop_name)+'</div>'+stats+'<div class="product-links">'+links+'</div><div class="product-note">'+esc(note)+'</div></div></section>'
 replacements={'__PRODUCT__':product_html,'__OVERVIEW__':overview,'__ITEM__':esc(d['itemId']),'__ASOF__':esc(d['plan']['asOf']),'__PERIOD__':esc(d['plan']['periods'][0]['end']),'__JUDGMENTS__':conclusions,'__PANELS__':panels,'__COVERAGE__':coverage,'__COUNT__':esc('共12个周期、60项来源查询：'+str(counts['returned'])+'项有返回，'+str(counts['empty'])+'项为空，'+str(counts['unavailable'])+'项查询失败。'),'__HASH__':esc(d['sourceHash'])}
 text=(ROOT/'assets/report.html').read_text(encoding='utf-8')
 for k,v in replacements.items():text=text.replace(k,v)
 if re.search(r'__[A-Z_]+__',text):raise ValueError('UNRESOLVED_TEMPLATE')
 with out.open('x',encoding='utf-8') as f:f.write(text)
 print(json.dumps({'ok':True,'path':str(out.resolve()),'renderer':'standalone-python-stdlib','bytes':out.stat().st_size,'externalDependencies':[]},ensure_ascii=False))
if __name__=='__main__':render(sys.argv[1],sys.argv[2])
