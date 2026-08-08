import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const endpoint = process.env.CDP_ENDPOINT || "http://127.0.0.1:19226";
const list = await fetch(`${endpoint}/json/list`).then(r=>r.json());
const page = list.find(x=>x.type==="page");
if (!page) throw new Error("CDP_PAGE_NOT_FOUND");
const ws = new WebSocket(page.webSocketDebuggerUrl);
let seq=0; const pending=new Map();
ws.onmessage=(event)=>{const msg=JSON.parse(event.data);if(msg.id&&pending.has(msg.id)){const {resolve,reject}=pending.get(msg.id);pending.delete(msg.id);msg.error?reject(new Error(JSON.stringify(msg.error))):resolve(msg.result);}};
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const result=await send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value;}
await send("Page.enable"); await send("Runtime.enable");

const htmlSource = fs.readFileSync(path.join(ROOT,"ui/index.html"),"utf8");
const css = fs.readFileSync(path.join(ROOT,"ui/visual_analyzer.css"),"utf8");
const frameHtml = fs.readFileSync(path.join(ROOT,"fixtures/listing_page.html"),"utf8");
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT,"fixtures/analyzer_event_stream.json"),"utf8"));
let body = htmlSource.match(/<body>([\s\S]*?)<script type="module"/i)?.[1] || "";
body = body.replace('src="../fixtures/listing_page.html"', 'src="about:blank"');
const documentHtml = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`;
await evaluate(`document.open();document.write(${JSON.stringify(documentHtml)});document.close();true`);
await evaluate(`globalThis.__B2_FIXTURE__=${JSON.stringify(fixture)};globalThis.fetch=async()=>({ok:true,status:200,json:async()=>structuredClone(globalThis.__B2_FIXTURE__)});true`);
let modelCode = fs.readFileSync(path.join(ROOT,"src/analyzer_workspace_model.js"),"utf8")
  .replace("export const SUPPORTED_MODES", "globalThis.SUPPORTED_MODES")
  .replace("export class AnalyzerWorkspaceModel", "globalThis.AnalyzerWorkspaceModel = class AnalyzerWorkspaceModel");
await evaluate(`${modelCode}\ntrue`);
let appCode = fs.readFileSync(path.join(ROOT,"src/visual_analyzer_app.js"),"utf8")
  .replace(/^import[^\n]+\n/, "");
await evaluate(`(async()=>{${appCode}\nreturn true;})()`);
await evaluate(`new Promise((resolve)=>{const frame=document.querySelector('#live-browser-frame');frame.addEventListener('load',()=>resolve(true),{once:true});frame.srcdoc=${JSON.stringify(frameHtml)};})`);
for(let i=0;i<100;i++){const ready=await evaluate("Boolean(window.siteAnalyzerWave1?.ready)");if(ready)break;await new Promise(r=>setTimeout(r,50));if(i===99)throw new Error("ANALYZER_READY_TIMEOUT");}
const initial=await evaluate("window.siteAnalyzerWave1.getState()");
assert.equal(initial.previewRows.length,3);assert.equal(initial.previewColumns.length,6);assert.equal(initial.modeDecision.mode,"DOM");
await evaluate("window.siteAnalyzerWave1.setPickerEnabled(true)");
await evaluate("window.siteAnalyzerWave1.selectElementBySelector('.listing-title')");
const selected=await evaluate("window.siteAnalyzerWave1.getState().selectedElement");
assert.ok(selected.selector.includes("listing-title"));
const highlights=await evaluate("window.siteAnalyzerWave1.applyHighlights()");
assert.ok(highlights.repeat>=3);assert.ok(highlights.field>=15);assert.ok(highlights.pagination>=1);
await evaluate("window.siteAnalyzerWave1.renameField('field-title','매물명')");
await evaluate("window.siteAnalyzerWave1.removeField('field-agency')");
await evaluate("window.siteAnalyzerWave1.applyFields()");
const edited=await evaluate("window.siteAnalyzerWave1.getState()");
assert.equal(edited.previewColumns.length,5);assert.equal(edited.previewColumns[0].name,"매물명");
const visible=await evaluate("document.querySelectorAll('.preview-table tbody tr').length");
assert.equal(visible,3);
console.log(JSON.stringify({status:"PASS",element_selection_working:true,highlight_working:true,data_preview_visible:true,selected_selector:selected.selector,highlight_counts:highlights,preview_rows:visible,preview_columns:edited.previewColumns.length},null,2));
ws.close();
