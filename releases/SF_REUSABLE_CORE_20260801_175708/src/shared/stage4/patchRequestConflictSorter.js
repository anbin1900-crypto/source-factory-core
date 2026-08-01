'use strict';

const PATCH_REQUEST_OPERATION = 'patch_request';
const REPORT_ONLY_OPERATION = 'report_only';
const MISSING_TARGET_KEY = '__MISSING_TARGET_FILE__';

const STATUS_GREEN = 'GREEN_PATCH_ORDER_READY';
const STATUS_YELLOW = 'YELLOW_PATCH_ORDER_REQUIRED';
const STATUS_RED = 'RED_PATCH_TARGET_FILE_MISSING';

const LABEL_ALIASES = Object.freeze({
  targetFile: [
    'target file',
    'target_file',
    'target-file',
    'target path',
    'target_path',
    'target-path',
    'file target',
    'patch target',
    'patch_target',
  ],
  purpose: ['purpose', 'goal', 'patch purpose'],
  anchor: ['anchor', 'anchor text', 'anchor_text', 'insert anchor', 'patch anchor'],
  add: ['add', 'insert', 'append', 'content to add', 'patch add'],
  doNotRemove: ['do not remove', 'do_not_remove', 'do-not-remove', 'preserve', 'keep'],
  integrationNote: ['integration note', 'integration_note', 'integration-note', 'note', 'commander note'],
});

function sortPatchRequestConflicts(sourceUnits, options) {
  const opts = normalizeOptions(options);
  const units = Array.isArray(sourceUnits) ? sourceUnits : [];
  const patchRequests = [];

  for (let index = 0; index < units.length; index += 1) {
    const unit = normalizeSourceUnit(units[index], index, opts);

    if (!isPatchRequestCandidate(unit, opts)) {
      continue;
    }

    patchRequests.push(buildPatchRequestRecord(unit, opts));
  }

  const groupedByTargetFile = groupPatchRequestsByTargetFile(patchRequests);
  const conflicts = detectPatchOrderConflicts(groupedByTargetFile);
  const suggestedOrder = buildSuggestedOrder(groupedByTargetFile, opts);
  const recommendedStatus = getRecommendedStatus(conflicts);

  return {
    patchRequests,
    groupedByTargetFile,
    suggestedOrder,
    conflicts,
    recommendedStatus,
    commanderDecisionNeeded: recommendedStatus !== STATUS_GREEN,
    summary: {
      totalInputUnits: units.length,
      patchRequestCount: patchRequests.length,
      targetFileCount: Object.keys(groupedByTargetFile).filter(function filterMissing(key) {
        return key !== MISSING_TARGET_KEY;
      }).length,
      missingTargetFileCount: groupedByTargetFile[MISSING_TARGET_KEY] ? groupedByTargetFile[MISSING_TARGET_KEY].items.length : 0,
      conflictCount: conflicts.length,
    },
  };
}

