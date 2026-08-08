'use strict';

const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i];
    if (!k || !k.startsWith('--') || i + 1 >= argv.length) throw new Error(`INVALID_ARGUMENT:${k || ''}`);
    out[k.slice(2)] = argv[i + 1];
  }
  return out;
}
function iso(v) { const d = v ? new Date(v) : new Date(); if (!Number.isFinite(d.getTime())) throw new Error('INVALID_TIMESTAMP'); return d.toISOString(); }
function parseContextId(url) {
  try {
    const u = new URL(url); const p = u.pathname.split('/').filter(Boolean);
    for (let i=0;i<p.length-1;i++) if (p[i] === 'c' && p[i+1]) return p[i+1];
  } catch {}
  return null;
}
function cleanTitle(v) { return String(v || '').replace(/\s*[|·-]\s*ChatGPT\s*$/i,'').trim() || null; }
function isChatGptUrl(v) { try { return ['chatgpt.com','www.chatgpt.com','chat.openai.com'].includes(new URL(v).hostname.toLowerCase()); } catch { return false; } }

async function fetchJson(url, timeoutMs=5000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeoutMs);
  try { const r = await fetch(url, {signal:ac.signal}); if (!r.ok) throw new Error(`HTTP_${r.status}`); return await r.json(); }
  finally { clearTimeout(t); }
}

function cdpEvaluate(webSocketDebuggerUrl, expression, timeoutMs=5000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(webSocketDebuggerUrl); const id = 1;
    const timer = setTimeout(() => { try { ws.close(); } catch {} reject(new Error('CDP_EVALUATE_TIMEOUT')); }, timeoutMs);
    ws.addEventListener('open', () => ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}})));
    ws.addEventListener('message', (event) => {
      let msg; try { msg = JSON.parse(String(event.data)); } catch { return; }
      if (msg.id !== id) return;
      clearTimeout(timer); try { ws.close(); } catch {}
      if (msg.error || msg.result?.exceptionDetails) return reject(new Error('CDP_RUNTIME_EVALUATE_FAILED'));
      resolve(msg.result?.result?.value || null);
    });
    ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP_WEBSOCKET_ERROR')); });
  });
}

function buildExpression(roleMarker, cycleMarker) {
  return `(() => { const body=(document.body?.innerText||''); const generating=!!document.querySelector('button[data-testid="stop-button"],[data-testid="stop-button"],button[aria-label*="Stop"],button[title*="Stop"],button[aria-label*="중지"]'); return {url:location.href,title:document.title,role_match:body.includes(${JSON.stringify(roleMarker)}),cycle_match:body.includes(${JSON.stringify(cycleMarker)}),generating_ui_active:generating,assistant_message_count:document.querySelectorAll('[data-message-author-role="assistant"]').length}; })()`;
}

