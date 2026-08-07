'use strict';

const C_MODE_STATES = Object.freeze({
  IDLE: 'IDLE',
  RUNNING: 'RUNNING',
  ERROR: 'ERROR',
});

const STATE_VIEW = Object.freeze({
  IDLE: Object.freeze({ buttonColor: 'GRAY', stateLabel: '대기' }),
  RUNNING: Object.freeze({ buttonColor: 'BLUE', stateLabel: '실행중' }),
  ERROR: Object.freeze({ buttonColor: 'RED', stateLabel: '오류' }),
});

const DEFAULT_COMMAND_MESSAGE = '모든 워커에게 지시할 작업을 게시하라';
const BUTTON_LABEL = 'C 모드 실행';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertFunction(value, name) {
  if (typeof value !== 'function') throw new Error(`${name}_REQUIRED`);
}

function normalizeError(error) {
  if (!error) return 'UNKNOWN_ERROR';
  return String(error.code || error.message || error).trim() || 'UNKNOWN_ERROR';
}

function normalizeGroup(raw = {}) {
  const cMode = raw.cMode || {};
  const state = Object.values(C_MODE_STATES).includes(cMode.state)
    ? cMode.state
    : C_MODE_STATES.IDLE;
  const wave = Number.isInteger(cMode.wave) && cMode.wave >= 0 ? cMode.wave : 0;
  const executedCount = Number.isInteger(cMode.executedCount) && cMode.executedCount >= 0
    ? cMode.executedCount
    : 0;
  return {
    ...clone(raw),
    cMode: {
      state,
      wave,
      executedCount,
      lastError: cMode.lastError == null ? null : String(cMode.lastError),
      commandMessage: String(cMode.commandMessage || DEFAULT_COMMAND_MESSAGE),
      completedDistributionIds: Array.isArray(cMode.completedDistributionIds)
        ? [...new Set(cMode.completedDistributionIds.map(String))]
        : [],
      workerDispatchReceipts: Array.isArray(cMode.workerDispatchReceipts)
        ? clone(cMode.workerDispatchReceipts)
        : [],
    },
  };
}

function buildGroupCModeViewModel(group) {
  const normalized = normalizeGroup(group);
  const { state, wave, executedCount, lastError } = normalized.cMode;
  const view = STATE_VIEW[state];
  return {
    schemaVersion: 'C_MODE_GROUP_BUTTON_VIEW_MODEL_V1',
    state,
    buttonColor: view.buttonColor,
    buttonLabel: BUTTON_LABEL,
    stateLabel: view.stateLabel,
    wave,
    executedCount,
    lastError,
    summary: `Wave ${wave} · 수행된 작업 ${executedCount}회 · 상태: ${view.stateLabel}`,
  };
}

function validateWorkerPostSet(workerPosts, expectedWorkerIds = null) {
  if (!Array.isArray(workerPosts) || workerPosts.length === 0) {
    throw new Error('WORKER_POST_SET_REQUIRED');
  }
  const workers = new Set();
  const posts = new Set();
  const normalized = workerPosts.map((item) => {
    const workerId = String(item?.workerId || '').trim();
    const postNumber = Number(item?.postNumber);
    if (!workerId) throw new Error('WORKER_ID_REQUIRED');
    if (!Number.isInteger(postNumber) || postNumber <= 0) throw new Error('POST_NUMBER_INVALID');
    if (workers.has(workerId)) throw new Error('DUPLICATE_WORKER');
    if (posts.has(postNumber)) throw new Error('DUPLICATE_POST_NUMBER');
    workers.add(workerId);
    posts.add(postNumber);
    return { workerId, postNumber };
  });
  if (Array.isArray(expectedWorkerIds) && expectedWorkerIds.length > 0) {
    const expected = [...new Set(expectedWorkerIds.map((value) => String(value).trim()).filter(Boolean))];
    if (expected.length !== normalized.length || expected.some((workerId) => !workers.has(workerId))) {
      throw new Error('INCOMPLETE_WORKER_POST_SET');
    }
  }
  return normalized;
}

function renderGroupCModeDom({ headerElement, statusElement, viewModel, onClick }) {
  if (!headerElement || typeof headerElement.appendChild !== 'function') {
    throw new Error('GROUP_HEADER_ELEMENT_REQUIRED');
  }
  if (!statusElement || !('textContent' in statusElement)) {
    throw new Error('GROUP_STATUS_ELEMENT_REQUIRED');
  }
  const documentRef = headerElement.ownerDocument || globalThis.document;
  if (!documentRef || typeof documentRef.createElement !== 'function') {
    throw new Error('DOCUMENT_REQUIRED');
  }
  let button = headerElement.querySelector?.('[data-c-mode-execution-button="true"]') || null;
  if (!button) {
    button = documentRef.createElement('button');
    button.type = 'button';
    button.dataset.cModeExecutionButton = 'true';
    button.className = 'c-mode-execution-button';
    headerElement.appendChild(button);
  }
  button.textContent = viewModel.buttonLabel;
  button.dataset.cModeState = viewModel.state;
  button.dataset.cModeColor = viewModel.buttonColor;
  button.setAttribute('aria-label', `${viewModel.buttonLabel}: ${viewModel.stateLabel}`);
  button.onclick = onClick;
  statusElement.textContent = viewModel.summary;
  statusElement.dataset.cModeState = viewModel.state;
  if (viewModel.lastError) statusElement.dataset.cModeLastError = viewModel.lastError;
  else delete statusElement.dataset.cModeLastError;
  return button;
}

