import {lookup} from "node:dns/promises";
import {request} from "node:https";
import robotsParser from "robots-parser";
import {setTimeout as delay} from "node:timers/promises";
export const agent="WorldInformationHub/1.0 (+https://github.com/billowssun/world-information-layer)";
export function publicIPv4(address){
 const p=address.split(".").map(Number);if(p.length!==4||p.some(n=>!Number.isInteger(n)||n<0||n>255))return false;
 const [a,b,c]=p;return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===192&&b===0||a===192&&b===88&&c===99||a===198&&(b===18||b===19)||a===198&&b===51&&c===100||a===203&&b===0&&c===113);
}
export async function fetchPinned(raw,hosts,headers={},kind="feed"){
 const u=new URL(raw);if(u.protocol!=="https:"||u.username||u.password||(u.port&&u.port!=="443")||!hosts.includes(u.hostname))throw new Error("FEED_URL_NOT_ALLOWED");
 const addresses=await lookup(u.hostname,{all:true,family:4});
 if(!addresses.length||addresses.some(a=>!publicIPv4(a.address)))throw new Error("NON_PUBLIC_ADDRESS");
 return new Promise((resolve,reject)=>{
  const req=request(u,{agent:false,family:4,lookup:(_h,_o,cb)=>cb(null,addresses[0].address,4),headers:{...headers,"User-Agent":agent,"Accept-Encoding":"identity","Accept":"application/rss+xml, application/atom+xml, application/xml, text/xml, text/plain"}},res=>{
   const status=res.statusCode??0;
   if(![200,304,404].includes(status)){res.resume();reject(new Error("HTTP_"+status));return;}
   if(status!==200){res.resume();resolve({status,text:""});return;}
   if(res.headers["content-encoding"]&&res.headers["content-encoding"]!=="identity"){res.resume();reject(new Error("ENCODING_NOT_SUPPORTED"));return;}
   if(!(kind==="json"?/application\/json/i:/xml|text\/plain/i).test(res.headers["content-type"]??"")){res.resume();reject(new Error("UNEXPECTED_CONTENT_TYPE"));return;}
   const chunks=[];let size=0;
   res.on("data",chunk=>{size+=chunk.length;if(size>2_000_000)req.destroy(new Error("BODY_TOO_LARGE"));else chunks.push(chunk);});
   res.on("error",reject);res.on("end",()=>{
    const buffer=Buffer.concat(chunks);const declaration=buffer.subarray(0,180).toString("ascii");
    const encoding=/encoding=["']([^"']+)/i.exec(declaration)?.[1]??"utf-8";
    try{resolve({status,text:new TextDecoder(encoding).decode(buffer),etag:res.headers.etag??null,lastModified:res.headers["last-modified"]??null});}catch{reject(new Error("INVALID_ENCODING"));}
   });
  });
  const timer=setTimeout(()=>req.destroy(new Error("FETCH_TIMEOUT")),15000);
  req.on("close",()=>clearTimeout(timer));req.on("error",reject);req.end();
 });
}
export async function robotsFor(origin,hosts){
 const u=origin+"/robots.txt";const r=await fetchPinned(u,hosts);
 if(![200,404].includes(r.status))throw new Error("ROBOTS_UNAVAILABLE");
 return robotsParser(u,r.status===404?"":r.text);
}
export async function collectSource(source,prior,robots){
 if(robots.isAllowed(source.feedUrl,agent)===false)throw new Error("ROBOTS_DENIED");
 const seconds=robots.getCrawlDelay(agent)??0;if(seconds>30)throw new Error("CRAWL_DELAY_TOO_LONG");
 if(seconds>0)await delay(seconds*1000);
 const headers={};if(prior?.etag)headers["If-None-Match"]=prior.etag;if(prior?.lastModified)headers["If-Modified-Since"]=prior.lastModified;
 return fetchPinned(source.feedUrl,source.allowedHosts,headers);
}
