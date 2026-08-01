'use strict';

const TARGET_TYPES = Object.freeze({
  RUNTIME_APP: 'RUNTIME_APP',
  PARTIAL_ASSEMBLY: 'PARTIAL_ASSEMBLY',
  PATCH_REQUEST_ONLY: 'PATCH_REQUEST_ONLY',
  GENERATED_ONLY: 'GENERATED_ONLY',
  REPORT_ONLY: 'REPORT_ONLY',
  UNKNOWN_TARGET_TYPE: 'UNKNOWN_TARGET_TYPE',
});

const DONE_LEVELS = Object.freeze({
  DONE_LIGHT: 'DONE_LIGHT',
  DONE_STANDARD: 'DONE_STANDARD',
  DONE_FULL: 'DONE_FULL',
});

const PATCH_REQUEST_OPERATION = 'patch_request';
const REPORT_ONLY_OPERATION = 'report_only';
const DIRECT_MATERIALIZE_OPERATIONS = new Set(['create', 'modify', 'replace']);
const KNOWN_OPERATIONS = new Set(['create', 'modify', 'replace', PATCH_REQUEST_OPERATION, REPORT_ONLY_OPERATION]);

const DEFAULT_RUNTIME_CORE_BASENAMES = [
  'package.json',
  'main.js',
  'preload.js',
  'renderer.js',
  'index.html',
  'safe_panel_main.js',
  'safe_panel_preload.js',
  'safe_panel_renderer.js',
  'safe_panel.html',
];

const DEFAULT_GENERATED_PREFIXES = [
  'generated/',
  'output/',
  'outputs/',
  'out/',
  'artifacts/generated/',
  'stage4/generated/',
  'tmp/generated/',
  'temp/generated/',
];

function classifyRuntimePartialAssembly(sourceUnits, context, options) {
  const opts = normalizeOptions(options);
  const ctx = normalizeContext(context, opts);
  const units = normalizeSourceUnits(sourceUnits, opts);
  const summary = buildSummary(units, ctx, opts);
  const reasons = [];

  if (!Array.isArray(sourceUnits)) {
    reasons.push('sourceUnits was not an array; classification used an empty unit list.');
  }

  const explicitTargetType = normalizeTargetType(readFirstStringField(ctx.raw, [
    'targetType',
    'target_type',
    'assemblyTargetType',
    'assembly_target_type',
  ]));

  if (explicitTargetType) {
    reasons.push('context explicitly supplied targetType=' + explicitTargetType + '.');
    return buildResult(explicitTargetType, 1, reasons, summary, opts);
  }

  if (units.length === 0) {
    reasons.push('No SOURCE_FILE units were available for runtime/partial assembly classification.');
    return buildResult(TARGET_TYPES.UNKNOWN_TARGET_TYPE, 0.15, reasons, summary, opts);
  }

  if (summary.reportOnlyCount === summary.totalUnits) {
    reasons.push('All units are report_only; no runtime or partial assembly materialization is implied.');
    return buildResult(TARGET_TYPES.REPORT_ONLY, 0.98, reasons, summary, opts);
  }

  if (summary.patchRequestCount > 0 && summary.materializableNonPatchCount === 0) {
    reasons.push('All materializable units are patch_request units; this is not a standalone runtime replacement.');
    return buildResult(TARGET_TYPES.PATCH_REQUEST_ONLY, 0.94, reasons, summary, opts);
  }

  if (
    summary.materializableCount > 0 &&
    summary.generatedPathCount === summary.materializableCount &&
    summary.runtimeCoreTouchCount === 0
  ) {
    reasons.push('All materializable units are under generated/output-style paths and no runtime core path was touched.');
    return buildResult(TARGET_TYPES.GENERATED_ONLY, 0.9, reasons, summary, opts);
  }

  const runtimeScore = scoreRuntimeApp(summary, ctx);
  const partialScore = scorePartialAssembly(summary, ctx);

  if (runtimeScore >= opts.runtimeScoreThreshold && runtimeScore >= partialScore) {
    appendRuntimeReasons(reasons, summary, ctx, runtimeScore);
    return buildResult(TARGET_TYPES.RUNTIME_APP, runtimeScore, reasons, summary, opts);
  }

  if (summary.materializableCount > 0 || summary.patchRequestCount > 0) {
    appendPartialReasons(reasons, summary, partialScore);
    return buildResult(TARGET_TYPES.PARTIAL_ASSEMBLY, partialScore, reasons, summary, opts);
  }

  reasons.push('Units exist, but no materializable source, patch_request, generated output, or report_only pattern was decisive.');
  return buildResult(TARGET_TYPES.UNKNOWN_TARGET_TYPE, 0.25, reasons, summary, opts);
}

