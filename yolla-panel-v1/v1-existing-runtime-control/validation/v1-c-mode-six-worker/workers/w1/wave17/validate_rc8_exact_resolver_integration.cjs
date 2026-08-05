'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto');
const H=b=>crypto.createHash('sha256').update(b).digest('hex');
const B=p=>fs.readFileSync(p),T=p=>fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n'),J=p=>JSON.parse(T(p));
function die(c,d={}){const e=new Error(c);e.code=c;e.detail=d;throw e}
function args(a){const o={};for(let i=0;i<a.length;i+=2){if(!a[i+1])die('ARG_VALUE_MISSING',{arg:a[i]});o[a[i].replace(/^--/,'')]=a[i+1]}if(!o.bundle)die('BUNDLE_REQUIRED');return o}
function id(p,x){const b=B(p),a={size_bytes:b.length,sha256:H(b)};return{pass:a.size_bytes===x.size_bytes&&a.sha256===x.sha256,actual:a,expected:{size_bytes:x.size_bytes,sha256:x.sha256}}}
function sem(s){const q=[
['STRICT_CHILD',/function\s+assertStrictChild\b/.test(s)&&/PATH_OUTSIDE_RELEASE_ROOT/.test(s)],
['PACKAGE_JSON',/package\.json/.test(s)&&/BASE_PACKAGE_JSON_MISSING/.test(s)],
['VERSION',/BASELINE_VERSION_MISMATCH/.test(s)],['PACKAGE_MAIN',/pkg\.main/.test(s)&&/BASE_EXECUTABLE_ENTRY_UNDECLARED/.test(s)],
['MAIN_JS',/BASE_MAIN_JS_MISSING/.test(s)],['WORKSPACE_HTML',/BASE_WORKSPACE_HTML_MISSING/.test(s)],
['ENTRY',/BASE_EXECUTABLE_ENTRY_MISSING/.test(s)&&/BASE_EXECUTABLE_ENTRY_ESCAPES_RELEASE/.test(s)],
['EXACT_ONE',/BASELINE_CANDIDATE_COUNT_ZERO/.test(s)&&/BASELINE_CANDIDATE_COUNT_MULTIPLE/.test(s)],
['IMMUTABLE_BACKUP',/LAUNCHER_BACKUP_BYTE_MISMATCH/.test(s)&&/flag:\s*'wx'/.test(s)],
['TREE_HASH',/function\s+inventoryTree\b/.test(s)&&/BASELINE_RECURSIVE_CLONE_MISMATCH/.test(s)],
['NO_OVERWRITE',/CANDIDATE_RELEASE_ALREADY_EXISTS/.test(s)],['NO_GUESS',/guessed_path_count:\s*0/.test(s)],
['EXPORTS',/module\.exports[\s\S]*runResolver/.test(s)]];
return{pass:q.every(x=>x[1]),checks:q.map(([id,passed])=>({id,passed})),findings:q.filter(x=>!x[1]).map(x=>x[0])}}
function inst(s,sha,size){const q=[
['SHA_BOUND',s.includes(sha)],['SIZE_BOUND',new RegExp(`ExpectedResolverSize\\s*=\\s*${size}`).test(s)],
['HASH_CHECK',/Get-FileHash[\s\S]{0,220}ExpectedResolverSha256/i.test(s)],['SIZE_CHECK',/Get-Item[\s\S]{0,180}\.Length[\s\S]{0,180}ExpectedResolverSize/i.test(s)],
['INVOKE',/&\s+node\s+\$ResolverPath\s+@ResolverArgs/i.test(s)],['EXIT',/\$LASTEXITCODE\s*-ne\s*0/.test(s)],
['ARGS',['-ReleaseRoot','-BaselineVersion','-TargetVersion','-CandidateReleasePath','-LauncherPath','-StateRoot','-ReceiptPath'].every(x=>s.includes(`'${x}'`))],
['BASE_FORWARD',/if\s*\(\$BaseReleasePath\)[\s\S]{0,120}'-BaseReleasePath'/.test(s)],['PARSE',/ConvertFrom-Json/.test(s)],
['NO_GUESS_ASSERT',/guessed_path_count\s*-ne\s*0/.test(s)],['CLONE_ASSERT',/baseline_clone_performed\s*-ne\s*\$true/.test(s)],
['USE_BASE#,/\.baseline\.path/.test(s)],['USE_CANDIDATE',/\.clone\.candidate_release_path/.test(s)],
['USE_TREE',/\.clone\.baseline_tree_sha256/.test(s)],['USE_LAUNCHER_SHA',/\.launcher\.launcher_sha256/.test(s)],
['USE_BACKUP',/\.launcher\.launcher_backup_path/.test(s)],['NO_INLINE_DISCOVERY',!/Get-ChildItem[\s\S]{0,300}\$ReleaseRoot/i.test(s)],
['NO_INLINE_CLONE',!/Copy-Item[\s\S]{0,220}\$BaseReleasePath/i.test(s)],['NO_INLINE_BACKUP',!/WriteAllBytes[\s\S]{0,220}\$LauncherPath/i.test(s)]];
return{pass:q.every(x=>x[1]),checks:q.map(([id,passed])=>({id,passed})),findings:q.filter(x=>!x[1]).map(x=>x[0])}}
function ec(fn,c){try{fn()}catch(e){return e.code===c}return false}
function base(d,o={}){fs.mkdirSync(d,{recursive:true});const p={name:'f',version:o.version||'5.10.2.4.0'};if(o.main!==null)p.main=o.main||'main.js';fs.writeFileSync(path.join(d,'package.json'),JSON.stringify(p));if(o.mainjs!==false)fs.writeFileSync(path.join(d,'main.js'),"'use strict';\n");if(o.html!==false)fs.writeFileSync(path.join(d,'workspace.html'),'<html></html>\n');if(p.main&&p.main!=='main.js'&&o.entry!==false){const e=path.resolve(d,p.main);fs.mkdirSync(path.dirname(e),{recursive:true});fs.writeFileSync(e,'x')}fs.mkdirSync(path.join(d,'n'),{recursive:true});fs.writeFileSync(path.join(d,'n','a'),'a')}
function behavior(rp){delete require.cache[require.resolve(rp)];const r=require(rp),d=fs.mkdtempSync(path.join(os.tmpdir(),'rc8-')),z=[];const a=(id,p)=>z.push({id,passed:!!p});try{
const rr=path.join(d,'r'),b=path.join(rr,'b');base(b);a('EXPLICIT',r.validateBaselineCandidate(b,{releaseRoot:rr,baselineVersion:'5.10.2.4.0'}).version==='5.10.2.4.0');
const out=path.join(d,'out');base(out);a('OUTSIDE',ec(()=>r.validateBaselineCandidate(out,{releaseRoot:rr,baselineVersion:'5.10.2.4.0'}),'PATH_OUTSIDE_RELEASE_ROOT'));
const iv=path.join(rr,'iv');base(iv,{version:'0'});a('VERSION',ec(()=>r.validateBaselineCandidate(iv,{releaseRoot:rr,baselineVersion:'5.10.2.4.0'}),'BASELINE_VERSION_MISMATCH'));
const np=path.join(rr,'np');base(np,{main:null});a('PACKAGE_MAIN',ec(()=>r.validateBaselineCandidate(np,{releaseRoot:rr,baselineVersion:'5.10.2.4.0'}),'BASE_EXECUTABLE_ENTRY_UNDECLARED'));
const nm=path.join(rr,'nm');base(nm,{mainjs:false});a('MAIN_JS',ec(()=>r.validateBaselineCandidate(nm,{releaseRoot:rr,baselineVersion:'5.10.2.4.0'}),'BASE_MAIN_JS_MISSING'));
const nh=path.join(rr,'nh');base(nh,{html:false});a('HTML',ec(()=>r.validateBaselineCandidate(nh,{releaseRoot:rr,baselineVersion:'5.10.2.4.0'}),'BASE_WORKSPACE_HTML_MISSING'));
const ne=path.join(rr,'ne');base(ne,{main:'e.cjs',entry:false});a('ENTRY',ec(()=>r.validateBaselineCandidate(ne,{releaseRoot:rr,baselineVersion:'5.10.2.4.0'}),'BASE_EXECUTABLE_ENTRY_MISSING'));
const one=path.join(d,'one'),ob=path.join(one,'x');base(ob);a('ONE',r.discoverExactlyOneBaseline({releaseRoot:one,baselineVersion:'5.10.2.4.0'}).path===path.resolve(ob));
const zero=path.join(d,'zero');fs.mkdirSync(zero);a('ZERO',ec(()=>r.discoverExactlyOneBaseline({releaseRoot:zero,baselineVersion:'5.10.2.4.0'}),'BASELINE_CANDIDATE_COUNT_ZERO'));
const mul=path.join(d,'mul');base(path.join(mul,'a'));base(path.join(mul,'b'));a('MULTIPLE',ec(()=>r.discoverExactlyOneBaseline({releaseRoot:mul,baselineVersion:'5.10.2.4.0'}),'BASELINE_CANDIDATE_COUNT_MULTIPLE'));
const run=path.join(d,'run'),rb=path.join(run,'base'),rc=path.join(run,'5.10.2.4.2-rc8'),st=path.join(d,'state'),la=path.join(d,'l.bat');base(rb);fs.mkdirSync(st);fs.writeFileSync(la,'@echo off\r\n');const x=r.runResolver({releaseRoot:run,baseReleasePath:rb,baselineVersion:'5.10.2.4.0',targetVersion:'5.10.2.4.2-rc8',candidateReleasePath:rc,launcherPath:la,stateRoot:st});
a('CLONE',x.baseline_clone_performed===true);a('TREE',x.clone.baseline_tree_sha256===r.inventoryTree(rb).tree_sha256&&r.inventoryTree(rb).tree_sha256===r.inventoryTree(rc).tree_sha256);a('NO_GUESS',x.guessed_path_count===0);a('LAUNCHER_SHA',/^[0-9a-f]{64}$/.test(x.launcher.launcher_sha256));a('BACKUP',fs.existsSync(x.launcher.launcher_backup_path));a('OVERWRITE',ec(()=>r.cloneCompleteBaseline(rb,rc,{releaseRoot:run}),'CANDIDATE_RELEASE_ALREADY_EXISTS'));const old=B(x.launcher.launcher_backup_path);fs.writeFileSync(x.launcher.launcher_backup_path,'bad');a('BACKUP_MISMATCH',ec(()=>r.launcherReadbackAndBackup({launcherPath:la,stateRoot:st}),'LAUNCHER_BACKUP_BYTE_MISMATCH'));fs.writeFileSync(x.launcher.launcher_backup_path,old)
}finally{fs.rmSync(d,{recursive:true,force:true})}return{pass:z.every(x=>x.passed),checks:z}}
function main(){const o=args(process.argv.slice(2)),bp=path.resolve(o.bundle),d=path.dirname(bp),b=J(bp),rv={pass:b.schema_version==='RC8_EXACT_RESOLVER_BUNDLE_V1'&&b.wave_id==='V1-C-MODE-6W-WAVE-017'&&b.result_key===`${b.directive_comment}00`&&b.target_version==='5.10.2.4.2-rc8'&&b.exact_resolver.commit==='ed8bde5eb66f0d65de64ad1dfae4fde038e6012c'&&b.exact_resolver.rewrite_allowed===false},rp=path.resolve(d,b.exact_resolver.relative_checkout_path),hp=path.resolve(d,b.handoff.relative_checkout_path),nr=path.resolve(d,b.rc7_negative_fixture.fixture_path),pi=path.resolve(d,b.fixtures.positive_installer),ni=path.resolve(d,b.fixtures.negative_installer),ri=id(rp,b.exact_resolver),hi=id(hp,b.handoff),nri=id(nr,b.rc7_negative_fixture),es=sem(T(rp)),ns=sem(T(nr)),ps=inst(T(pi),b.exact_resolver.sha256,b.exact_resolver.size_bytes),nis=inst(T(ni),b.exact_resolver.sha256,b.exact_resolver.size_bytes),bf=behavior(rp),reject=nri.pass&&nri.actual.sha256!==b.exact_resolver.sha256&&nri.actual.size_bytes!==b.exact_resolver.size_bytes&&!ns.pass,pass=rv.pass&&ri.pass&&hi.pass&&nri.pass&&es.pass&&reject&&ps.pass&&!nis.pass&&bf.pass,count=4+2+2+2+es.checks.length+ns.checks.length+ps.checks.length+nis.checks.length+bf.checks.length+1,receipt={schema_version:'RC8_EXACT_RESOLVER_BUNDLE_VALIDATION_RECEIPT_V1',status:pass?'PASS_EXACT_RESOLVER_BUNDLE':'FAIL_EXACT_RESOLVER_BUNDLE',control_id:b.control_id,wave_id:b.wave_id,result_key:b.result_key,assertion_count:count,failure_count:pass?0:1,exact_resolver_identity:ri,handoff_identity:hi,rc7_negative_identity:nri,exact_semantics:es,rc7_missing_semantics:ns.findings,rc7_simplified_rejected:reject,positive_installer_pass:ps.pass,negative_installer_rejected:!nis.pass,negative_installer_findings:nis.findings,behavior:bf,resolver_rewritten:false,guessed_path_count:0,candidate_overwrite_count:0,rc8_candidate_accepted:false,target_pc_pass_claimed:false,production:false,ready:false,merge:false},out=JSON.stringify(receipt,null,2)+'\n';if(o.receipt){fs.mkdirSync(path.dirname(path.resolve(o.receipt)),{recursive:true});fs.writeFileSync(path.resolve(o.receipt),out)}process.stdout.write(out);if(!pass)process.exitCode=1}
if(require.main===module)main();
