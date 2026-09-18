import sanitize from "sanitize-html";
import {createHash} from "node:crypto";
import {idFor,classify,clean} from "./core.mjs";
import {fetchPinned} from "./fetch.mjs";
import {setTimeout as delay} from "node:timers/promises";
export function normalizeBody(raw,origin){
 return sanitize(raw,{allowedTags:["p","div","section","h2","h3","h4","ul","ol","li","blockquote","strong","em","b","i","a","br","table","thead","tbody","tr","th","td","sup","sub"],allowedAttributes:{a:["href"],th:["scope"],td:["colspan","rowspan"]},allowedSchemes:["http","https"],allowProtocolRelative:false,transformTags:{a:(_tag,attributes)=>{try{const u=new URL(attributes.href,origin);return {tagName:"a",attribs:{href:["http:","https:"].includes(u.protocol)?u.href:""}};}catch{return {tagName:"a",attribs:{}};}}}});
}
export function govRecord(content,source,now){
 if(source.rightsPolicy!=="licensed_fulltext"||!source.licenseUrl)throw new Error("FULLTEXT_LICENSE_REQUIRED");
 if(content.document_type!=="press_release"||typeof content.details?.body!=="string")throw new Error("NO_COMPLETE_BODY");
 const bodyHtml=normalizeBody(content.details.body,source.baseUrl);
 const bodyText=sanitize(bodyHtml,{allowedTags:[],allowedAttributes:{}});
 if(clean(bodyText).length<100)throw new Error("INCOMPLETE_BODY");
 if(/third.party copyright|copyright holder|all rights reserved/i.test(bodyText))throw new Error("RIGHTS_EXCEPTION_REVIEW_REQUIRED");
 const originalUrl=new URL(content.base_path,source.baseUrl).href;
 if(!source.allowedHosts.includes(new URL(originalUrl).hostname))throw new Error("UNTRUSTED_LINK");
 const authors=(content.links?.organisations??[]).map(o=>o.title).filter(Boolean);
 return {id:idFor(originalUrl),title:content.title,originalUrl,sourcePublishedAt:content.first_published_at??content.public_updated_at??null,timeIssue:null,channels:classify(content.title,source.channel),sourceIds:[source.id],summary:clean(bodyText).slice(0,240),summaryProvenance:{type:"licensed_body_excerpt",sourceId:source.id},contentMode:"fulltext",bodyHtml,bodyText,bodyHash:createHash("sha256").update(bodyHtml).digest("hex"),language:"en",republication:{sourceId:source.id,sourceUrl:originalUrl,license:source.license,licenseUrl:source.licenseUrl,permissionUrl:source.documentationUrl,authors:authors.length?authors:["UK Government"],attribution:"Contains public sector information licensed under the Open Government Licence v3.0.",modifications:"保留完整文字正文；移除图片、附件与页面控件，清理HTML，不翻译。",sourceUpdatedAt:content.public_updated_at,sourceVersion:content.content_id},firstSeenAt:now,lastSeenAt:now,updatedAt:now,version:1,history:[]};
}
export async function collectFulltext(source,robots,now,transport=fetchPinned){
 if(robots.isAllowed(source.feedUrl,"WorldInformationHub")===false)throw new Error("ROBOTS_DENIED");
 const wait=Math.max(1,robots.getCrawlDelay("WorldInformationHub")??0);if(wait>30)throw new Error("CRAWL_DELAY_TOO_LONG");
 const listing=await transport(source.feedUrl,source.allowedHosts,{},"json");if(listing.status!==200)throw new Error("INDEX_UNAVAILABLE");
 const results=JSON.parse(listing.text).results;if(!Array.isArray(results))throw new Error("INVALID_INDEX");
 const items=[];let rejected=0;
 for(const result of results.slice(0,20)){
  if(typeof result.link!=="string"||!result.link.startsWith("/government/news/")){rejected++;continue;}
  const url=new URL("/api/content"+result.link,source.baseUrl).href;
  if(robots.isAllowed(url,"WorldInformationHub")===false){rejected++;continue;}
  await delay(wait*1000);
  try{const response=await transport(url,source.allowedHosts,{},"json");if(response.status!==200)throw new Error("BODY_UNAVAILABLE");items.push(govRecord(JSON.parse(response.text),source,now));}catch{rejected++;}
 }
 if(!items.length)throw new Error("NO_LICENSED_FULLTEXT");
 return {items,rejected};
}
