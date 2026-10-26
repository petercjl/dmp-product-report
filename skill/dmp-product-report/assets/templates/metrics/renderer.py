"""Single chart with metric tabs and two period comparisons."""
import html,json,pathlib
ROOT=pathlib.Path(__file__).resolve().parent
CONTRACT='period-metric-dashboard@1.0'
def render_file(input_value,output_value,*,cli_version,pack):
    src=pathlib.Path(input_value).expanduser().resolve();dst=pathlib.Path(output_value).expanduser().resolve()
    if dst.exists():raise ValueError('refusing existing output')
    d=json.loads(src.read_text(encoding='utf-8'));ids=[p['id'] for p in d['periods']]
    trend=d.get('mode')=='trend'
    if d['contract']!=CONTRACT or len(set(ids))!=len(ids) or (trend and len(ids)<2) or (not trend and len(ids)!=4):raise ValueError('invalid contract or periods')
    if len({m['id'] for m in d['metrics']})!=len(d['metrics']):raise ValueError('duplicate metrics')
    for pair in d['comparisons']:
        if pair['current'] not in ids or pair['previous'] not in ids:raise ValueError('unknown period')
    for m in d['metrics']:
        if set(m['values'])!=set(ids):raise ValueError('metric needs all periods')
    if d.get('mode')=='combined':
        t=d['trend'];tids=[p['id'] for p in t['periods']]
        if len(tids)!=len(set(tids)) or len(tids)<2:raise ValueError('invalid trend periods')
        if [m['id'] for m in t['metrics']]!=[m['id'] for m in d['metrics']]:raise ValueError('trend metric mismatch')
        for a,b in zip(d['metrics'],t['metrics']):
            if set(b['values'])!=set(tids) or any(a[k]!=b[k] for k in ['label','unit','format','comparison']):raise ValueError('incompatible metric')
    payload=json.dumps(d,ensure_ascii=False,allow_nan=False).replace('<','\\u003c').replace('>','\\u003e').replace('&','\\u0026')
    tabs=[]
    for i,m in enumerate(d['metrics']):
        mid=html.escape(m['id'],quote=True);label=html.escape(m['label']);selected='true' if i==0 else 'false'
        tabs.append(f'<button type="button" role="tab" id="tab-{mid}" data-metric="{mid}" aria-controls="metric-panel" aria-selected="{selected}" tabindex="{0 if i==0 else -1}">{label}</button>')
    replacements={'__TITLE__':html.escape(d['meta']['title']),'__SUBJECT__':html.escape(d['meta']['subject']),'__AS_OF__':html.escape(d['meta']['asOf']),'__SOURCE__':html.escape(d['meta']['source']),'__CLI_VERSION__':html.escape(cli_version),'__PACK_VERSION__':html.escape(pack['version']),'__TABS__':''.join(tabs),'__DATA__':payload}
    output=(ROOT/'template.html').read_text(encoding='utf-8')
    replacements.update({'__EYEBROW__':'经营数据 · 周期趋势' if trend else '经营数据 · 四周期对照','__CHART_FOOTNOTE__':'各点为该周期单独查询的汇总值；环比与相邻的前一周期比较。比例指标以百分点表示变化。' if trend else '柱形显示各周期的汇总值；7天、30天分别与各自的等长前期比较。比例指标变化以“百分点”表示。'})
    if d.get('mode')=='combined':
        replacements['__EYEBROW__']='经营数据 · 周期对比与周趋势'
        replacements['__CHART_FOOTNOTE__']='7天、30天分别与等长前期对比；自然周为周一至周日独立汇总，周环比与相邻前一周比较。比例指标使用百分点变化。'
    for k,v in replacements.items():output=output.replace(k,v)
    dst.parent.mkdir(parents=True,exist_ok=True);dst.write_text(output,encoding='utf-8')
    return {'ok':True,'output':str(dst),'contract':CONTRACT,'template_pack':pack['id'],'cli_version':cli_version,'metrics':len(d['metrics']),'charts':1,'bytes':dst.stat().st_size}