function buildResult(targetType, confidence, reasons, summary, options) {
  const normalizedConfidence = roundConfidence(clamp(confidence, 0, 1));
  const doneLevelHint = getDoneLevelHint(targetType, summary);
  const commanderDecisionNeeded = shouldCommanderDecide(targetType, normalizedConfidence, summary, options);

  return {
    targetType,
    confidence: normalizedConfidence,
    reasons: reasons.slice(),
    doneLevelHint,
    commanderDecisionNeeded,
    summary,
  };
}

function shouldCommanderDecide(targetType, confidence, summary, options) {
  if (targetType === TARGET_TYPES.RUNTIME_APP || targetType === TARGET_TYPES.UNKNOWN_TARGET_TYPE) {
    return true;
  }

  if (confidence < options.autoDecisionConfidenceThreshold) {
    return true;
  }

  if (summary.runtimeCoreTouchCount > 0 || summary.mixedRuntimeAndPartialSignals) {
    return true;
  }

  if (summary.patchRequestCount > 0 && summary.directWriteCount > 0) {
    return true;
  }

  return false;
}

function getDoneLevelHint(targetType, summary) {
  if (targetType === TARGET_TYPES.RUNTIME_APP) {
    return DONE_LEVELS.DONE_FULL;
  }

  if (targetType === TARGET_TYPES.PARTIAL_ASSEMBLY) {
    return summary.materializableCount >= 3 ? DONE_LEVELS.DONE_STANDARD : DONE_LEVELS.DONE_LIGHT;
  }

  if (targetType === TARGET_TYPES.PATCH_REQUEST_ONLY) {
    return summary.patchRequestCount >= 3 ? DONE_LEVELS.DONE_STANDARD : DONE_LEVELS.DONE_LIGHT;
  }

  return DONE_LEVELS.DONE_LIGHT;
}

function buildSummary(units, context, options) {
  const summary = {
    totalUnits: units.length,
    materializableCount: 0,
    materializableNonPatchCount: 0,
    directWriteCount: 0,
    patchRequestCount: 0,
    reportOnlyCount: 0,
    generatedPathCount: 0,
    runtimeCoreTouchCount: 0,
    runtimeBaselinePathTouchCount: 0,
    packageJsonTouchCount: 0,
    mainTouchCount: 0,
    preloadTouchCount: 0,
    rendererTouchCount: 0,
    htmlTouchCount: 0,
    rootRuntimeFileTouchCount: 0,
    nonGeneratedMaterializableCount: 0,
    workerCount: 0,
    ownerWorkers: [],
    operations: [],
    runtimeCorePaths: [],
    generatedPaths: [],
    materializablePaths: [],
    reportOnlyPaths: [],
    patchRequestPaths: [],
    mixedRuntimeAndPartialSignals: false,
    contextSignals: collectContextSignals(context),
  };

  const workerSeen = Object.create(null);

  for (const unit of units) {
    addUnique(summary.operations, unit.operation);

    if (unit.owner_worker && !workerSeen[unit.owner_worker]) {
      workerSeen[unit.owner_worker] = true;
      summary.ownerWorkers.push(unit.owner_worker);
    }

    if (unit.operation === REPORT_ONLY_OPERATION) {
      summary.reportOnlyCount += 1;
      addUnique(summary.reportOnlyPaths, unit.normalizedPath);
      continue;
    }

    if (unit.operation === PATCH_REQUEST_OPERATION) {
      summary.patchRequestCount += 1;
      summary.materializableCount += 1;
      addUnique(summary.patchRequestPaths, unit.normalizedPath);
      addUnique(summary.materializablePaths, unit.normalizedPath);
    } else if (DIRECT_MATERIALIZE_OPERATIONS.has(unit.operation) || unit.operation === 'unknown') {
      summary.materializableCount += 1;
      summary.materializableNonPatchCount += 1;
      summary.directWriteCount += DIRECT_MATERIALIZE_OPERATIONS.has(unit.operation) ? 1 : 0;
      addUnique(summary.materializablePaths, unit.normalizedPath);
    }

    if (isGeneratedPath(unit.normalizedPath, context, options)) {
      summary.generatedPathCount += 1;
      addUnique(summary.generatedPaths, unit.normalizedPath);
    } else if (unit.operation !== REPORT_ONLY_OPERATION) {
      summary.nonGeneratedMaterializableCount += 1;
    }

    if (isRuntimeCorePath(unit.normalizedPath, context)) {
      summary.runtimeCoreTouchCount += 1;
      addUnique(summary.runtimeCorePaths, unit.normalizedPath);
    }

    if (isRuntimeBaselinePath(unit.normalizedPath, context)) {
      summary.runtimeBaselinePathTouchCount += 1;
    }

    updateRuntimeBasenameCounts(summary, unit.normalizedPath);
  }

  summary.workerCount = summary.ownerWorkers.length;
  summary.hasFullClassicRuntimeSet = summary.packageJsonTouchCount > 0 && summary.mainTouchCount > 0 && summary.preloadTouchCount > 0 && (summary.rendererTouchCount > 0 || summary.htmlTouchCount > 0);
  summary.hasSafePanelRuntimeSet = summary.packageJsonTouchCount > 0 && summary.mainTouchCount > 0 && summary.preloadTouchCount > 0 && summary.htmlTouchCount > 0;
  summary.hasMultipleRootRuntimeFiles = summary.rootRuntimeFileTouchCount >= 3;
  summary.mixedRuntimeAndPartialSignals = summary.runtimeCoreTouchCount > 0 && summary.nonGeneratedMaterializableCount > summary.runtimeCoreTouchCount;

  return summary;
}

