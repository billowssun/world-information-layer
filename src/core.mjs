import {createHash} from "node:crypto";
import Parser from "rss-parser";
export function clean(text){return String(text??"").replace(/<[^>]*>/g,"").replace(/[\u0000-\u001f]/g," ").replace(/\s+/g," ").trim();}
export function escape(text){return String(text??"").replace(/[<>&"']/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&#39;"}[c]));}
export function safeJson(value){return JSON.stringify(value).replace(/</g,"\\u003c");}
export function canonicalUrl(raw,hosts){
 const u=new URL(raw);
 if(!["http:","https:"].includes(u.protocol)||u.username||u.password||!hosts.includes(u.hostname)||(u.port&&u.port!=="443"&&u.port!=="80"))throw new Error("UNTRUSTED_LINK");
 // Original links remain as provided except tracking/fragment normalization.
 u.hash="";for(const k of [...u.searchParams.keys()])if(/^utm_|^(gclid|fbclid)$/i.test(k))u.searchParams.delete(k);
 return u.href;
}
export function idFor(url){return createHash("sha256").update(url).digest("hex").slice(0,24);}
const rules=[
 ["technology",/人工智能|AI\b|OpenAI|GPT|DeepSeek|模型|科技|芯片|科研|算法|软件|互联网|航天|机器人/i],
 ["consumer-tech",/手机|iPhone|苹果|华为|小米|数码|家电|电脑|显示器|平板|笔记本|耳机|键盘|相机|macOS|Windows/i],
 ["mobility",/汽车|新能源车|电动车|智驾|自动驾驶|充电|铁路|地铁|公交|高速|交通|航班|飞行|航空|比亚迪|特斯拉|车企/i],
 ["travel",/旅游|旅行|文旅|景区|酒店|民宿|签证|游客|出境|入境|露营|海岛|城市漫步/],
 ["food",/美食|餐饮|食品|食物|饮食|咖啡|烹饪|菜谱|火锅|月饼|餐厅|茶饮|粮食/],
 ["home",/家居|装修|住房|租房|房价|房地产|楼市|物业|家具|居住|家装/],
 ["education",/教育|学校|大学|招生|高考|中考|考试|留学|学习|教师|学生|校园/],
 ["career",/职场|招聘|求职|就业|职业|工资|薪资|人才|劳动|岗位|实习|创业/],
 ["entertainment",/电影|影视|电视剧|综艺|演唱会|音乐|文化|艺术|游戏|戏剧|文学|博物馆|动漫/],
 ["health",/健康|医疗|医院|疾病|医生|药物|疫苗|医学|公共卫生|医保|医药/],
 ["finance",/财经|经济|金融|投资|股市|股票|银行|融资|营收|利润|产业|企业|消费|外贸|贸易|资本|商业/],
 ["sports",/体育|足球|篮球|赛事|奥运|网球|马拉松|世界杯|冠军|全运会/]
];
export function classify(title,fallback){
 const matches=rules.filter(([,r])=>r.test(title)).map(([slug])=>slug);
 return [...new Set([fallback,...matches])];
}
export async function parseFeed(text,source,now=new Date().toISOString()){
 if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error("UNSAFE_XML");
 if(!/^\s*<\?xml|^\s*<rss|^\s*<feed/.test(text))throw new Error("NOT_A_FEED");
 const feed=await new Parser().parseString(text);const items=[];const seen=new Set();
 for(const entry of feed.items.slice(0,200)){
  try{
   const title=clean(entry.title).slice(0,300);if(!title||!entry.link)continue;
   const originalUrl=canonicalUrl(entry.link,source.allowedHosts);if(seen.has(originalUrl))continue;seen.add(originalUrl);
   const parsed=Date.parse(entry.isoDate??entry.pubDate??"");
   const sourcePublishedAt=Number.isFinite(parsed)?new Date(parsed).toISOString():null;
   const timeIssue=sourcePublishedAt && parsed>Date.parse(now)+300000?"future_date":sourcePublishedAt?null:"unknown_date";
   items.push({id:idFor(originalUrl),title,originalUrl,sourcePublishedAt,timeIssue,channels:classify(title,source.channel),sourceIds:[source.id],firstSeenAt:now,lastSeenAt:now,updatedAt:now,version:1,history:[]});
  }catch{/* off-domain, malformed, or non-web items are excluded */}
 }
 return items;
}
export function mergeItems(previous,incoming,now,maxItems=10000,retentionDays=90){
 const map=new Map(previous.map(i=>[i.originalUrl,{...i}]));
 for(const item of incoming){
  const old=map.get(item.originalUrl);if(!old){map.set(item.originalUrl,item);continue;}
  const changed=old.title!==item.title||old.sourcePublishedAt!==item.sourcePublishedAt;
  map.set(item.originalUrl,{...old,...item,sourceIds:[...new Set([...old.sourceIds,...item.sourceIds])],channels:[...new Set([...old.channels,...item.channels])],firstSeenAt:old.firstSeenAt,updatedAt:changed?now:old.updatedAt,version:old.version+(changed?1:0),history:changed?[...old.history,{title:old.title,sourcePublishedAt:old.sourcePublishedAt,version:old.version,updatedAt:old.updatedAt}].slice(-10):old.history});
 }
 const cutoff=Date.parse(now)-retentionDays*86400000;
 return [...map.values()].filter(i=>Date.parse(i.firstSeenAt)>=cutoff).sort((a,b)=>Date.parse(b.timeIssue?b.firstSeenAt:b.sourcePublishedAt??b.firstSeenAt)-Date.parse(a.timeIssue?a.firstSeenAt:a.sourcePublishedAt??a.firstSeenAt)).slice(0,maxItems);
}

