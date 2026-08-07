#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const MARKER='YOLLA_W3_RC6_UI_LOAD_HOOK_V1';
const CSS_HOOK='<link rel="stylesheet" href="./workspace_c_mode_rc4_truth.css" data-yolla-overlay="w3-rc6">';
const JS_HOOK='<script src="./workspace_c_mode_rc4_truth.js" data-yolla-overlay="w3-rc6"></script>';
const MAIN_BEGIN=`// ${MARKER}_BEGIN`;
const MAIN_END=`// ${MARKER}_END`;
const MAIN_BLOCK=`${MAIN_BEGIN}\nconst yollaW3UiTruthBridge = require("./automation-c-v1/workspace_ui_truth_bridge.cjs");\nglobalThis.__YOLLA_W3_UI_TRUTH_BRIDGE__ = yollaW3UiTruthBridge;\n${MAIN_END}`;
const MEMBERS=[
 {rel:'runtime-files/automation-c-v1/workspace_ui_truth_bridge.cjs',dest:'automation-c-v1/workspace_ui_truth_bridge.cjs',sha256:'8086f56f1f0b5731cb9ad4be5339fc211d1468f4195fcf249b7a300cc3b830e8'},
 {rel:'runtime-files/workspace_c_mode_rc4_truth.css',dest:'workspace_c_mode_rc4_truth.css',sha256:'43b6a3721c250e76b2562c45d931fd17d87ae219fec70aa3ef3206af9cd8b0fe'},
 {rel:'runtime-files/workspace_c_mode_rc4_truth.js',dest:'workspace_c_mode_rc4_truth.js',sha256:'5fdd1719e110ce80ad4b3efb911fd20a86ccbfeb27182645e8d2170287114b54'}
];
function hash(body){return crypto.createHash('sha256').update(body).digest('hex');}
function read(file){return fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'');}
function write(file,text){fs.writeFileSync(file,text,'utf8');}
function count(text,token){return text.split(token).length-1;}
function insertAfterOnce(text,anchor,hook,label){
 const hc=count(text,hook); if(hc===1)return {text,changed:false}; if(hc>1)throw new Error(`DUPLICATE_${label}_HOOK`);
 if(count(text,anchor)!==1)throw new Error(`${label}_ANCHOR_COUNT_NOT_ONE`);
 const eol=text.includes('\r\n')?'\r\n':'\n'; return {text:text.replace(anchor,anchor+eol+'  '+hook),changed:true};
}
function patchMain(text){
 const mc=count(text,MAIN_BEGIN); if(mc===1&&count(text,MAIN_END)===1)return {text,changed:false}; if(mc||count(text,MAIN_END))throw new Error('PARTIAL_OR_DUPLICATE_MAIN_HOOK');
 const anchor='"use strict";'; if(count(text,anchor)!==1)throw new Error('MAIN_USE_STRICT_ANCHOR_COUNT_NOT_ONE');
 const eol=text.includes('\r\n')?'\r\n':'\n'; return {text:text.replace(anchor,anchor+eol+MAIN_BLOCK.replace(/\n/g,eol)),changed:true};
}
function copyExact(packageRoot,targetRoot){
 const copied=[];
 for(const m of MEMBERS){const src=path.join(packageRoot,m.rel); if(!fs.existsSync(src))throw new Error(`PACKAGE_MEMBER_MISSING:${m.rel}`); const body=fs.readFileSync(src); if(hash(body)!==m.sha256)throw new Error(`EXACT_SOURCE_HASH_MISMATCH:${m.rel}`); const dst=path.join(targetRoot,m.dest); fs.mkdirSync(path.dirname(dst),{recursive:true}); if(fs.existsSync(dst)){const existing=fs.readFileSync(dst);if(hash(existing)!==m.sha256)throw new Error(`OVERLAY_DESTINATION_CONFLICT:${m.dest}`);}else fs.copyFileSync(src,dst); copied.push({destination:m.dest,sha256:m.sha256});}
 return copied;
}
function parse(argv){const o={};for(let i=2;i<argv.length;i+=2){if(!argv[i]?.startsWith('--')||argv[i+1]==null)throw new Error('BAD_ARG');o[argv[i].slice(2)]=argv[i+1];}for(const k of ['release','package','receipt'])if(!o[k])throw new Error(`MISSING_ARG:${k}`);return o;}
function apply(releaseRoot,packageRoot){
 const mainPath=path.join(releaseRoot,'main.js'),htmlPath=path.join(releaseRoot,'workspace.html');
 for(const f of [mainPath,htmlPath,path.join(releaseRoot,'workspace_c_mode.js'),path.join(releaseRoot,'workspace_c_mode.css')])if(!fs.existsSync(f))throw new Error(`BASELINE_RENDERER_FILE_MISSING:${path.basename(f)}`);
 const before={main_sha256:hash(fs.readFileSync(mainPath)),workspace_html_sha256:hash(fs.readFileSync(htmlPath)),base_js_sha256:hash(fs.readFileSync(path.join(releaseRoot,'workspace_c_mode.js'))),base_css_sha256:hash(fs.readFileSync(path.join(releaseRoot,'workspace_c_mode.css')))};
 const copied=copyExact(packageRoot,releaseRoot);
 let html=read(htmlPath); const css=insertAfterOnce(html,'<link rel="stylesheet" href="./workspace_c_mode.css">',CSS_HOOK,'CSS'); html=css.text; const js=insertAfterOnce(html,'<script src="./workspace_c_mode.js"></script>',JS_HOOK,'JS'); html=js.text;
 const main=patchMain(read(mainPath));
 if(css.changed||js.changed)write(htmlPath,html); if(main.changed)write(mainPath,main.text);
 const after={main_sha256:hash(fs.readFileSync(mainPath)),workspace_html_sha256:hash(fs.readFileSync(htmlPath)),base_js_sha256:hash(fs.readFileSync(path.join(releaseRoot,'workspace_c_mode.js'))),base_css_sha256:hash(fs.readFileSync(path.join(releaseRoot,'workspace_c_mode.css')))};
 if(before.base_js_sha256!==after.base_js_sha256||before.base_css_sha256!==after.base_css_sha256)throw new Error('BASE_UI_BYTES_CHANGED');
 const finalHtml=read(htmlPath),finalMain=read(mainPath);
 if(count(finalHtml,CSS_HOOK)!==1||count(finalHtml,JS_HOOK)!==1||count(finalMain,MAIN_BEGIN)!==1)throw new Error('LOAD_HOOK_POSTCONDITION_FAILED');
 if(finalHtml.indexOf(CSS_HOOK)<finalHtml.indexOf('workspace_c_mode.css'))throw new Error('CSS_LOAD_ORDER_INVALID');
 if(finalHtml.indexOf(JS_HOOK)<finalHtml.indexOf('workspace_c_mode.js'))throw new Error('JS_LOAD_ORDER_INVALID');
 return {schema_version:'W3_RC6_UI_LOAD_HOOK_PATCH_RECEIPT_V1',status:'PASS',target_version:'5.10.2.4.2-rc6',marker:MARKER,changed:Boolean(css.changed||js.changed||main.changed),exact_ui_source_bytes:true,css_load_after_base_css:true,js_load_after_base_js:true,bridge_load_before_ui_overlay:true,base_ui_preserved:true,fixed_browser_profile_unchanged:true,authority:{state_root:'E:\\SOURCE FACTORY\\.yolla\\yolla-workspace-v5-2',release_root:'E:\\SOURCE FACTORY\\.yolla\\yolla-panel\\releases',browser_profile:'E:\\SOURCE FACTORY\\.yolla\\yolla-workspace-browser-profile',worker_partition:'persist:sf4-safe-panel-worker-1',analysis_partition:'persist:yolla-analysis-browser-v1'},before,after,copied,live_pass_claimed:false};
}
if(require.main===module){const a=parse(process.argv);const r=apply(path.resolve(a.release),path.resolve(a.package));fs.mkdirSync(path.dirname(path.resolve(a.receipt)),{recursive:true});fs.writeFileSync(a.receipt,JSON.stringify(r,null,2)+'\n');console.log(`W3_RC6_UI_PATCH_PASS changed=${r.changed}`);}
module.exports={apply,MARKER,CSS_HOOK,JS_HOOK,MAIN_BEGIN,MAIN_END,MAIN_BLOCK,MEMBERS,hash};
