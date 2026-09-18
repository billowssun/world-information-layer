import {test} from "node:test";
import assert from "node:assert/strict";
import {parseFeed,mergeItems,classify,escape,safeJson,canonicalUrl} from "../src/core.mjs";
import {publicIPv4} from "../src/fetch.mjs";
const source={id:"test",channel:"technology",allowedHosts:["example.com"]};
test("feed records omit full text and reject off-domain or unsafe links",async()=>{
 const feed='<rss version="2.0"><channel><title>Test</title><item><title>AI芯片更新</title><link>https://example.com/item?utm_source=x</link><pubDate>Thu, 17 Sep 2026 03:00:00 GMT</pubDate><description>THIS FULL TEXT MUST NOT BE STORED</description></item><item><title>duplicate</title><link>https://example.com/item</link></item><item><title>off-site</title><link>https://evil.com/item</link></item></channel></rss>';
 const items=await parseFeed(feed,source,"2026-09-18T00:00:00Z");assert.equal(items.length,1);assert.equal(items[0].originalUrl,"https://example.com/item");
 assert.ok(!JSON.stringify(items).includes("FULL TEXT"));assert.equal(items[0].sourcePublishedAt,"2026-09-17T03:00:00.000Z");
 assert.throws(()=>canonicalUrl("javascript:alert(1)",["example.com"]));await assert.rejects(parseFeed("<!DOCTYPE rss><rss/>",source));
});
test("updates preserve original timestamps, provenance and prior versions",()=>{
 const now="2026-09-18T00:00:00Z";const old={id:"x",title:"Old",originalUrl:"https://example.com/a",sourcePublishedAt:null,sourceIds:["one"],channels:["technology"],firstSeenAt:"2026-09-17T00:00:00Z",lastSeenAt:"2026-09-17T00:00:00Z",updatedAt:"2026-09-17T00:00:00Z",version:1,history:[]};
 const [item]=mergeItems([old],[{...old,title:"New",sourceIds:["two"],firstSeenAt:now,lastSeenAt:now}],now);
 assert.equal(item.version,2);assert.equal(item.firstSeenAt,old.firstSeenAt);assert.equal(item.history[0].title,"Old");assert.deepEqual(item.sourceIds,["one","two"]);
 const [unchanged]=mergeItems([item],[{...item,lastSeenAt:now}],now);assert.equal(unchanged.version,2);
});
test("fixed classification supports everyday categories and does not add claims",()=>{
 assert.ok(classify("招聘高校毕业生就业岗位","local-life").includes("career"));
 assert.ok(classify("城市旅游美食节","local-life").includes("travel"));
 assert.ok(classify("新能源汽车发布","technology").includes("mobility"));
 assert.ok(classify("医院医保新政策","local-life").includes("health"));
});
test("markup escaping and fetch network restrictions protect the public renderer",()=>{
 assert.equal(escape('<script>'),"&lt;script&gt;");assert.ok(!safeJson("</script>").includes("</script>"));
 for(const ip of ["127.0.0.1","169.254.169.254","192.168.1.1","100.64.0.1","203.0.113.1","::1"])assert.equal(publicIPv4(ip),false);
 assert.equal(publicIPv4("8.8.8.8"),true);
});

