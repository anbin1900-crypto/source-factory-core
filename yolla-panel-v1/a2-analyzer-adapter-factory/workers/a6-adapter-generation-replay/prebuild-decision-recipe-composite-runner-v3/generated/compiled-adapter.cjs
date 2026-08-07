'use strict';
const {PlaywrightCrawler,RequestQueue}=require('crawlee');
async function run({startUrl,onReceipt}){const q=await RequestQueue.open('a6-c3-AI001-A6-C3-SMOKE-001');await q.addRequest({url:startUrl});const crawler=new PlaywrightCrawler({requestQueue:q,maxRequestRetries:2,requestHandler:async({page,request})=>{await page.locator('body').waitFor({state:'visible'});await onReceipt({command_id:'AI001-A6-C3-SMOKE-001',page_id:'fixture-smoke-1',request_url:request.url,status:'PASS'});}});await crawler.run();}
module.exports={run};
