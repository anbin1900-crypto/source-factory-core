'use strict';

const assert = require('node:assert/strict');
const {
  C_MODE_STATES,
  buildGroupCModeViewModel,
  validateWorkerPostSet,
  CModeGroupButtonController,
} = require('./c_mode_group_button_patch.cjs');

function store(initial) {
  const groups = new Map(Object.entries(initial));
  const renders = [];
  return {
    groups,
    renders,
    readGroup: async (id) => groups.get(id),
    writeGroup: async (id, value) => groups.set(id, value),
    renderGroup: async (id, vm) => renders.push({ id, vm }),
  };
}

async function run() {
  let assertions = 0;
  const check = (condition, message) => { assert.ok(condition, message); assertions += 1; };
  const equal = (actual, expected, message) => { assert.equal(actual, expected, message); assertions += 1; };

  const idle = buildGroupCModeViewModel({ id: 'g1' });
  equal(idle.state, C_MODE_STATES.IDLE);
  equal(idle.buttonColor, 'GRAY');
  equal(idle.buttonLabel, 'C 모드 실행');
  equal(idle.summary, 'Wave 0 · 수행된 작업 0회 · 상태: 대기');

  const valid = validateWorkerPostSet([
    { workerId: 'W01', postNumber: 123 },
    { workerId: 'W02', postNumber: 124 },
  ], ['W01', 'W02']);
  equal(valid.length, 2);
  assert.throws(() => validateWorkerPostSet([{ workerId: 'W01', postNumber: 1 }, { workerId: 'W01', postNumber: 2 }])); assertions += 1;
  assert.throws(() => validateWorkerPostSet([{ workerId: 'W01', postNumber: 1 }], ['W01', 'W02'])); assertions += 1;

  const s1 = store({ g1: { id: 'g1', cMode: { state: 'IDLE', wave: 0, executedCount: 0 } } });
  const commanderMessages = [];
  const workerMessages = [];
  const controller = new CModeGroupButtonController({
    ...s1,
    sendToCommander: async (groupId, message) => {
      commanderMessages.push({ groupId, message });
      return { id: 'commander-1' };
    },
    sendToWorker: async (groupId, workerId, message) => {
      workerMessages.push({ groupId, workerId, message });
      return { id: `${workerId}-receipt` };
    },
    now: () => '2026-08-06T20:50:00+09:00',
  });

  const started = await controller.start('g1');
  equal(started.status, 'RUNNING');
  equal(s1.groups.get('g1').cMode.state, 'RUNNING');
  equal(s1.renders[0].vm.buttonColor, 'BLUE');
  equal(commanderMessages[0].message, '모든 워커에게 지시할 작업을 게시하라');

  const distribution = await controller.acceptCommanderDistribution('g1', {
    distributionId: 'wave-set-001',
    expectedWorkerIds: ['W01', 'W02'],
    workerPosts: [
      { workerId: 'W01', postNumber: 123 },
      { workerId: 'W02', postNumber: 124 },
    ],
  });
  equal(distribution.status, 'DISTRIBUTED');
  equal(s1.groups.get('g1').cMode.wave, 1);
  equal(s1.groups.get('g1').cMode.executedCount, 1);
  equal(workerMessages[0].message, '게시물 #123를 읽고 작업을 수행하라');
  equal(workerMessages[1].message, '게시물 #124를 읽고 작업을 수행하라');
  equal(distribution.viewModel.summary, 'Wave 1 · 수행된 작업 1회 · 상태: 실행중');

  const duplicate = await controller.acceptCommanderDistribution('g1', {
    distributionId: 'wave-set-001',
    workerPosts: [{ workerId: 'W01', postNumber: 123 }],
  });
  equal(duplicate.status, 'DUPLICATE_SUPPRESSED');
  equal(s1.groups.get('g1').cMode.executedCount, 1);

  const stopped = await controller.stop('g1');
  equal(stopped.status, 'IDLE');
  equal(stopped.viewModel.buttonColor, 'GRAY');

  const s2 = store({ g2: { id: 'g2', cMode: { state: 'ERROR', wave: 2, executedCount: 4, lastError: 'OLD' } } });
  const retryController = new CModeGroupButtonController({
    ...s2,
    sendToCommander: async () => ({ id: 'retry' }),
    sendToWorker: async () => ({ id: 'unused' }),
  });
  const retry = await retryController.start('g2');
  equal(retry.status, 'RUNNING');
  equal(retry.viewModel.buttonColor, 'BLUE');
  equal(s2.groups.get('g2').cMode.lastError, null);

  const s3 = store({ g3: { id: 'g3', cMode: { state: 'IDLE', wave: 0, executedCount: 0 } } });
  const commanderFailureController = new CModeGroupButtonController({
    ...s3,
    sendToCommander: async () => { throw new Error('COMMANDER_SEND_FAILED'); },
    sendToWorker: async () => ({ id: 'unused' }),
  });
  const commanderFailure = await commanderFailureController.start('g3');
  equal(commanderFailure.status, 'ERROR');
  equal(commanderFailure.viewModel.buttonColor, 'RED');
  equal(s3.groups.get('g3').cMode.state, 'ERROR');
  equal(s3.groups.get('g3').cMode.lastError, 'COMMANDER_SEND_FAILED');

  const s4 = store({ g4: { id: 'g4', cMode: { state: 'RUNNING', wave: 0, executedCount: 0 } } });
  const workerFailureController = new CModeGroupButtonController({
    ...s4,
    sendToCommander: async () => ({ id: 'unused' }),
    sendToWorker: async (_groupId, workerId) => {
      if (workerId === 'W02') throw new Error('WORKER_WINDOW_UNAVAILABLE');
      return { id: 'W01-ok' };
    },
  });
  const workerFailure = await workerFailureController.acceptCommanderDistribution('g4', {
    distributionId: 'wave-set-fail',
    expectedWorkerIds: ['W01', 'W02'],
    workerPosts: [
      { workerId: 'W01', postNumber: 201 },
      { workerId: 'W02', postNumber: 202 },
    ],
  });
  equal(workerFailure.status, 'ERROR');
  equal(workerFailure.viewModel.buttonColor, 'RED');
  equal(s4.groups.get('g4').cMode.wave, 1);
  equal(s4.groups.get('g4').cMode.executedCount, 1);
  check(s4.groups.get('g4').cMode.lastError.includes('W02'));

  console.log(`PASS_${assertions}_ASSERTIONS`);
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
