import {test} from "node:test";
import assert from "node:assert/strict";
import {govRecord,normalizeBody} from "../src/fulltext.mjs";
import {mergeItems} from "../src/core.mjs";
const source={id:"official",baseUrl:"https://www.gov.uk/",allowedHosts:["www.gov.uk"],channel:"local-life",rightsPolicy:"licensed_fulltext",license:"OGL v3.0",licenseUrl:"https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",documentationUrl:"https://www.gov.uk/help/reuse-govuk-content"};
test("full bodies preserve ending, paragraphs, lists and attribution without active markup",()=>{
 const body="<p>"+"完整正文测试。".repeat(1000)+"</p><ul><li>重点一</li></ul><p>文章结束标记</p>";
 const content={document_type:"press_release",base_path:"/government/news/test",title:"Official article",details:{body},links:{organisations:[{title:"Department"}]}};
 const item=govRecord(content,source,"2026-09-18T00:00:00Z");
 assert.ok(item.bodyText.length>5000);assert.ok(item.bodyHtml.includes("文章结束标记"));assert.ok(item.bodyHtml.includes("<li>重点一</li>"));assert.deepEqual(item.republication.authors,["Department"]);
 const safe=normalizeBody('<script>bad()</script><p onclick="bad()">Good <a href="javascript:bad()">link</a><img src="x"></p>',source.baseUrl);
 assert.ok(!/script|onclick|javascript:|<img/.test(safe));assert.ok(safe.includes("Good"));
 assert.throws(()=>govRecord(content,{...source,rightsPolicy:"feed_excerpt"},item.firstSeenAt),/LICENSE/);
 const updated=govRecord({...content,details:{body:body+"<p>更新</p>"}},source,item.firstSeenAt);
 const [merged]=mergeItems([item],[updated],item.firstSeenAt);assert.equal(merged.version,2);
});