function buildPatchRequestRecord(unit, options) {
  const labels = parsePatchRequestLabels(unit.content);
  const targetFile = firstNonBlank([
    labels.targetFile,
    readFirstStringField(unit.raw, ['target_file', 'targetFile', 'target_path', 'targetPath', 'patch_target_file', 'patchTargetFile']),
  ]);
  const normalizedTargetFile = normalizePath(targetFile, options);
  const anchor = firstNonBlank([
    labels.anchor,
    readFirstStringField(unit.raw, ['anchor', 'anchor_text', 'anchorText']),
  ]);
  const add = firstNonBlank([
    labels.add,
    readFirstStringField(unit.raw, ['add', 'insert', 'append', 'content_to_add', 'contentToAdd']),
  ]);
  const purpose = firstNonBlank([
    labels.purpose,
    readFirstStringField(unit.raw, ['purpose', 'goal']),
    unit.purpose,
  ]);
  const doNotRemove = firstNonBlank([
    labels.doNotRemove,
    readFirstStringField(unit.raw, ['do_not_remove', 'doNotRemove', 'preserve', 'keep']),
  ]);
  const integrationNote = firstNonBlank([
    labels.integrationNote,
    readFirstStringField(unit.raw, ['integration_note', 'integrationNote', 'note', 'commander_note', 'commanderNote']),
  ]);

  const record = {
    index: unit.index,
    sourcePath: unit.path,
    normalizedSourcePath: unit.normalizedPath,
    targetFile,
    normalizedTargetFile,
    targetFileKey: normalizedTargetFile || MISSING_TARGET_KEY,
    purpose,
    anchor,
    add,
    doNotRemove,
    integrationNote,
    operation: unit.operation,
    owner_worker: unit.owner_worker,
    target_stage: unit.target_stage,
    labelsFound: labels.labelsFound.slice(),
    missingLabels: [],
    sortHints: [],
    commanderDecisionNeeded: false,
  };

  if (!record.normalizedTargetFile) {
    record.missingLabels.push('Target file');
    record.commanderDecisionNeeded = true;
  }

  if (!record.anchor) {
    record.missingLabels.push('Anchor');
    record.commanderDecisionNeeded = true;
  }

  if (!record.add) {
    record.missingLabels.push('Add');
    record.commanderDecisionNeeded = true;
  }

  if (record.doNotRemove) {
    record.sortHints.push('preserve_constraints_first');
  }

  if (hasDependencyWording(record.integrationNote)) {
    record.sortHints.push('integration_dependency_note_present');
    record.commanderDecisionNeeded = true;
  }

  record.orderWeight = calculateOrderWeight(record);
  record.reason = buildPatchRequestReason(record);

  return record;
}

function groupPatchRequestsByTargetFile(patchRequests) {
  const grouped = Object.create(null);

  for (const record of patchRequests) {
    const key = record.targetFileKey || MISSING_TARGET_KEY;

    if (!grouped[key]) {
      grouped[key] = {
        targetFile: record.normalizedTargetFile || '',
        key,
        items: [],
        suggestedOrder: [],
        commanderDecisionNeeded: false,
      };
    }

    grouped[key].items.push(record);

    if (record.commanderDecisionNeeded) {
      grouped[key].commanderDecisionNeeded = true;
    }
  }

  for (const key of Object.keys(grouped)) {
    grouped[key].suggestedOrder = grouped[key].items.slice().sort(comparePatchRecords).map(toSuggestedOrderItem);

    if (grouped[key].items.length > 1) {
      grouped[key].commanderDecisionNeeded = true;
    }
  }

  return grouped;
}

function detectPatchOrderConflicts(groupedByTargetFile) {
  const conflicts = [];
  const keys = Object.keys(groupedByTargetFile).sort();

  for (const key of keys) {
    const group = groupedByTargetFile[key];

    if (key === MISSING_TARGET_KEY) {
      for (const item of group.items) {
        conflicts.push({
          status: STATUS_RED,
          code: 'PATCH_TARGET_FILE_MISSING',
          targetFile: '',
          itemIndexes: [item.index],
          ownerWorkers: unique([item.owner_worker]),
          reason: 'Patch request has no Target file label or target_file metadata.',
          recommendation: 'Commander must request a small hotfix that adds Target file before patch ordering.',
          commanderDecisionNeeded: true,
        });
      }

      continue;
    }

    if (group.items.length > 1) {
      conflicts.push({
        status: STATUS_YELLOW,
        code: 'MULTIPLE_PATCH_REQUESTS_FOR_TARGET_FILE',
        targetFile: group.targetFile,
        itemIndexes: group.items.map(function mapIndex(item) {
          return item.index;
        }),
        ownerWorkers: unique(group.items.map(function mapOwner(item) {
          return item.owner_worker;
        })),
        reason: 'Multiple patch_request units target the same file.',
        recommendation: 'Commander should review suggestedOrder before applying patches.',
        commanderDecisionNeeded: true,
      });
    }

    const byAnchor = groupItemsByAnchor(group.items);

    for (const anchorKey of Object.keys(byAnchor).sort()) {
      const items = byAnchor[anchorKey];

      if (anchorKey === '__MISSING_ANCHOR__') {
        for (const item of items) {
          conflicts.push({
            status: STATUS_YELLOW,
            code: 'PATCH_ANCHOR_MISSING',
            targetFile: group.targetFile,
            itemIndexes: [item.index],
            ownerWorkers: unique([item.owner_worker]),
            reason: 'Patch request has no Anchor label.',
            recommendation: 'Commander should confirm insertion location or request a small hotfix with Anchor.',
            commanderDecisionNeeded: true,
          });
        }

        continue;
      }

      if (items.length > 1) {
        conflicts.push({
          status: STATUS_YELLOW,
          code: 'MULTIPLE_PATCH_REQUESTS_FOR_SAME_ANCHOR',
          targetFile: group.targetFile,
          anchor: items[0].anchor,
          itemIndexes: items.map(function mapIndex(item) {
            return item.index;
          }),
          ownerWorkers: unique(items.map(function mapOwner(item) {
            return item.owner_worker;
          })),
          reason: 'Multiple patch_request units use the same target file and anchor.',
          recommendation: 'Commander should decide exact patch order for this anchor.',
          commanderDecisionNeeded: true,
        });
      }
    }

    for (const item of group.items) {
      if (!item.add) {
        conflicts.push({
          status: STATUS_YELLOW,
          code: 'PATCH_ADD_BLOCK_MISSING',
          targetFile: group.targetFile,
          itemIndexes: [item.index],
          ownerWorkers: unique([item.owner_worker]),
          reason: 'Patch request has no Add label content.',
          recommendation: 'Commander should confirm whether the patch content is in another field or request a small hotfix.',
          commanderDecisionNeeded: true,
        });
      }
    }
  }

  return conflicts;
}

