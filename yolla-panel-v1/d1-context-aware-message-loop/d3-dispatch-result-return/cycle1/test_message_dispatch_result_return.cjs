'use strict';

const assert = require('node:assert/strict');
const { ContextMessageDispatchResultReturn, sha256 } = require('./message_dispatch_result_return.cjs');

const command = {
  cycle_id: 'D1-CONTEXT-AWARE-MESSAGE-LOOP-CYCLE1-20260807-001',
  command_id: 'D3-C1-TEST-001',
  context_id: 'ctx-001',
  context_name: 'D-2 context',
  page_id: 'page-001',
  group_id: 'D_GROUP',
  worker_id: 'D-2',
  message: 'D3_VISIBLE_MESSAGE_001',
  expected_reply_contains: 'D3_ACK_001',
};

function snapshot(overrides = {}) {
  return {
    context_id: 'ctx-001',
    page_id: 'page-001',
    revision: 'rev-1',
    composer_contains_message: false,
    user_messages: [],
    assistant_messages: [{ message_id: 'old-a1', raw_text: 'old reply', completed: true }],
    ...overrides,
  };
}

function harness(sequence, overrides = {}) {
  const events = [];
  const calls = { dispatch: 0, send: 0, run: 0, storage: 0, returned: 0, observe: 0 };
  let index = 0;
  const adapters = {
    stage4Dispatch: async () => { calls.dispatch += 1; return { ok: true, station: 'STATION_06_SENDER' }; },
    sendToWorker: async () => { calls.send += 1; return { accepted: true, dispatch_id: 'dispatch-1' }; },
    observeConversation: async () => {
      calls.observe += 1;
      const item = sequence[Math.min(index, sequence.length - 1)];
      index += 1;
      return JSON.parse(JSON.stringify(item));
    },
    stage4RunCheck: async () => { calls.run += 1; return { ok: true, station: 'STATION_07_EXECUTION' }; },
    stage4AppendStationRecords: async () => { calls.storage += 1; return { ok: true, appended: true }; },
    returnResult: async (target) => { calls.returned += 1; return { accepted: true, target }; },
    appendEvent: async (event) => events.push(event),
    sleep: async () => {},
    ...overrides,
  };
  return {
    loop: new ContextMessageDispatchResultReturn(adapters, { visibilityPolls: 2, replyPolls: 3, pollDelayMs: 0, now: () => '2026-08-08T00:00:00.000Z' }),
    events,
    calls,
  };
}