async function probe(input) {
  const list = await fetchJson(input.cdpListUrl || 'http://127.0.0.1:9222/json/list', 5000);
  if (!Array.isArray(list)) throw new Error('CDP_PAGE_LIST_NOT_ARRAY');
  const candidates = list.filter(x => x && x.type === 'page' && isChatGptUrl(x.url) && x.webSocketDebuggerUrl);
  const observed = [];
  const expr = buildExpression(input.roleMarker, input.cycleMarker);
  for (const target of candidates) {
    try {
      const dom = await cdpEvaluate(target.webSocketDebuggerUrl, expr, 5000);
      observed.push({page_id:target.id,url:dom?.url || target.url,title:dom?.title || target.title || null,role_match:Boolean(dom?.role_match),cycle_match:Boolean(dom?.cycle_match),generating_ui_active:Boolean(dom?.generating_ui_active),assistant_message_count:Number(dom?.assistant_message_count||0)});
    } catch (error) {
      observed.push({page_id:target.id,url:target.url,title:target.title||null,probe_error:error.message});
    }
  }
  const matches = observed.filter(x => x.role_match && x.cycle_match);
  if (matches.length === 0) { const e=new Error('D2_CONTEXT_MARKER_PAGE_NOT_FOUND'); e.detail={chatgpt_page_count:candidates.length,observed_page_count:observed.length}; throw e; }
  if (matches.length !== 1) { const e=new Error('D2_CONTEXT_MARKER_PAGE_AMBIGUOUS'); e.detail={match_count:matches.length,page_ids:matches.map(x=>x.page_id)}; throw e; }
  const m=matches[0]; const contextId=parseContextId(m.url);
  if (!contextId) { const e=new Error('D2_CONTEXT_ID_NOT_RESOLVED'); e.detail={page_id:m.page_id,url:m.url}; throw e; }
  const now=iso();
  return {
    schema_version:'D2_ACTIVE_CONTEXT_LIVE_RECEIPT_V1',
    cycle_id:input.cycleId,
    terminal:'ACTIVE_CONTEXT_IDENTIFICATION_LIVE_PASS',
    ROLE_ID:input.roleId,
    CONTEXT_ID:contextId,
    CONTEXT_NAME:cleanTitle(m.title),
    PAGE_ID:m.page_id,
    COMMAND_ID:input.commandId,
    WORK_STATUS:m.generating_ui_active?'WORKING':'RESULT_PENDING',
    STARTED_AT:iso(input.startedAt),
    LAST_SEEN_AT:now,
    binding_state:'LIVE_EXACT_ROLE_AND_CYCLE_MARKER_BOUND',
    marker_match_count:1,
    chatgpt_page_count:candidates.length,
    generating_ui_active:m.generating_ui_active,
    source_reuse:{page_registry:'PR22/WORKER_PAGE_REGISTRY_V1',view_model:'PR38/WORKER_STATE_PANEL_VIEWMODEL_V1'},
    raw_conversation_persisted:false,
    secret_exposure_count:0,
    target_pc_live_readback:true,
    production:false
  };
}

async function main() {
  const a=parseArgs(process.argv.slice(2));
  const input={roleId:a['role-id'],cycleId:a['cycle-id'],commandId:a['command-id'],roleMarker:a['role-marker'],cycleMarker:a['cycle-marker'],startedAt:a['started-at'],receiptPath:a['receipt-path'],cdpListUrl:a['cdp-list-url']};
  for (const k of ['roleId','cycleId','commandId','roleMarker','cycleMarker','startedAt','receiptPath']) if (!input[k]) throw new Error(`MISSING_${k}`);
  let receipt;
  try { receipt=await probe(input); }
  catch (error) {
    receipt={schema_version:'D2_ACTIVE_CONTEXT_LIVE_RECEIPT_V1',cycle_id:input.cycleId,terminal:'ACTIVE_CONTEXT_IDENTIFICATION_LIVE_BLOCKED',status:'BLOCKED',blocker_code:error.message,blocker_detail:error.detail||null,ROLE_ID:input.roleId,CONTEXT_ID:null,CONTEXT_NAME:null,PAGE_ID:null,COMMAND_ID:input.commandId,WORK_STATUS:'REVIEW_REQUIRED',STARTED_AT:iso(input.startedAt),LAST_SEEN_AT:iso(),raw_conversation_persisted:false,secret_exposure_count:0,target_pc_live_readback:false,production:false};
    fs.mkdirSync(path.dirname(input.receiptPath),{recursive:true}); fs.writeFileSync(input.receiptPath,JSON.stringify(receipt,null,2)+'\n');
    process.stdout.write(`D2_ACTIVE_CONTEXT_RECEIPT_JSON=${JSON.stringify(receipt)}\n`); process.exitCode=30; return;
  }
  fs.mkdirSync(path.dirname(input.receiptPath),{recursive:true}); fs.writeFileSync(input.receiptPath,JSON.stringify(receipt,null,2)+'\n');
  process.stdout.write(`D2_ACTIVE_CONTEXT_RECEIPT_JSON=${JSON.stringify(receipt)}\n`);
}

if (require.main===module) main().catch(error=>{process.stderr.write(`${error.stack||error}\n`);process.exit(31);});
module.exports={parseContextId,cleanTitle,buildExpression,probe};
