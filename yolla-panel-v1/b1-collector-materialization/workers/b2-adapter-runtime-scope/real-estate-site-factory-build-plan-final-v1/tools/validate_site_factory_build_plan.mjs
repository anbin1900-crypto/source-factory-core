import fs from 'node:fs';import assert from 'node:assert/strict';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {SCREEN_IDS,summarizeSiteMatrix,validateDependencyDAG} from './site_factory_build_plan_model.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=n=>JSON.parse(fs.readFileSync(path.join(ROOT,n),'utf8'));
const plan=read('B2_AI_SITE_FACTORY_BUILD_PLAN_V1.json');
const backlog=read('B2_EVIDENCE_BACKED_IMPLEMENTATION_BACKLOG_V1.json');
const coverage=read('B2_IMPLEMENTATION_DECISION_COVERAGE_V1.json');
const slice=read('B2_V2_MINIMUM_VERTICAL_SLICE_PLAN_V1.json');
let a=0;const eq=(x,y)=>{assert.deepEqual(x,y);a++;};const ok=x=>{assert.ok(x);a++;};
eq(plan.schema_version,'B2_AI_SITE_FACTORY_BUILD_PLAN_V1');
eq(plan.product_screens.map(x=>x.screen_id),SCREEN_IDS);eq(plan.product_screens.length,8);
eq(plan.ten_site_model.target_site_count,10);eq(plan.ten_site_model.site_slot_ids.length,10);eq(plan.ten_site_model.site_specific_ready_count,0);eq(plan.ten_site_model.actual_live_confirmed_site_count,0);eq(plan.ten_site_model.site_name_guessing,false);
eq(backlog.items.length,16);eq(backlog.summary.direct_new_build_without_evidence,0);validateDependencyDAG(backlog.items);a++;
for(const i of backlog.items){ok(Array.isArray(i.dependency));ok(i.priority);ok(i.evidence_pointer);ok(Number.isFinite(i.confidence));ok(['OBSERVED','INFERRED','UNKNOWN','WAITING_INPUT'].includes(i.evidence_state));ok(Array.isArray(i.required_api)&&Array.isArray(i.required_entity)&&Array.isArray(i.required_component)&&Array.isArray(i.required_state));}
const s=summarizeSiteMatrix(coverage.site_matrix);eq(s.total,80);eq(s.confirmed,0);eq(s.candidate,0);eq(s.unknown_or_waiting,80);eq(coverage.summary.generic_screen_requirement_defined_count,8);eq(coverage.backlog_planning_coverage.priority_bound_percent,100);eq(coverage.backlog_planning_coverage.dependency_declared_percent,100);eq(coverage.backlog_planning_coverage.plannable_percent,68.75);
eq(coverage.last_final_batch_inputs.A4,'AVAILABLE_FINAL_SOURCE');eq(coverage.last_final_batch_inputs.A5,'AVAILABLE_FINAL_SOURCE');eq(coverage.last_final_batch_inputs.B5,'AVAILABLE_FINAL_SOURCE_TEMPLATE_LIVE_VALUES_WAITING');
eq(slice.slice_id,'V2-MVS-PUBLIC-READ-SEARCH-LIST-DETAIL-001');eq(slice.target_site_selection.current_target,'WAITING_INPUT');eq(slice.target_site_selection.historical_candidates_are_execution_authority,false);eq(slice.target_site_selection.site_slots.length,10);eq(slice.final_write_or_edit_submit,false);eq(slice.execution_order.map(x=>x.backlog_id),['BL-001','BL-002','BL-003','BL-004','BL-005','BL-006','BL-007','BL-008','BL-014']);
ok(plan.acceptance_contract.includes('UNKNOWN_NOT_PROMOTED'));ok(plan.acceptance_contract.includes('VERTICAL_SLICE_PUBLIC_READ_BEFORE_WRITE'));
console.log(JSON.stringify({status:'PASS',assertions:a,backlog:backlog.items.length,site_screen_cells:s.total,candidate_cells:s.candidate,unknown_or_waiting:s.unknown_or_waiting,plannable_percent:coverage.backlog_planning_coverage.plannable_percent}));
