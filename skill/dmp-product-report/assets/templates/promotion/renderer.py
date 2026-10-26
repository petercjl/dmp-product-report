import html,json,pathlib
ROOT=pathlib.Path(__file__).resolve().parent
def render_file(input_value,output_value,*,cli_version,pack):
 src=pathlib.Path(input_value).resolve();dst=pathlib.Path(output_value).resolve()
 if dst.exists():raise ValueError('refusing existing output')
 d=json.loads(src.read_text());sids={s['id'] for s in d['scenes']};mids={m['id'] for m in d['metrics']}
 if len(sids)!=len(d['scenes']) or len(mids)!=len(d['metrics']) or len({p['id'] for p in d['periods']})!=len(d['periods']):raise ValueError('duplicate ids')
 for p in d['periods']:
  if p['start']>p['end'] or set(p['values'])!=mids:raise ValueError('invalid period')
  for values in p['values'].values():
   if set(values)!=sids:raise ValueError('scene mapping mismatch')
   for v in values.values():
    if v['kind']=='range' and v['lower']>v['upper']:raise ValueError('invalid range')
 tabs=''.join('<button role="tab" type="button" data-metric="'+html.escape(m['id'],quote=True)+'" id="tab-'+html.escape(m['id'],quote=True)+'" aria-controls="metric-panel">'+html.escape(m['label'])+'</button>' for m in d['metrics'])
 model=json.dumps(d,ensure_ascii=False,allow_nan=False).replace('<','\\u003c').replace('>','\\u003e').replace('&','\\u0026')
 replacements={'__TITLE__':html.escape(d['meta']['title']),'__SUBJECT__':html.escape(d['meta']['subject']),'__SOURCE__':html.escape(d['meta']['source']),'__TABS__':tabs,'__DATA__':model,'__CLI_VERSION__':html.escape(cli_version),'__PACK_VERSION__':html.escape(pack['version'])}
 for marker,key,default in [('__EYEBROW__','eyebrow','推广策略 · 周期对比与周趋势'),('__GROUP_LABEL__','groupLabel','推广场景'),('__FOOTNOTE__','footnote','日期为请求范围，接口未回显实际覆盖日期。直接成交额为推广归因口径，与经营模块销售额分别解读。'),('__VALUE_NOTE__','valueNote','区间按原始上下界展示；相同区间不能据此判断持平，区间重叠时无法确定精确涨跌幅。未返回保留为未知。')]:replacements[marker]=html.escape(d['meta'].get(key,default))
 text=(ROOT/'template.html').read_text()
 for k,v in replacements.items():text=text.replace(k,v)
 dst.parent.mkdir(parents=True,exist_ok=True);dst.write_text(text)
 return {'ok':True,'output':str(dst),'contract':d['contract'],'template_pack':pack['id'],'periods':len(d['periods']),'charts':1,'bytes':dst.stat().st_size}