function scoreRuntimeApp(summary, context) {
  let score = 0;

  if (context.isRuntimeApp === true || context.contextSignals.runtimeTextSignal) {
    score += 0.25;
  }

  if (summary.hasFullClassicRuntimeSet || summary.hasSafePanelRuntimeSet) {
    score += 0.42;
  }

  if (summary.packageJsonTouchCount > 0) {
    score += 0.12;
  }

  if (summary.mainTouchCount > 0) {
    score += 0.12;
  }

  if (summary.preloadTouchCount > 0) {
    score += 0.1;
  }

  if (summary.rendererTouchCount > 0) {
    score += 0.08;
  }

  if (summary.htmlTouchCount > 0) {
    score += 0.08;
  }

  if (summary.runtimeBaselinePathTouchCount > 0) {
    score += Math.min(0.18, summary.runtimeBaselinePathTouchCount * 0.04);
  }

  if (summary.patchRequestCount > 0 && summary.directWriteCount === 0) {
    score -= 0.25;
  }

  if (summary.generatedPathCount === summary.materializableCount && summary.materializableCount > 0) {
    score -= 0.25;
  }

  return clamp(score, 0, 1);
}

function scorePartialAssembly(summary, context) {
  let score = 0.35;

  if (summary.materializableCount > 0) {
    score += 0.25;
  }

  if (summary.runtimeCoreTouchCount === 0) {
    score += 0.15;
  }

  if (summary.workerCount > 1 || summary.materializableCount > 1) {
    score += 0.1;
  }

  if (summary.patchRequestCount > 0) {
    score += 0.08;
  }

  if (summary.contextSignals.partialTextSignal || context.isPartialAssembly === true) {
    score += 0.18;
  }

  if (summary.hasFullClassicRuntimeSet || summary.hasSafePanelRuntimeSet) {
    score -= 0.25;
  }

  if (summary.generatedPathCount === summary.materializableCount && summary.materializableCount > 0) {
    score -= 0.18;
  }

  return clamp(score, 0, 1);
}

function appendRuntimeReasons(reasons, summary, context, runtimeScore) {
  reasons.push('Runtime App score reached ' + roundConfidence(runtimeScore) + '.');

  if (context.isRuntimeApp === true || summary.contextSignals.runtimeTextSignal) {
    reasons.push('Context contains runtime/baseline wording or explicit runtime flag.');
  }

  if (summary.hasFullClassicRuntimeSet || summary.hasSafePanelRuntimeSet) {
    reasons.push('Detected package/main/preload plus renderer or html runtime anchor set.');
  }

  if (summary.runtimeBaselinePathTouchCount > 0) {
    reasons.push('Detected touch on context runtime baseline path list.');
  }

  if (summary.runtimeCoreTouchCount > 0) {
    reasons.push('Detected runtime core filename touch; Runtime replacement must not be executed by this classifier.');
  }
}

