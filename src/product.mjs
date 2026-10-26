import {createHash} from 'node:crypto';
export function productIdentity(raw,itemId){
 const buyer=raw?.command==='item summary'&&raw.summaryVersion===1&&raw.browserRole==='buyer';
 const legacy=raw?.command==='dmp item-info'; // Historical saved runs remain readable.
 if(raw?.schemaVersion!==1||(!buyer&&!legacy)||raw.itemId!==itemId)throw Error('PRODUCT_SOURCE_ID_MISMATCH');
 if(raw.product&&raw.product.itemId!==itemId)throw Error('PRODUCT_ID_MISMATCH');
 const product={...(raw.product??{itemId,title:null,mainImageUrl:null,mainImages:[],itemUrl:'https://item.taobao.com/item.htm?id='+itemId,linkSources:{itemUrl:'constructed-from-itemId'},shop:{shopId:null,shopName:null,url:null}}),status:raw.status,error:raw.error??null,coverage:raw.coverage??null,source:{capability:buyer?'tbcli item summary':'tbcli dmp item-info',browserRole:buyer?'buyer':'merchant',fetchedAt:raw.source?.capturedAt??raw.source?.fetchedAt??null,evidence:'evidence/product-info.json',sha256:createHash('sha256').update(JSON.stringify(raw)).digest('hex')},image:{status:'unavailable',dataUrl:null}};
 product.mainImages=(product.mainImages??(product.mainImageUrl?[product.mainImageUrl]:[])).slice(0,5);
 return product;
}

function imageUrl(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||!/(^|\.)(alicdn\.com|taobaocdn\.com|tbcdn\.cn)$/.test(u.hostname))throw Error('UNSUPPORTED_PRODUCT_IMAGE_URL');return u;}
async function embedOneImage(url,{fetchImpl=fetch}={}){
 try{
  let u=imageUrl(url),r;
  for(let i=0;i<4;i++){r=await fetchImpl(u,{redirect:'manual',signal:AbortSignal.timeout(15000)});if(r.status>=300&&r.status<400){u=imageUrl(new URL(r.headers.get('location'),u).href);continue;}break;}
  if(!r.ok)throw Error('IMAGE_HTTP_FAILURE');const type=r.headers.get('content-type')?.split(';')[0].trim();if(!['image/jpeg','image/png','image/webp','image/gif'].includes(type))throw Error('UNSUPPORTED_IMAGE_TYPE');
  if(Number(r.headers.get('content-length'))>5*1024*1024)throw Error('PRODUCT_IMAGE_TOO_LARGE');
  const chunks=[];let bytes=0;for await(const chunk of r.body){bytes+=chunk.length;if(bytes>5*1024*1024)throw Error('PRODUCT_IMAGE_TOO_LARGE');chunks.push(chunk);}
  const data=Buffer.concat(chunks);if(!data.length)throw Error('EMPTY_PRODUCT_IMAGE');
  return {url,status:'embedded',mime:type,bytes:data.length,dataUrl:'data:'+type+';base64,'+data.toString('base64')};
 }catch(e){return {url,status:'unavailable',dataUrl:null,reason:e.message};}
}
export async function embedProductImage(product,options={}){
 const urls=(product.mainImages??(product.mainImageUrl?[product.mainImageUrl]:[])).slice(0,5);
 product.images=[];
 for(const url of urls)product.images.push(await embedOneImage(url,options));
 product.image=product.images[0]??{status:'unavailable',dataUrl:null};
 return product;
}
