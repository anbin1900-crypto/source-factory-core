"use strict";
const fs=require("node:fs");
const path=require("node:path");
const p=path.join(__dirname,"WAVE4_REPORT_TRUTH_FIXTURES.json");
const f=JSON.parse(fs.readFileSync(p,"utf8"));
const by=Object.fromEntries(f.fixtures.map(x=>[x.state,x]));
const checks=[
 ["reported pass",by.REPORTED_PASS?.label==="완료"],
 ["reported blocked",by.REPORTED_BLOCKED?.label==="차단"],
 ["report missing label",by.REPORT_MISSING?.label==="보고 누락"],
 ["report missing not complete",by.REPORT_MISSING?.label!=="완료"],
 ["report missing not working",!['C 실행','명령 실행','완료대기'].includes(by.REPORT_MISSING?.label)],
 ["report missing not error",by.REPORT_MISSING?.label!=="오류"],
 ["missing has commit",/^[0-9a-f]{40}$/.test(by.REPORT_MISSING?.commit_id||"")],
 ["missing no terminal post",by.REPORT_MISSING?.post_id===null],
 ["directive pending",by.DIRECTIVE_PENDING?.label==="지시 대기"],
 ["c active",by.C_ACTIVE?.label==="C 실행"],
 ["repeat active",by.REPEAT_ACTIVE?.label==="명령 실행"],
 ["awaiting",by.AWAITING?.label==="완료대기"],
 ["end",by.END?.label==="END"],
 ["idle",by.IDLE?.label==="쉬는 중"],
 ["working excludes report states",f.expected_counters.working===3],
 ["report missing counter",f.expected_counters.report_missing===1],
 ["legacy excluded",f.legacy_profile_status_excluded.length===3]
];
const failed=checks.filter(([,ok])=>!ok);
if(failed.length) throw new Error('W3_WAVE4_FAILED:'+failed.map(x=>x[0]).join(','));
console.log(JSON.stringify({schema_version:'W3_WAVE4_REPORT_TRUTH_TEST_V1',status:'PASS',assertions:checks.length,failed:0},null,2));