function buildSuggestedOrder(groupedByTargetFile, options) {
  const orderedGroups = Object.keys(groupedByTargetFile).sort(function sortGroups(left, right) {
    if (left === MISSING_TARGET_KEY && right !== MISSING_TARGET_KEY) {
      return 1;
    }

    if (right === MISSING_TARGET_KEY && left !== MISSING_TARGET_KEY) {
      return -1;
    }

    return left.localeCompare(right);
  });

  const output = [];
  let sequence = 1;

  for (const key of orderedGroups) {
    const group = groupedByTargetFile[key];
    const orderedItems = group.items.slice().sort(comparePatchRecords);

    for (const item of orderedItems) {
      output.push(Object.assign({
        sequence,
        targetGroup: key,
        applyPatch: false,
      }, toSuggestedOrderItem(item)));
      sequence += 1;
    }
  }

  if (options.groupedOnly === true) {
    return output.map(function mapGroupedOnly(item) {
      return {
        sequence: item.sequence,
        targetFile: item.targetFile,
        sourcePath: item.sourcePath,
        sourceIndex: item.sourceIndex,
        applyPatch: false,
      };
    });
  }

  return output;
}

function toSuggestedOrderItem(item) {
  return {
    sourceIndex: item.index,
    sourcePath: item.sourcePath,
    targetFile: item.normalizedTargetFile,
    purpose: item.purpose,
    anchor: item.anchor,
    hasAddBlock: Boolean(item.add),
    hasDoNotRemove: Boolean(item.doNotRemove),
    integrationNote: item.integrationNote,
    owner_worker: item.owner_worker,
    missingLabels: item.missingLabels.slice(),
    sortHints: item.sortHints.slice(),
    orderWeight: item.orderWeight,
    commanderDecisionNeeded: item.commanderDecisionNeeded,
    reason: item.reason,
  };
}

function calculateOrderWeight(record) {
  let weight = 100;

  if (!record.normalizedTargetFile) {
    weight += 900;
  }

  if (!record.anchor) {
    weight += 180;
  }

  if (!record.add) {
    weight += 120;
  }

  if (record.doNotRemove) {
    weight -= 30;
  }

  if (hasDependencyWording(record.integrationNote)) {
    weight += 60;
  }

  if (/register|init|setup|bootstrap|먼저|초기/i.test(record.purpose + ' ' + record.integrationNote)) {
    weight -= 15;
  }

  if (/binding|listener|event|button|ui|renderer/i.test(record.purpose + ' ' + record.integrationNote)) {
    weight += 15;
  }

  return weight;
}

