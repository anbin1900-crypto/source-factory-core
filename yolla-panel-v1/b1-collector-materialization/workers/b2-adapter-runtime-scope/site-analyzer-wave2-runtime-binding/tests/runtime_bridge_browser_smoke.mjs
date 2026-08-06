import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(ROOT, "ui/index.html"), "utf8")
  .replace(
    '<link rel="stylesheet" href="../../site-analyzer-wave1/ui/visual_analyzer.css">',
    `<style>${fs.readFileSync(path.join(ROOT, "../site-analyzer-wave1/ui/visual_analyzer.css"), "utf8")}</style>`,
  )
  .replace('<script type="module" src="../src/live_visual_analyzer_app.js"></script>', "");
const baseModelSource = fs.readFileSync(path.join(ROOT, "../site-analyzer-wave1/src/analyzer_workspace_model.js"), "utf8");
const modelSource = fs.readFileSync(path.join(ROOT, "src/live_analyzer_workspace_model.js"), "utf8");
const bridgeSource = fs.readFileSync(path.join(ROOT, "src/runtime_bridge_client.js"), "utf8");
const appSource = fs.readFileSync(path.join(ROOT, "src/live_visual_analyzer_app.js"), "utf8");
const fixtureHtml = fs.readFileSync(path.join(ROOT, "../site-analyzer-wave1/fixtures/listing_page.html"), "utf8");

const chrome = spawn(
  "/usr/bin/chromium",
  ["--headless=new", "--no-sandbox", "--disable-gpu", "--remote-debugging-port=0", `--user-data-dir=/tmp/b2-chrome-${process.pid}`, "about:blank"],
  { stdio: ["ignore", "pipe", "pipe"] },
);
let websocketUrl;
for await (const chunk of chrome.stderr) {
  const match = chunk.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/);
  if (match) { websocketUrl = match[1]; break; }
}
if (!websocketUrl) throw new Error("CDP_WS_NOT_FOUND");

const browser = new WebSocket(websocketUrl);
await new Promise((resolve, reject) => { browser.onopen = resolve; browser.onerror = reject; });
let id = 0;
const pending = new Map();
browser.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const [resolve, reject] = pending.get(message.id);
    pending.delete(message.id);
    message.error ? reject(new Error(message.error.message)) : resolve(message.result);
  }
};
const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const requestId = ++id;
  pending.set(requestId, [resolve, reject]);
  browser.send(JSON.stringify({ id: requestId, method, params, ...(sessionId ? { sessionId } : {}) }));
});
const targets = await call("Target.getTargets");
const page = targets.targetInfos.find((target) => target.type === "page");
const { sessionId } = await call("Target.attachToTarget", { targetId: page.targetId, flatten: true });
const evaluate = async (expression) => {
  const output = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (output.exceptionDetails) throw new Error(`EVAL:${output.exceptionDetails.text}:${output.exceptionDetails.exception?.description || ""}`);
  return output.result.value;
};

await evaluate(`(async()=>{
  document.open(); document.write(${JSON.stringify(html)}); document.close();
  const moduleUrl = source => URL.createObjectURL(new Blob([source], {type:'text/javascript'}));
  const base = moduleUrl(${JSON.stringify(baseModelSource)});
  let model = ${JSON.stringify(modelSource)};
  model = model.replace('../../site-analyzer-wave1/src/analyzer_workspace_model.js', base);
  const modelUrl = moduleUrl(model);
  const bridgeUrl = moduleUrl(${JSON.stringify(bridgeSource)});
  let app = ${JSON.stringify(appSource)};
  app = app.replace('./live_analyzer_workspace_model.js', modelUrl).replace('./runtime_bridge_client.js', bridgeUrl);
  await import(moduleUrl(app));
  return true;
})()`);

let ready = false;
for (let attempt = 0; attempt < 50; attempt += 1) {
  ready = await evaluate("Boolean(window.siteAnalyzerWave2?.ready)");
  if (ready) break;
  await new Promise((resolve) => setTimeout(resolve, 100));
}
if (!ready) throw new Error(`APP_NOT_READY:${await evaluate("document.body.innerText.slice(0,500)")}`);