async function run() {
  let assertions = 0;
  const equal = (a, b, message) => { assert.equal(a, b, message); assertions += 1; };
  const ok = (value, message) => { assert.ok(value, message); assertions += 1; };

  const visible = snapshot({
    revision: 'rev-2',
    user_messages: [{ message_id: 'u-1', raw_text: command.message, visible: true }],
  });
  const working = snapshot({
    revision: 'rev-3',
    user_messages: visible.user_messages,
    assistant_messages: [...visible.assistant_messages, { message_id: 'a-2', raw_text: 'D3_ACK_001', completed: false, created_after_dispatch: true }],
  });
  const completed = snapshot({
    revision: 'rev-4',
    user_messages: visible.user_messages,
    assistant_messages: [...visible.assistant_messages, { message_id: 'a-2', raw_text: 'D3_ACK_001', completed: true, created_after_dispatch: true }],
  });
  const happy = harness([snapshot(), visible, working, completed]);
  const result = await happy.loop.run(command);
  equal(result.terminal, 'MESSAGE_DISPATCH_AND_RESULT_RETURN_LIVE_PASS');
  equal(result.command_id, command.command_id);
  equal(result.context_id, command.context_id);
  equal(result.page_id, command.page_id);
  equal(result.user_message_id, 'u-1');
  equal(result.assistant_message_id, 'a-2');
  equal(result.assistant_reply_raw, 'D3_ACK_001');
  equal(result.assistant_reply_sha256, sha256('D3_ACK_001'));
  equal(result.return_target, 'D-1_OR_SUCCESSOR');
  equal(result.return_receipt.accepted, true);
  equal(happy.calls.dispatch, 1);
  equal(happy.calls.send, 1);
  equal(happy.calls.run, 1);
  equal(happy.calls.storage, 1);
  equal(happy.calls.returned, 1);
  ok(happy.events.some((event) => event.event_type === 'MESSAGE_SENT'));
  equal(happy.events.find((event) => event.event_type === 'MESSAGE_SENT').visible_in_conversation, true);
  equal(happy.events[happy.events.length - 1].event_type, 'RESULT_RETURNED');

  const duplicate = await happy.loop.run(command);
  equal(duplicate.duplicate_suppressed, true);
  equal(happy.calls.send, 1);

  const notVisible = harness([snapshot(), snapshot(), snapshot()]);
  await assert.rejects(() => notVisible.loop.run({ ...command, command_id: 'D3-C1-TEST-NOT-VISIBLE' }), /USER_MESSAGE_NOT_VISIBLE/);
  assertions += 1;
  equal(notVisible.events.some((event) => event.event_type === 'MESSAGE_SENT'), false);
  equal(notVisible.events.some((event) => event.event_type === 'MESSAGE_VISIBILITY_FAILED'), true);

  const wrongContext = harness([snapshot({ context_id: 'wrong' })]);
  await assert.rejects(() => wrongContext.loop.run({ ...command, command_id: 'D3-C1-TEST-WRONG-CONTEXT' }), /CONTEXT_BINDING_MISMATCH/);
  assertions += 1;
  equal(wrongContext.calls.send, 0);

  const wrongPage = harness([snapshot({ page_id: 'wrong' })]);
  await assert.rejects(() => wrongPage.loop.run({ ...command, command_id: 'D3-C1-TEST-WRONG-PAGE' }), /PAGE_BINDING_MISMATCH/);
  assertions += 1;
  equal(wrongPage.calls.send, 0);

  const composerOnly = harness([
    snapshot(),
    snapshot({ composer_contains_message: true, user_messages: [{ message_id: 'composer', raw_text: command.message, visible: true }] }),
  ]);
  await assert.rejects(() => composerOnly.loop.run({ ...command, command_id: 'D3-C1-TEST-COMPOSER' }), /MESSAGE_VISIBLE_ONLY_IN_COMPOSER/);
  assertions += 1;

  const staleReply = harness([
    snapshot(),
    visible,
    snapshot({ user_messages: visible.user_messages }),
    snapshot({ user_messages: visible.user_messages }),
    snapshot({ user_messages: visible.user_messages }),
  ]);
  await assert.rejects(() => staleReply.loop.run({ ...command, command_id: 'D3-C1-TEST-STALE' }), /NEW_COMPLETED_ASSISTANT_REPLY_NOT_FOUND/);
  assertions += 1;
  equal(staleReply.calls.returned, 0);

  const oldMarker = harness([snapshot({ assistant_messages: [{ message_id: 'old-marker', raw_text: 'D3_ACK_001', completed: true }] })]);
  await assert.rejects(() => oldMarker.loop.run({ ...command, command_id: 'D3-C1-TEST-OLD-MARKER' }), /EXPECTED_REPLY_MARKER_PRESENT_BEFORE_DISPATCH/);
  assertions += 1;
  equal(oldMarker.calls.send, 0);

  const noExpectedMarker = harness([
    snapshot(),
    visible,
    snapshot({ user_messages: visible.user_messages, assistant_messages: [...visible.assistant_messages, { message_id: 'new-no-marker', raw_text: 'other', completed: true, created_after_dispatch: true }] }),
    snapshot({ user_messages: visible.user_messages, assistant_messages: [...visible.assistant_messages, { message_id: 'new-no-marker', raw_text: 'other', completed: true, created_after_dispatch: true }] }),
    snapshot({ user_messages: visible.user_messages, assistant_messages: [...visible.assistant_messages, { message_id: 'new-no-marker', raw_text: 'other', completed: true, created_after_dispatch: true }] }),
  ]);
  await assert.rejects(() => noExpectedMarker.loop.run({ ...command, command_id: 'D3-C1-TEST-MARKER-MISMATCH' }), /NEW_COMPLETED_ASSISTANT_REPLY_NOT_FOUND/);
  assertions += 1;
  equal(noExpectedMarker.events.some((event) => event.event_type === 'MESSAGE_SENT'), true);
  equal(noExpectedMarker.events.some((event) => event.event_type === 'RESULT_RETURNED'), false);

  console.log(`PASS_${assertions}_ASSERTIONS`);
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