function comparePatchRecords(left, right) {
  if (left.orderWeight !== right.orderWeight) {
    return left.orderWeight - right.orderWeight;
  }

  if (left.normalizedTargetFile !== right.normalizedTargetFile) {
    return left.normalizedTargetFile.localeCompare(right.normalizedTargetFile);
  }

  if (left.anchor !== right.anchor) {
    return left.anchor.localeCompare(right.anchor);
  }

  return left.index - right.index;
}

function buildPatchRequestReason(record) {
  const parts = [];

  if (!record.normalizedTargetFile) {
    parts.push('Target file missing.');
  }

  if (!record.anchor) {
    parts.push('Anchor missing.');
  }

  if (!record.add) {
    parts.push('Add block missing.');
  }

  if (record.doNotRemove) {
    parts.push('Preservation constraint present.');
  }

  if (hasDependencyWording(record.integrationNote)) {
    parts.push('Integration note contains dependency/order wording.');
  }

  if (parts.length === 0) {
    parts.push('Patch request has target file, anchor, and add block.');
  }

  return parts.join(' ');
}

function groupItemsByAnchor(items) {
  const grouped = Object.create(null);

  for (const item of items) {
    const key = normalizeAnchorKey(item.anchor);

    if (!grouped[key]) {
      grouped[key] = [];
    }

    grouped[key].push(item);
  }

  return grouped;
}

function normalizeAnchorKey(anchor) {
  const text = toCleanString(anchor).replace(/\s+/g, ' ').toLowerCase();
  return text || '__MISSING_ANCHOR__';
}