await evaluate(`(()=>{
  const channel = new MessageChannel();
  window.postMessage({type:'YOLLA_ANALYZER_RUNTIME_PORT'}, '*', [channel.port2]);
  const port = channel.port1;
  port.start();
  let sequence = 0;
  const send = (topic, payload) => port.postMessage({topic,payload,sequence:++sequence,sessionId:'HOST',source:'TEST'});
  send('analyzer:runtime-hello',{name:'MessagePortHost',version:'1'});
  send('analyzer:browser-state',{url:'runtime://fixture/list',html:${JSON.stringify(fixtureHtml)},connected:true,title:'Runtime Listings'});
  send('analyzer:a3-event',{event_id:'LIVE-1',sequence:1,classification:{type:'LIST'},request:{method:'GET',resource_type:'XHR',url_pattern:'/api/items'},response:{status:200,size_bytes:100}});
  send('analyzer:a4-candidates',{
    repeated_regions:[{id:'r1',selector:'.listing-card'}],
    field_candidates:[
      {id:'title',name:'title',source_key:'title',selector:'.listing-title'},
      {id:'price',name:'price',source_key:'price',selector:'.price'},
      {id:'area',name:'area',source_key:'area',selector:'.listing-area'},
      {id:'id',name:'id',source_key:'id',selector:'.listing-card'},
      {id:'url',name:'url',source_key:'url',selector:'.listing-title'}
    ],
    locator_candidates:[{id:'l1',selector:'.listing-card'}],
    pagination_candidates:[{id:'p1',selector:'#load-more'}]
  });
  send('analyzer:a5-inference',{mode_decision:'HYBRID',confidence:.95,endpoint_groups:[{id:'api'}],schema_candidates:[{id:'schema'}]});
  send('analyzer:b3-workflow',{steps:[
    {id:'s1',action:'click',label:'Open list'},
    {id:'s2',action:'scroll',label:'Scroll'},
    {id:'s3',action:'click',label:'Open detail'},
    {id:'s4',action:'frame',label:'Enter frame'},
    {id:'s5',action:'popup',label:'Open popup'}
  ]});
  send('analyzer:b5-preview',{
    columns:[
      {id:'title',name:'title',source_key:'title',selector:'.listing-title'},
      {id:'price',name:'price',source_key:'price',selector:'.price'},
      {id:'area',name:'area',source_key:'area',selector:'.listing-area'}
    ],
    records:Array.from({length:10},(_,index)=>({title:'Item '+(index+1),price:(index+1)*100,area:50+index,__source:{record_id:'R'+(index+1)}}))
  });
  window.__runtimePort=port;
  return true;
})()`);

for (let attempt = 0; attempt < 50; attempt += 1) {
  if ((await evaluate("window.siteAnalyzerWave2.getState().previewRows.length")) === 10) break;
  await new Promise((resolve) => setTimeout(resolve, 100));
}
await evaluate("window.siteAnalyzerWave2.setPickerEnabled(true)");
for (let attempt = 0; attempt < 30; attempt += 1) {
  if (await evaluate("document.querySelector('#live-browser-frame').contentDocument?.querySelector('.listing-title')!=null")) break;
  await new Promise((resolve) => setTimeout(resolve, 100));
}
await evaluate("window.siteAnalyzerWave2.selectElementBySelector('.listing-title')");
await evaluate("window.siteAnalyzerWave2.model.updateWorkflowStep('s1',{label:'Open live list'});window.siteAnalyzerWave2.model.moveWorkflowStep('s5','up');true");
await evaluate("window.siteAnalyzerWave2.renameField('title','name');window.siteAnalyzerWave2.applyFields();true");

const state = await evaluate("window.siteAnalyzerWave2.getState()");
const highlights = await evaluate("window.siteAnalyzerWave2.applyHighlights()");
const result = {
  status: "PASS",
  transport_names: state.runtime.transportNames,
  runtime_host_connected: state.runtime.hostConnected,
  runtime_inbound_count: state.runtime.inboundCount,
  a3_event_count: state.a3Events.length,
  field_candidate_count: state.fieldCandidates.length,
  workflow_step_count: state.workflow.filter((step) => step.source === "B-3").length,
  workflow_first_label: state.workflow.find((step) => step.id === "s1").label,
  preview_row_count: state.previewRows.length,
  preview_column_count: state.previewColumns.length,
  mode: state.modeDecision.mode,
  selected_selector: state.selectedElement.selector,
  highlight_counts: highlights,
  static_fixture_auto_loaded: false,
};
if (
  !result.runtime_host_connected ||
  !result.transport_names.includes("MESSAGE_PORT") ||
  result.preview_row_count !== 10 ||
  result.workflow_step_count !== 5 ||
  result.mode !== "HYBRID" ||
  !result.selected_selector ||
  result.highlight_counts.repeat < 3 ||
  result.highlight_counts.field < 6 ||
  result.highlight_counts.pagination < 1
) throw new Error(`SMOKE_ASSERTION_FAILED:${JSON.stringify(result)}`);

console.log(JSON.stringify(result));
browser.close();
chrome.kill("SIGTERM");
