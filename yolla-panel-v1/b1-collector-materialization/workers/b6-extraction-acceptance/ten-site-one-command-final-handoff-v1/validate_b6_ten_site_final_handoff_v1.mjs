import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const read = (name) => JSON.parse(fs.readFileSync(path.join(here, name), 'utf8'));
const handoff = read('B6_TEN_SITE_BATCH_HANDOFF_V1.json');
const scheduler = read('B6_TWO_BROWSER_FIVE_BATCH_SCHEDULER_V1.json');
const activation = read('B6_SITE_ACTIVATION_AND_RESUME_CONTRACT_V1.json');
const fixture = read('fixtures/B6_TEN_SITE_FINAL_HANDOFF_FIXTURE_V1.json');
const checks = [];
const check = (name, condition) => {
  checks.push({name, pass: Boolean(condition)});
  if (!condition) throw new Error(`VALIDATION_FAILED:${name}`);
};

check('parent_pointer_exact', handoff.parent_handoff.pointer_blob === '8e523ca375cc726e7d6f27e35f30553ab87df555');
check('parent_completed_handoff_not_reexecuted', handoff.parent_handoff.completed_handoff_materialization_steps_reexecuted === false);
check('ab_latest_pointer_count_11', Object.keys(handoff.latest_ab_authority).length === 11);
check('site_count_10', handoff.site_registry.length === 10);
check('unique_site_slots_10', new Set(handoff.site_registry.map(x => x.slot)).size === 10);
check('all_live_slots_waiting', handoff.site_registry.every(x => x.state === 'WAITING_INPUT'));
check('lane_count_5', handoff.lanes.length === 5);
check('lane_names_exact', ['DATA','PRODUCT','WRITE','MY_LISTING','EDIT'].every(x => handoff.lanes.includes(x)));
check('browser_concurrency_2', scheduler.browser_concurrency === 2);
check('batch_count_5', scheduler.batches.length === 5);
check('two_slots_per_batch', scheduler.batches.every(x => x.slots.length === 2));
const scheduledSlots = scheduler.batches.flatMap(x => x.slots);
check('scheduler_slot_coverage_10', scheduledSlots.length === 10 && new Set(scheduledSlots).size === 10);
check('scheduler_matches_registry', scheduledSlots.every(x => handoff.site_registry.some(y => y.slot === x)));
check('waiting_peer_nonblocking', scheduler.eligibility.waiting_site_blocks_peer === false);
check('max_active_site_locks_2', scheduler.locking.max_active_site_locks === 2);
check('completed_site_not_reexecuted', scheduler.resume.successful_site_reexecution === false);
check('completed_lane_not_reexecuted', scheduler.resume.successful_lane_reexecution === false);
check('target_pc_root_bound', handoff.runtime_authority.target_pc_working_root.value === 'E:\\YOLLA');
check('physical_hostname_bound', handoff.runtime_authority.physical_hostname.value === 'NOTEX');
check('logical_pc_id_bound', handoff.runtime_authority.logical_pc_id.value === 'YOLLA-USER-PC01');
check('browser_agent_bound', handoff.runtime_authority.existing_browser_agent_exact_binding.value === 'http://127.0.0.1:32100');
check('target_site_not_guessed', handoff.runtime_authority.target_url.value === null && handoff.runtime_authority.site_id.value === null);
check('session_not_guessed', handoff.runtime_authority.authorized_user_session_reference.value === null);
check('page_binding_not_guessed', handoff.runtime_authority.target_page_binding.value === null);
check('public_slice_exact', activation.first_vertical_slice.sequence.join('>') === 'SEARCH>LIST>DETAIL');
check('public_slice_data_product_only', activation.first_vertical_slice.lanes.join(',') === 'DATA,PRODUCT');
check('write_confirm_guard', activation.lane_activation.WRITE.final_submit === 'USER_CONFIRM_REQUIRED');
check('edit_confirm_guard', activation.lane_activation.EDIT.final_submit === 'USER_CONFIRM_REQUIRED');
check('pass_without_receipt_rejected', activation.result_return.pass_without_actual_receipt === 'REJECTED');
check('fixture_classification', fixture.classification === 'FIXTURE_ONLY_NOT_LIVE_AUTHORITY');

const materialized = handoff.site_registry.map(x => ({...x, ...(fixture.site_overrides[x.slot] || {})}));
const ready = materialized.filter(x => x.state === 'READY');
const waiting = materialized.filter(x => x.state === 'WAITING_INPUT');
const firstBatch = scheduler.batches.find(x => x.slots.some(s => ready.some(r => r.slot === s)));
check('fixture_ready_site_count_1', ready.length === 1);
check('fixture_waiting_site_count_9', waiting.length === 9);
check('fixture_expected_batch_02', firstBatch?.batch_id === 'BATCH_02');
check('fixture_waiting_peer_does_not_block', firstBatch.slots.filter(s => ready.some(r => r.slot === s)).length === 1);
check('fixture_never_live', fixture.expected.live_execution === false && fixture.expected.actual_receipt_count === 0);
check('no_target_guessing', handoff.execution_policy.target_value_guessing === false);
check('no_raw_secret_or_pii', handoff.execution_policy.raw_secret_or_pii === false);
check('no_production_ready_merge', !handoff.execution_policy.production && !handoff.execution_policy.ready && !handoff.execution_policy.merge);

const result = {
  schema_version: 'B6_FINAL_HANDOFF_LOCAL_VALIDATION_RESULT_V1',
  result: 'PASS',
  assertion_count: checks.length,
  passed: checks.filter(x => x.pass).length,
  failed: checks.filter(x => !x.pass).length,
  fixture_ready_sites: ready.map(x => x.slot),
  fixture_waiting_site_count: waiting.length,
  fixture_first_dispatch_batch: firstBatch.batch_id,
  actual_live_site_count: 0,
  actual_receipt_count: 0,
  checks
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
