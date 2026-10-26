import {createHash} from 'node:crypto';
export function productIdentity(raw,itemId){
 if(raw?.schemaVersion!==1||raw.command!=='dmp item-info'||raw.itemId!==itemId)throw Error('PRODUCT_SOURCE_ID_MISMATCH');
 if(raw.product&&raw.product.itemId!==itemId)throw Error('PRODUCT_ID_MISMATCH');
 return {...(raw.product??{itemId,title:null,mainImageUrl:null,itemUrl:'https://item.taobao.com/item.htm?id='+itemId,linkSources:{itemUrl:'constructed-from-itemId'},shop:{shopId:null,shopName:null,url:null}}),status:raw.status,error:raw.error??null,source:{capability:'tbcli dmp item-info',fetchedAt:raw.source?.fetchedAt??null,evidence:'evidence/product-info.json',sha256:createHash('sha256').update(JSON.stringify(raw)).digest('hex')},image:{status:'unavailable',dataUrl:null}};
}
function imageUrl(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||!/(^|\.)(alicdn\.com|taobaocdn\.com|tbcdn\.cn)$/.test(u.hostname))throw Error('UNSUPPORTED_PRODUCT_IMAGE_URL');return u;}
export async function embedProductImage(product,{fetchImpl=fetch}={}){
 if(!product.mainImageUrl)return product;
 try{
  let u=imageUrl(product.mainImageUrl),r;
  for(let i=0;i<4;i++){r=await fetchImpl(u,{redirect:'manual',signal:AbortSignal.timeout(15000)});if(r.status>=300&&r.status<400){u=imageUrl(new URL(r.headers.get('location'),u).href);continue;}break;}
  if(!r.ok)throw Error('IMAGE_HTTP_FAILURE');const type=r.headers.get('content-type')?.split(';')[0].trim();if(!['image/jpeg','image/png','image/webp','image/gif'].includes(type))throw Error('UNSUPPORTED_IMAGE_TYPE');
  if(Number(r.headers.get('content-length'))>5*1024*1024)throw Error('PRODUCT_IMAGE_TOO_LARGE');
  const chunks=[];let bytes=0;for await(const chunk of r.body){bytes+=chunk.length;if(bytes>5*1024*1024)throw Error('PRODUCT_IMAGE_TOO_LARGE');chunks.push(chunk);}
  const data=Buffer.concat(chunks);if(!data.length)throw Error('EMPTY_PRODUCT_IMAGE');
  product.image={status:'embedded',mime:type,bytes:data.length,dataUrl:'data:'+type+';base64,'+data.toString('base64')};
 }catch(e){product.image={status:'unavailable',dataUrl:null,reason:e.message};}
 return product;
}
