import Parser from "rss-parser";
import {readFile,stat} from "node:fs/promises";
const base=new URL(JSON.parse(await readFile("dist/build-info.json","utf8")).siteUrl).pathname;
const doc=await readFile("dist/index.html","utf8");
for(const match of doc.matchAll(/(?:href|src)="([^"]+)"/g)){
 if(match[1].startsWith(base)){
  let path=match[1].slice(base.length);
  if(!path||path.endsWith("/"))path+="index.html";
  await stat("dist/"+path);
 }
}
for(const path of ["rss.xml","atom.xml"]){
 const feed=await new Parser().parseString(await readFile("dist/"+path,"utf8"));
 const records=JSON.parse(await readFile("dist/build-info.json","utf8")).records;
 if(feed.items.length!==Math.min(100,records))throw new Error("Unexpected feed size");
}
console.log("Homepage internal links and RSS/Atom XML verified");