class CModeGroupButtonController {
  constructor({ readGroup, writeGroup, renderGroup, sendToCommander, sendToWorker, now = () => new Date().toISOString() } = {}) {
    assertFunction(readGroup, 'READ_GROUP');
    assertFunction(writeGroup, 'WRITE_GROUP');
    assertFunction(renderGroup, 'RENDER_GROUP');
    assertFunction(sendToCommander, 'SEND_TO_COMMANDER');
    assertFunction(sendToWorker, 'SEND_TO_WORKER');
    assertFunction(now, 'NOW');
    this.readGroup = readGroup;
    this.writeGroup = writeGroup;
    this.renderGroup = renderGroup;
    this.sendToCommander = sendToCommander;
    this.sendToWorker = sendToWorker;
    this.now = now;
  }

  async _load(groupId) {
    const group = normalizeGroup(await this.readGroup(groupId));
    if (!group.id) group.id = groupId;
    return group;
  }

  async _persist(group) {
    await this.writeGroup(group.id, clone(group));
    const viewModel = buildGroupCModeViewModel(group);
    await this.renderGroup(group.id, viewModel);
    return viewModel;
  }

  async start(groupId) {
    const group = await this._load(groupId);
    if (![C_MODE_STATES.IDLE, C_MODE_STATES.ERROR].includes(group.cMode.state)) {
      return { status: 'ALREADY_RUNNING', viewModel: buildGroupCModeViewModel(group) };
    }

    group.cMode.state = C_MODE_STATES.RUNNING;
    group.cMode.lastError = null;
    const runningView = await this._persist(group);

    try {
      const commanderReceipt = await this.sendToCommander(group.id, group.cMode.commandMessage, {
        mode: 'C_MODE',
        action: 'START',
        sentAt: this.now(),
      });
      return {
        status: 'RUNNING',
        commanderReceipt: clone(commanderReceipt),
        viewModel: runningView,
      };
    } catch (error) {
      group.cMode.state = C_MODE_STATES.ERROR;
      group.cMode.lastError = normalizeError(error);
      const errorView = await this._persist(group);
      return {
        status: 'ERROR',
        error: group.cMode.lastError,
        viewModel: errorView,
      };
    }
  }

  async stop(groupId) {
    const group = await this._load(groupId);
    group.cMode.state = C_MODE_STATES.IDLE;
    group.cMode.lastError = null;
    const viewModel = await this._persist(group);
    return { status: 'IDLE', viewModel };
  }

  async fail(groupId, error) {
    const group = await this._load(groupId);
    group.cMode.state = C_MODE_STATES.ERROR;
    group.cMode.lastError = normalizeError(error);
    const viewModel = await this._persist(group);
    return { status: 'ERROR', error: group.cMode.lastError, viewModel };
  }

  async acceptCommanderDistribution(groupId, publication) {
    const group = await this._load(groupId);
    if (group.cMode.state !== C_MODE_STATES.RUNNING) throw new Error('C_MODE_NOT_RUNNING');
    const distributionId = String(publication?.distributionId || '').trim();
    if (!distributionId) throw new Error('DISTRIBUTION_ID_REQUIRED');
    if (group.cMode.completedDistributionIds.includes(distributionId)) {
      return { status: 'DUPLICATE_SUPPRESSED', viewModel: buildGroupCModeViewModel(group) };
    }

    const workerPosts = validateWorkerPostSet(publication.workerPosts, publication.expectedWorkerIds);
    group.cMode.wave += 1;
    group.cMode.executedCount += 1;
    group.cMode.completedDistributionIds.push(distributionId);
    await this._persist(group);

    const receipts = [];
    for (const item of workerPosts) {
      const message = `게시물 #${item.postNumber}를 읽고 작업을 수행하라`;
      try {
        const receipt = await this.sendToWorker(group.id, item.workerId, message, {
          mode: 'C_MODE',
          wave: group.cMode.wave,
          distributionId,
          postNumber: item.postNumber,
          sentAt: this.now(),
        });
        receipts.push({
          workerId: item.workerId,
          postNumber: item.postNumber,
          status: 'PASS',
          receipt: clone(receipt),
        });
      } catch (error) {
        receipts.push({
          workerId: item.workerId,
          postNumber: item.postNumber,
          status: 'ERROR',
          error: normalizeError(error),
        });
        group.cMode.workerDispatchReceipts.push(...receipts);
        group.cMode.state = C_MODE_STATES.ERROR;
        group.cMode.lastError = `WORKER_DISPATCH_FAILED:${item.workerId}:${normalizeError(error)}`;
        const viewModel = await this._persist(group);
        return { status: 'ERROR', receipts, viewModel };
      }
    }

    group.cMode.workerDispatchReceipts.push(...receipts);
    const viewModel = await this._persist(group);
    return { status: 'DISTRIBUTED', receipts, viewModel };
  }
}

module.exports = {
  C_MODE_STATES,
  STATE_VIEW,
  DEFAULT_COMMAND_MESSAGE,
  BUTTON_LABEL,
  normalizeGroup,
  buildGroupCModeViewModel,
  validateWorkerPostSet,
  renderGroupCModeDom,
  CModeGroupButtonController,
};
