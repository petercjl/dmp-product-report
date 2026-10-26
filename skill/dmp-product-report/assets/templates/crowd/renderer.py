import html,json,pathlib
ROOT=pathlib.Path(__file__).resolve().parent
def render_file(input_value,output_value,*,cli_version,pack):
 src=pathlib.Path(input_value).resolve();dst=pathlib.Path(output_value).resolve()
 if dst.exists():raise ValueError('refusing existing output')
 d=json.loads(src.read_text());ids=[g['id'] for g in d['groups']]
 if len(set(ids))!=len(ids) or 'total' in ids:raise ValueError('groups exclude platform total')
 if len({p['id'] for p in d['periods']})!=len(d['periods']) or len({m['id'] for m in d['metrics']})!=len(d['metrics']):raise ValueError('duplicate ids')
 for p in d['periods']:
  if set(p['values'])!={m['id'] for m in d['metrics']}:raise ValueError('metric mismatch')
  for values in p['values'].values():
   if set(values)!=set(ids+['total']):raise ValueError('group mismatch')
   if any(v['kind'] not in ['exact','missing'] for v in values.values()):raise ValueError('composition requires numeric source')
 tabs=''.join('<button type="button" role="tab" id="tab-'+html.escape(m['id'],quote=True)+'" data-metric="'+html.escape(m['id'],quote=True)+'" aria-controls="metric-panel">'+html.escape(m['label'])+'</button>' for m in d['metrics'])
 data=json.dumps(d,ensure_ascii=False,allow_nan=False).replace('<',chr(92)+'u003c').replace('>',chr(92)+'u003e').replace('&',chr(92)+'u0026')
 replacements={'__TITLE__':html.escape(d['meta']['title']),'__SUBJECT__':html.escape(d['meta']['subject']),'__SOURCE__':html.escape(d['meta']['source']),'__NOTE__':html.escape(d['meta'].get('dataNote','')),'__FOOT__':html.escape(d['meta'].get('footnote','')),'__TABS__':tabs,'__DATA__':data,'__CLI__':cli_version,'__VERSION__':pack['version']}
 text=(ROOT/'template.html').read_text()
 for k,v in replacements.items():text=text.replace(k,v)
 dst.parent.mkdir(parents=True,exist_ok=True);dst.write_text(text)
 return {'ok':True,'output':str(dst),'contract':d['contract'],'template_pack':pack['id'],'charts':1,'periods':len(d['periods']),'bytes':dst.stat().st_size}