function parsePatchRequestLabels(content) {
  const labels = {
    targetFile: '',
    purpose: '',
    anchor: '',
    add: '',
    doNotRemove: '',
    integrationNote: '',
    labelsFound: [],
  };
  const text = String(content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n');
  let currentKey = '';

  for (const line of lines) {
    const parsed = parseLabelLine(line);

    if (parsed) {
      currentKey = parsed.key;
      appendLabelValue(labels, currentKey, parsed.value);
      addUnique(labels.labelsFound, parsed.key);
      continue;
    }

    if (currentKey && line.trim() !== '') {
      appendLabelValue(labels, currentKey, line);
    }
  }

  trimLabelValues(labels);
  return labels;
}

function parseLabelLine(line) {
  const text = String(line || '');
  const colonMatch = text.match(/^\s*(?:[-*]\s*)?(?:#{1,6}\s*)?([A-Za-z][A-Za-z0-9 _-]{1,40})\s*[:：]\s*(.*)$/);

  if (!colonMatch) {
    return null;
  }

  const key = canonicalLabelKey(colonMatch[1]);

  if (!key) {
    return null;
  }

  return {
    key,
    value: colonMatch[2] || '',
  };
}

function canonicalLabelKey(rawLabel) {
  const normalized = normalizeLabel(rawLabel);

  for (const key of Object.keys(LABEL_ALIASES)) {
    for (const alias of LABEL_ALIASES[key]) {
      if (normalized === normalizeLabel(alias)) {
        return key;
      }
    }
  }

  return '';
}

function normalizeLabel(value) {
  return toCleanString(value).toLowerCase().replace(/[\s_-]+/g, ' ');
}

function appendLabelValue(labels, key, value) {
  if (!key || !Object.prototype.hasOwnProperty.call(labels, key)) {
    return;
  }

  const text = String(value || '');

  if (labels[key]) {
    labels[key] += '\n' + text;
  } else {
    labels[key] = text;
  }
}

function trimLabelValues(labels) {
  for (const key of ['targetFile', 'purpose', 'anchor', 'add', 'doNotRemove', 'integrationNote']) {
    labels[key] = toCleanString(labels[key]);
  }
}

function isPatchRequestCandidate(unit, options) {
  if (unit.operation === PATCH_REQUEST_OPERATION) {
    return true;
  }

  if (options.includeLabelOnlyPatchRequests !== true) {
    return false;
  }

  const lowerContent = String(unit.content || '').toLowerCase();
  return /target\s*file\s*[:：]/.test(lowerContent) && /anchor\s*[:：]|add\s*[:：]/.test(lowerContent);
}

function normalizeSourceUnit(unit, index, options) {
  const raw = unit && typeof unit === 'object' ? unit : {};
  const path = readFirstStringField(raw, ['path', 'file_path', 'target_path']);

  return {
    raw,
    index,
    path,
    normalizedPath: normalizePath(path, options),
    language: readFirstStringField(raw, ['language', 'lang']),
    purpose: readFirstStringField(raw, ['purpose']),
    operation: normalizeOperation(readFirstStringField(raw, ['operation', 'op'])),
    owner_worker: readFirstStringField(raw, ['owner_worker', 'ownerWorker', 'worker_id', 'workerId']),
    target_stage: readFirstStringField(raw, ['target_stage', 'targetStage']),
    content: readFirstStringField(raw, ['content', 'body', 'source', 'text']),
  };
}

function normalizeOperation(operation) {
  const text = toCleanString(operation).toLowerCase().replace(/-/g, '_').replace(/\s+/g, '_');

  if (!text) {
    return 'unknown';
  }

  if (text === 'patchrequest') {
    return PATCH_REQUEST_OPERATION;
  }

  if (text === 'reportonly') {
    return REPORT_ONLY_OPERATION;
  }

  if (text === 'create' || text === 'modify' || text === 'replace' || text === PATCH_REQUEST_OPERATION || text === REPORT_ONLY_OPERATION) {
    return text;
  }

  return 'unknown';
}

function normalizeOptions(options) {
  const raw = options && typeof options === 'object' ? options : {};

  return {
    caseSensitivePath: raw.caseSensitivePath === true,
    keepLeadingDotSlash: raw.keepLeadingDotSlash === true,
    includeLabelOnlyPatchRequests: raw.includeLabelOnlyPatchRequests !== false,
    groupedOnly: raw.groupedOnly === true,
  };
}

function normalizePath(pathValue, options) {
  const opts = options || normalizeOptions(null);
  let text = toCleanString(pathValue).replace(/\\/g, '/').replace(/\/{2,}/g, '/').trim();

  if (!opts.keepLeadingDotSlash) {
    text = text.replace(/^\.\//, '');
  }

  if (!opts.caseSensitivePath) {
    text = text.toLowerCase();
  }

  return text;
}

function readFirstStringField(unit, fieldNames) {
  if (!unit || typeof unit !== 'object') {
    return '';
  }

  for (const fieldName of fieldNames) {
    const value = readField(unit, fieldName);

    if (value !== undefined && value !== null && toCleanString(value) !== '') {
      return toCleanString(value);
    }
  }

  return '';
}

function readField(unit, fieldName) {
  if (!unit || typeof unit !== 'object') {
    return undefined;
  }

  if (Object.prototype.hasOwnProperty.call(unit, fieldName)) {
    return unit[fieldName];
  }

  const nestedContainers = ['metadata', 'sourceFile', 'source_file', 'header', 'patchRequest', 'patch_request'];

  for (const containerName of nestedContainers) {
    const container = unit[containerName];

    if (
      container &&
      typeof container === 'object' &&
      Object.prototype.hasOwnProperty.call(container, fieldName)
    ) {
      return container[fieldName];
    }
  }

  return undefined;
}

function firstNonBlank(values) {
  for (const value of values) {
    const cleaned = toCleanString(value);

    if (cleaned) {
      return cleaned;
    }
  }

  return '';
}

function hasDependencyWording(value) {
  return /\b(after|before|depends|dependency|requires|then|next)\b|이후|이전|먼저|다음|의존/.test(toCleanString(value).toLowerCase());
}

function getRecommendedStatus(conflicts) {
  for (const conflict of conflicts) {
    if (conflict.status === STATUS_RED) {
      return STATUS_RED;
    }
  }

  if (conflicts.length > 0) {
    return STATUS_YELLOW;
  }

  return STATUS_GREEN;
}

function toCleanString(value) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).replace(/\0/g, '').trim();
}

function addUnique(target, value) {
  const cleaned = toCleanString(value);

  if (!cleaned || target.indexOf(cleaned) !== -1) {
    return;
  }

  target.push(cleaned);
}

function unique(values) {
  const output = [];

  for (const value of values) {
    addUnique(output, value);
  }

  return output;
}

module.exports = {
  sortPatchRequestConflicts,
};