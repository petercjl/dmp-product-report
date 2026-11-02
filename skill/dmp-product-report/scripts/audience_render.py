"""Render rolling competitor portraits without external dependencies or inner scrolling."""
import json,html,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
def render_audience(report):
 profile=report.get('audienceProfile')
 if not profile:return '', '', ''
 payload={**profile,'analyses':report.get('audienceAnalyses',profile.get('analyses',{}))}
 data=json.dumps(payload,ensure_ascii=False).replace('<','\\u003c').replace('>','\\u003e').replace('&','\\u0026')
 nav='<a href="#audience" data-route="audience" aria-controls="view-audience"><svg class="menu-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="4"/><path d="M4 21a8 8 0 0 1 16 0M3 3h4M17 3h4"/></svg><span>竞品人群画像</span></a>'
 panel='''<section class="report-view" id="view-audience" data-view="audience" hidden><h2>竞品人群画像</h2><p class="portrait-intro">近30天 · 行为人群特征</p><div class="portrait-tabs" role="tablist" aria-label="行为人群"></div><div id="portrait-active" role="tabpanel"><article class="business-card" id="portrait-brief"></article><div class="portrait-grid" id="portrait-charts"></div><details class="portrait-comparison" open><summary>五类人群的主要特征</summary><div class="portrait-table-wrap"><table id="portrait-compare"></table></div></details><p class="business-note">滚动窗口的实际起止日期未回显；人数与经营成交笔数口径独立。五类行为可能重叠，不能相加为去重人数或直接计算转化率；各维度为独立分布，不代表同一批人同时具备全部特征。</p></div></section>'''
 css='<style>'+(ROOT/'assets/audience-profile.css').read_text()+'</style>'
 js='<script type="application/json" id="portrait-data">'+data+'</script><script>'+(ROOT/'assets/audience-profile.js').read_text()+'</script>'
 return nav,css+panel,js
