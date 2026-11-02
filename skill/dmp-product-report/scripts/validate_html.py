"""Parse final HTML and nested srcdoc with the standard library, without a browser."""
import json,re,sys
from html.parser import HTMLParser

class Document(HTMLParser):
 def __init__(self,text):
  super().__init__(convert_charrefs=True)
  self.children=[];self.scripts=[];self.models=[];self.ids=set();self.external=[];self.current=None
  self.feed(text);self.close()
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if 'id' in a:self.ids.add(a['id'])
  # Links to product/store pages are navigation, not rendering dependencies.
  for key in ['src','poster','srcset','data' if tag=='object' else 'src']+(['href'] if tag=='link' else []):
   if a.get(key) and not a[key].startswith(('data:','#','about:')):self.external.append(tag+':'+key)
  if tag=='iframe' and a.get('srcdoc'):self.children.append(Document(a['srcdoc']))
  if a.get('style'):self.css(a['style'])
  if tag in ['script','style']:self.current=[tag,a,[]]
 def css(self,text):
  for url in re.findall(r'url\(\s*[\"\']?([^\)\"\']+)',text,re.I):
   if not url.startswith(('data:','#')):self.external.append('css:url')
  if re.search(r'@import\b',text,re.I):self.external.append('css:import')
 def handle_data(self,text):
  if self.current:self.current[2].append(text)
 def handle_endtag(self,tag):
  if not self.current or self.current[0]!=tag:return
  _,a,parts=self.current;text=''.join(parts);self.current=None
  if tag=='style':self.css(text)
  elif a.get('type','').lower() in ['','text/javascript','application/javascript','module']:self.scripts.append(text)
  elif a.get('type')=='application/json':self.models.append(json.loads(text))

def inspect(text):
 root=Document(text);docs=[]
 def walk(d):
  docs.append(d)
  for c in d.children:walk(c)
 walk(root)
 return {'checks':{'nestedOfflineAssets':not any(d.external for d in docs),'embeddedJsonValid':True,'moduleDocuments':len(root.children)==3,'moduleNavigation':all('view-'+k in root.ids for k in ['overview','metrics','promotion','crowd']),'embeddedDashboardData':all(len(c.models)==1 for c in root.children)},'scripts':[s for d in docs for s in d.scripts],'dashboards':[c.models[0] if len(c.models)==1 else None for c in root.children]}

if __name__=='__main__':
 try:print(json.dumps(inspect(open(sys.argv[1],encoding='utf-8').read()),ensure_ascii=False))
 except Exception as e:raise SystemExit('HTML_CONTRACT_INVALID: '+type(e).__name__)
