'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function get(name){const i=process.argv.indexOf(name);if(i<0||!process.argv[i+1])throw new Error(`MISSING_${name}`);return process.argv[i+1];}
function sha(p){return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}
const release=get('--release'),pkg=get('--package'),receipt=get('--receipt');
const main=path.join(release,'main.js'),html=path.join(release,'workspace.html');
const bridgeSrc=path.join(pkg,'automation-c-v1','workspace_ui_truth_bridge.cjs');
const cssSrc=path.join(pkg,'workspace_c_mode_rc4_truth.css');
const jsSrc=path.join(pkg,'workspace_c_mode_rc4_truth.js');
for(const p of [main,html,bridgeSrc,cssSrc,jsSrc])if(!fs.existsSync(p))throw new Error(`MISSING:${p}`);
const backupDir=path.join(release,'.w3-rc7-backup');fs.mkdirSync(backupDir,{recursive:true});
for(const p of [main,html])fs.copyFileSync(p,path.join(backupDir,path.basename(p)));
const bridgeDst=path.join(release,'automation-c-v1','workspace_ui_truth_bridge.cjs');fs.mkdirSync(path.dirname(bridgeDst),{recursive:true});fs.copyFileSync(bridgeSrc,bridgeDst);
fs.copyFileSync(cssSrc,path.join(release,'workspace_c_mode_rc4_truth.css'));fs.copyFileSync(jsSrc,path.join(release,'workspace_c_mode_rc4_truth.js'));
let mainText=fs.readFileSync(main,'utf8');const marker='YOLLA_W3_RC6_UI_LOAD_HOOK_V1_BEGIN';
if(!mainText.includes(marker))mainText+=`\n// ${marker}\ntry { require('./automation-c-v1/workspace_ui_truth_bridge.cjs'); } catch (error) { console.error('W3_UI_TRUTH_BRIDGE_LOAD_FAILED', error); }\n// YOLLA_W3_RC6_UI_LOAD_HOOK_V1_END\n`;
fs.writeFileSync(main,mainText);
let htmlText=fs.readFileSync(html,'utf8');if(!htmlText.includes('workspace_c_mode_rc4_truth.css'))htmlText=htmlText.replace('</head>','<link rel="stylesheet" href="workspace_c_mode_rc4_truth.css"></head>');if(!htmlText.includes('workspace_c_mode_rc4_truth.js'))htmlText=htmlText.replace('</body>','<script src="workspace_c_mode_rc4_truth.js"></script></body>');fs.writeFileSync(html,htmlText);
const out={schema_version:'W3_RC7_UI_HOOK_RECEIPT_V1',status:'PASS',main_js_sha256:sha(main),workspace_html_sha256:sha(html),bridge_sha256:sha(bridgeDst),css_sha256:sha(path.join(release,'workspace_c_mode_rc4_truth.css')),js_sha256:sha(path.join(release,'workspace_c_mode_rc4_truth.js')),backup_dir:backupDir};fs.writeFileSync(receipt,JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));
