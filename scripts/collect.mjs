import {readFile,mkdir,writeFile,rename} from "node:fs/promises";
import {parseFeed,mergeItems} from "../src/core.mjs";
import {robotsFor,collectSource} from "../src/fetch.mjs";
const sources=JSON.parse(await readFile("config/sources.json","utf8"));
const site=JSON.parse(await readFile("config/site.json","utf8"));
const removed=new Set(JSON.parse(await readFile("config/removed-urls.json","utf8")));
let previous={items:[],sourceStatus:{}};
try{previous=JSON.parse(await readFile("data/snapshot.json","utf8"));}catch(e){if(e.code!=="ENOENT")throw e;}
const now=new Date().toISOString();const incoming=[];const statuses={...previous.sourceStatus};const robotCache=new Map();
let successes=0;
for(const source of sources.filter(s=>s.enabled)){
 try{
  const origin=new URL(source.feedUrl).origin;
  if(!robotCache.has(origin))robotCache.set(origin,await robotsFor(origin,source.allowedHosts));
  const prior=statuses[source.id];const response=await collectSource(source,prior?.contentSchema===2?prior:null,robotCache.get(origin));
  if(![200,304].includes(response.status))throw new Error("FEED_HTTP_"+response.status);
  let items=[];if(response.status===200){items=await parseFeed(response.text,source,now);if(!items.length)throw new Error("EMPTY_FEED");incoming.push(...items);}
  statuses[source.id]={id:source.id,contentSchema:2,status:"ok",checkedAt:now,lastSuccessAt:now,etag:response.etag??prior?.etag??null,lastModified:response.lastModified??prior?.lastModified??null,discovered:items.length,failures:0,error:null};
  successes++;console.log(source.id+": "+(response.status===304?"not modified":items.length+" records"));
 }catch(e){
  const code=/^[A-Z0-9_]+$/.test(e.message)?e.message:"FETCH_OR_PARSE_FAILED";
  statuses[source.id]={...statuses[source.id],id:source.id,status:"failed",checkedAt:now,failures:(statuses[source.id]?.failures??0)+1,error:code};
  console.error(source.id+": "+code);
 }
}
const items=mergeItems(previous.items,incoming,now,site.maxItems,site.retentionDays).filter(i=>!removed.has(i.originalUrl));
if(!items.length)throw new Error("No valid real records; refusing an empty or fake launch");
const snapshot={schemaVersion:"1",collectedAt:now,lastSuccessfulCollectionAt:successes?now:previous.lastSuccessfulCollectionAt,items,sourceStatus:statuses};
await mkdir("data",{recursive:true});await writeFile("data/snapshot.tmp",JSON.stringify(snapshot,null,2)+"\n");await rename("data/snapshot.tmp","data/snapshot.json");
await writeFile("data/health.json",JSON.stringify({checkedAt:now,healthySources:successes,totalSources:sources.filter(s=>s.enabled).length,totalRecords:items.length,status:successes?"ok":"stale"},null,2)+"\n");
if(!successes)throw new Error("All sources failed; preserved prior records");