function appendPartialReasons(reasons, summary, partialScore) {
  reasons.push('Partial Assembly score reached ' + roundConfidence(partialScore) + '.');

  if (summary.runtimeCoreTouchCount === 0) {
    reasons.push('No runtime core file touch was detected.');
  }

  if (summary.materializableCount > 0) {
    reasons.push('Materializable SOURCE_FILE units exist but do not form a full runtime baseline set.');
  }

  if (summary.patchRequestCount > 0) {
    reasons.push('patch_request units exist and require Commander ordering before final assembly.');
  }
}

function normalizeSourceUnits(sourceUnits, options) {
  if (!Array.isArray(sourceUnits)) {
    return [];
  }

  return sourceUnits.map(function mapUnit(unit, index) {
    const raw = unit && typeof unit === 'object' ? unit : {};
    const path = readFirstStringField(raw, ['path', 'file_path', 'target_path']);

    return {
      index,
      path,
      normalizedPath: normalizePath(path, options),
      operation: normalizeOperation(readFirstStringField(raw, ['operation', 'op'])),
      language: normalizeLanguage(readFirstStringField(raw, ['language', 'lang'])),
      purpose: readFirstStringField(raw, ['purpose']),
      owner_worker: readFirstStringField(raw, ['owner_worker', 'ownerWorker', 'worker_id', 'workerId']),
      target_stage: readFirstStringField(raw, ['target_stage', 'targetStage']),
      content: readFirstStringField(raw, ['content', 'body', 'source', 'text']),
    };
  }).filter(function filterUnit(unit) {
    return unit.path || unit.content || unit.operation !== 'unknown';
  });
}

function normalizeContext(context, options) {
  const raw = context && typeof context === 'object' ? context : {};
  const runtimeCoreBasenames = DEFAULT_RUNTIME_CORE_BASENAMES.slice();
  const generatedPrefixes = DEFAULT_GENERATED_PREFIXES.slice();
  const runtimeBaselinePaths = [];

  addNormalizedBasenames(runtimeCoreBasenames, raw.runtimeCoreBasenames);
  addNormalizedBasenames(runtimeCoreBasenames, raw.coreBasenames);
  addNormalizedPrefixes(generatedPrefixes, raw.generatedPrefixes, options);
  addNormalizedPrefixes(generatedPrefixes, raw.generatedPathPrefixes, options);
  addNormalizedPaths(runtimeBaselinePaths, raw.runtimeBaselinePaths, options);
  addNormalizedPaths(runtimeBaselinePaths, raw.runtimeAppPaths, options);
  addNormalizedPaths(runtimeBaselinePaths, raw.baselineRuntimePaths, options);

  return {
    raw,
    runtimeCoreBasenames: unique(runtimeCoreBasenames.map(function normalize(value) {
      return toCleanString(value).toLowerCase();
    }).filter(Boolean)),
    generatedPrefixes: unique(generatedPrefixes.map(function normalize(value) {
      return normalizePathPrefix(value, options);
    }).filter(Boolean)),
    runtimeBaselinePaths: unique(runtimeBaselinePaths),
    isRuntimeApp: raw.isRuntimeApp === true || raw.runtimeApp === true || raw.isRuntimeBaseline === true,
    isPartialAssembly: raw.isPartialAssembly === true || raw.partialAssembly === true,
    contextSignals: collectContextSignals(raw),
  };
}

function collectContextSignals(context) {
  const text = [
    readFirstStringField(context, ['batchPurpose', 'taskGoal', 'goal', 'description', 'handoff', 'mode']),
    readFirstStringField(context, ['targetStage', 'target_stage', 'stage']),
  ].join(' ').toLowerCase();

  return {
    runtimeTextSignal: /runtime|baseline|기준판|런타임/.test(text),
    partialTextSignal: /partial|assembly|부분|산출물|결합/.test(text),
  };
}

function normalizeOptions(options) {
  const raw = options && typeof options === 'object' ? options : {};

  return {
    caseSensitivePath: raw.caseSensitivePath === true,
    keepLeadingDotSlash: raw.keepLeadingDotSlash === true,
    runtimeScoreThreshold: typeof raw.runtimeScoreThreshold === 'number' ? raw.runtimeScoreThreshold : 0.65,
    autoDecisionConfidenceThreshold: typeof raw.autoDecisionConfidenceThreshold === 'number' ? raw.autoDecisionConfidenceThreshold : 0.7,
  };
}

