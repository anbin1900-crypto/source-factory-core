'use strict';
const { PlaywrightCrawler, RequestQueue }=require('crawlee');
async function run({startUrl,onReceipt}){const q=await RequestQueue.open("a6-cycle2-1.0.0-cycle2");await q.addRequest({url:startUrl});const crawler=new PlaywrightCrawler({requestQueue:q,maxRequestRetries:2,requestHandler:async({page,request})=>{await page.locator('body').waitFor({state:'visible'});const html_document_text=await page.locator('body').innerText();const outbound_links=await page.locator('a[href]').evaluateAll(xs=>xs.map(x=>x.href));await onReceipt({request_url:request.url,html_document_text,outbound_links});}});await crawler.run();}
module.exports={run};