function normalizeTargetType(value) {
  const text = toCleanString(value).toUpperCase().replace(/[-\s]+/g, '_');

  if (Object.prototype.hasOwnProperty.call(TARGET_TYPES, text)) {
    return TARGET_TYPES[text];
  }

  return '';
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

  if (KNOWN_OPERATIONS.has(text)) {
    return text;
  }

  return 'unknown';
}

function normalizeLanguage(language) {
  const text = toCleanString(language).toLowerCase().replace(/-/g, '_');

  if (text === 'js') {
    return 'javascript';
  }

  if (text === 'md') {
    return 'markdown';
  }

  if (text === 'ps1') {
    return 'powershell';
  }

  return text || 'unknown';
}

function isRuntimeCorePath(normalizedPath, context) {
  if (!normalizedPath) {
    return false;
  }

  const basename = getBasename(normalizedPath);
  return context.runtimeCoreBasenames.indexOf(basename) !== -1 || isRuntimeBaselinePath(normalizedPath, context);
}

function isRuntimeBaselinePath(normalizedPath, context) {
  if (!normalizedPath) {
    return false;
  }

  return context.runtimeBaselinePaths.indexOf(normalizedPath) !== -1;
}

function isGeneratedPath(normalizedPath, context) {
  if (!normalizedPath) {
    return false;
  }

  for (const prefix of context.generatedPrefixes) {
    if (normalizedPath.indexOf(prefix) === 0) {
      return true;
    }
  }

  return false;
}

function updateRuntimeBasenameCounts(summary, normalizedPath) {
  const basename = getBasename(normalizedPath);

  if (!basename) {
    return;
  }

  if (basename === 'package.json') {
    summary.packageJsonTouchCount += 1;
  }

  if (basename === 'main.js' || basename === 'safe_panel_main.js') {
    summary.mainTouchCount += 1;
  }

  if (basename === 'preload.js' || basename === 'safe_panel_preload.js') {
    summary.preloadTouchCount += 1;
  }

  if (basename === 'renderer.js' || basename === 'safe_panel_renderer.js') {
    summary.rendererTouchCount += 1;
  }

  if (basename === 'index.html' || basename === 'safe_panel.html') {
    summary.htmlTouchCount += 1;
  }

  if (DEFAULT_RUNTIME_CORE_BASENAMES.indexOf(basename) !== -1 && normalizedPath.split('/').length <= 2) {
    summary.rootRuntimeFileTouchCount += 1;
  }
}

function normalizePath(pathValue, options) {
  const opts = options || normalizeOptions(null);
  let text = toCleanString(pathValue).replace(/\\/g, '/').replace(/\/\/+/g, '/').trim();

  if (!opts.keepLeadingDotSlash) {
    text = text.replace(/^\.\//, '');
  }

  if (!opts.caseSensitivePath) {
    text = text.toLowerCase();
  }

  return text;
}

function normalizePathPrefix(pathValue, options) {
  let text = normalizePath(pathValue, options);

  if (text && !text.endsWith('/')) {
    text += '/';
  }

  return text;
}

function addNormalizedPaths(target, values, options) {
  if (Array.isArray(values)) {
    for (const value of values) {
      addUnique(target, normalizePath(value, options));
    }
    return;
  }

  if (typeof values === 'string') {
    addUnique(target, normalizePath(values, options));
  }
}

function addNormalizedPrefixes(target, values, options) {
  if (Array.isArray(values)) {
    for (const value of values) {
      addUnique(target, normalizePathPrefix(value, options));
    }
    return;
  }

  if (typeof values === 'string') {
    addUnique(target, normalizePathPrefix(values, options));
  }
}

function addNormalizedBasenames(target, values) {
  if (Array.isArray(values)) {
    for (const value of values) {
      addUnique(target, getBasename(toCleanString(value).toLowerCase()));
    }
    return;
  }

  if (typeof values === 'string') {
    addUnique(target, getBasename(toCleanString(values).toLowerCase()));
  }
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

  const nestedContainers = ['metadata', 'sourceFile', 'source_file', 'header'];

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

function getBasename(pathValue) {
  const text = toCleanString(pathValue).replace(/\\/g, '/');

  if (!text) {
    return '';
  }

  const parts = text.split('/');
  return parts[parts.length - 1];
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundConfidence(value) {
  return Math.round(value * 100) / 100;
}

module.exports = {
  classifyRuntimePartialAssembly,
  TARGET_TYPES,
};