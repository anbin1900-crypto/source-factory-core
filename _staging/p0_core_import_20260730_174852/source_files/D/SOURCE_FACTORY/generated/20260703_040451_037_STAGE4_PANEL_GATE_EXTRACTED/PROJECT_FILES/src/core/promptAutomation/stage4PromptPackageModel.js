'use strict';

const SCHEMA_VERSION = 'stage4.prompt_package_model.v1';
const PACKAGE_OBJECT_TYPE = 'stage4_prompt_package';
const PACKAGE_PROMPT_OBJECT_TYPE = 'stage4_prompt_package_prompt';
const RUN_ORDER_ITEM_OBJECT_TYPE = 'stage4_prompt_package_run_order_item';
const DISPATCH_PACKET_TYPE = 'stage4_prompt_dispatch_packet';

const PROMPT_PACKAGE_STATUS = Object.freeze({
DRAFT: 'draft',
READY: 'ready',
QUEUED: 'queued',
RUNNING: 'running',
COMPLETED: 'completed',
FAILED: 'failed',
ARCHIVED: 'archived'
});

const PROMPT_PACKAGE_ORDER_POLICY = Object.freeze({
FIXED_SEQUENCE: 'fixed_sequence',
WORKER_BRANCH: 'worker_branch',
ROUND_ROBIN: 'round_robin'
});

function isPlainObject(value) {
return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toNonEmptyString(value, fallback) {
if (typeof value === 'string' && value.trim()) {
return value.trim();
}
if (value === 0) {
return '0';
}
if (value !== null && value !== undefined && typeof value !== 'object') {
const text = String(value).trim();
return text || fallback;
}
return fallback;
}

function toNullableString(value) {
if (value === null || value === undefined) {
return null;
}
const text = String(value).trim();
return text || null;
}

function normalizeInteger(value, fallback) {
const numberValue = Number(value);
if (Number.isFinite(numberValue)) {
return Math.max(0, Math.floor(numberValue));
}
return fallback;
}

function normalizeStringArray(value) {
if (!Array.isArray(value)) {
return [];
}

const seen = new Set();
const result = [];
value.forEach((entry) => {
const text = toNullableString(entry);
if (text && !seen.has(text)) {
seen.add(text);
result.push(text);
}
});
return result;
}

function normalizeMetadata(value) {
if (!isPlainObject(value)) {
return {};
}
return Object.assign({}, value);
}

function valuesOf(record) {
return Object.keys(record).map((key) => record[key]);
}

function normalizeEnum(value, enumRecord, fallback) {
const text = toNonEmptyString(value, fallback);
const allowed = valuesOf(enumRecord);
return allowed.includes(text) ? text : fallback;
}

function stableHash(seed) {
const text = toNonEmptyString(seed, 'package');
let hash = 2166136261;

for (let index = 0; index < text.length; index += 1) {
hash ^= text.charCodeAt(index);
hash = Math.imul(hash, 16777619);
}

return (hash >>> 0).toString(36);
}

function createStableId(prefix, seed) {
const safePrefix = toNonEmptyString(prefix, 'id')
.toLowerCase()
.replace(/[^a-z0-9_]+/g, '')
.replace(/^_+|_+$/g, '') || 'id';

return `${safePrefix}_${stableHash(seed || safePrefix)}`;
}

function normalizeWorkerId(value, fallbackIndex) {
const fallback = `WORKER_${String(fallbackIndex + 1).padStart(2, '0')}`;
return toNonEmptyString(value, fallback);
}

function normalizePromptInput(input, index) {
const source = isPlainObject(input) ? input : {
prompt_text: toNonEmptyString(input, '')
};

const title = toNonEmptyString(source.title || source.name, `Prompt ${index + 1}`);
const promptText = toNonEmptyString(source.prompt_text || source.promptText || source.text || source.content, '');
const workerId = normalizeWorkerId(source.worker_id || source.workerId || source.assigned_worker_id, index);
const sequence = normalizeInteger(source.sequence, index + 1);
const seed = [
title,
promptText,
workerId,
sequence
].join('|');

return {
object_type: PACKAGE_PROMPT_OBJECT_TYPE,
package_prompt_id: toNonEmptyString(
source.package_prompt_id || source.packagePromptId || source.prompt_id || source.promptId || source.id,
createStableId('package_prompt', seed)
),
library_prompt_id: toNullableString(source.library_prompt_id || source.libraryPromptId),
title,
prompt_text: promptText,
sequence,
worker_id: workerId,
branch_key: toNonEmptyString(source.branch_key || source.branchKey || workerId, workerId),
tags: normalizeStringArray(source.tags),
metadata: normalizeMetadata(source.metadata)
};
}

function normalizePrompts(value) {
if (!Array.isArray(value)) {
return [];
}
return value.map((prompt, index) => normalizePromptInput(prompt, index));
}

function normalizeWorkerIds(source, prompts) {
const explicitWorkers = normalizeStringArray(source.worker_ids || source.workerIds || source.workers);
const promptWorkers = normalizeStringArray(prompts.map((prompt) => prompt.worker_id));
const combined = explicitWorkers.concat(promptWorkers);
const seen = new Set();
const result = [];

combined.forEach((workerId) => {
if (!seen.has(workerId)) {
seen.add(workerId);
result.push(workerId);
}
});

return result.length > 0 ? result : ['WORKER_01'];
}

function createPromptPackage(input, options) {
const source = isPlainObject(input) ? input : {};
const config = isPlainObject(options) ? options : {};
const now = toNonEmptyString(config.now || source.now, new Date().toISOString());
const prompts = normalizePrompts(source.prompts || source.items);
const title = toNonEmptyString(source.title || source.name, 'Prompt Package');
const orderPolicy = normalizeEnum(
source.order_policy || source.orderPolicy || source.policy,
PROMPT_PACKAGE_ORDER_POLICY,
PROMPT_PACKAGE_ORDER_POLICY.FIXED_SEQUENCE
);
const packageId = toNonEmptyString(
source.package_id || source.packageId || source.id,
createStableId('prompt_package', `${title}|${prompts.length}|${orderPolicy}`)
);

return {
object_type: PACKAGE_OBJECT_TYPE,
schema_version: SCHEMA_VERSION,
package_id: packageId,
title,
description: toNonEmptyString(source.description, ''),
status: normalizeEnum(source.status, PROMPT_PACKAGE_STATUS, PROMPT_PACKAGE_STATUS.DRAFT),
order_policy: orderPolicy,
worker_ids: normalizeWorkerIds(source, prompts),
prompts,
created_at: toNonEmptyString(source.created_at || source.createdAt, now),
updated_at: toNonEmptyString(source.updated_at || source.updatedAt, now),
metadata: normalizeMetadata(source.metadata)
};
}

function validatePromptPackage(pkg) {
const errors = [];

if (!isPlainObject(pkg)) {
return {
ok: false,
errors: ['package must be a plain object']
};
}

if (pkg.object_type !== PACKAGE_OBJECT_TYPE) {
errors.push(`object_type must be ${PACKAGE_OBJECT_TYPE}`);
}

if (pkg.schema_version !== SCHEMA_VERSION) {
errors.push(`schema_version must be ${SCHEMA_VERSION}`);
}

if (!toNullableString(pkg.package_id)) {
errors.push('package_id is required');
}

if (!toNullableString(pkg.title)) {
errors.push('title is required');
}

if (!valuesOf(PROMPT_PACKAGE_STATUS).includes(pkg.status)) {
errors.push(`status must be one of ${valuesOf(PROMPT_PACKAGE_STATUS).join(', ')}`);
}

if (!valuesOf(PROMPT_PACKAGE_ORDER_POLICY).includes(pkg.order_policy)) {
errors.push(`order_policy must be one of ${valuesOf(PROMPT_PACKAGE_ORDER_POLICY).join(', ')}`);
}

if (!Array.isArray(pkg.worker_ids)) {
errors.push('worker_ids must be an array');
} else if (pkg.worker_ids.length === 0) {
errors.push('worker_ids must not be empty');
}

if (!Array.isArray(pkg.prompts)) {
errors.push('prompts must be an array');
} else if (pkg.prompts.length === 0) {
errors.push('prompts must not be empty');
} else {
pkg.prompts.forEach((prompt, index) => {
const label = `prompts[${index}]`;
if (!isPlainObject(prompt)) {
errors.push(`${label} must be a plain object`);
return;
}
if (prompt.object_type !== PACKAGE_PROMPT_OBJECT_TYPE) {
errors.push(`${label}.object_type must be ${PACKAGE_PROMPT_OBJECT_TYPE}`);
}
if (!toNullableString(prompt.package_prompt_id)) {
errors.push(`${label}.package_prompt_id is required`);
}
if (!toNullableString(prompt.title)) {
errors.push(`${label}.title is required`);
}
if (!toNullableString(prompt.prompt_text)) {
errors.push(`${label}.prompt_text is required`);
}
if (!toNullableString(prompt.worker_id)) {
errors.push(`${label}.worker_id is required`);
}
if (!Number.isInteger(prompt.sequence) || prompt.sequence < 0) {
errors.push(`${label}.sequence must be a non-negative integer`);
}
if (!Array.isArray(prompt.tags)) {
errors.push(`${label}.tags must be an array`);
}
if (!isPlainObject(prompt.metadata)) {
errors.push(`${label}.metadata must be a plain object`);
}
});
}

if (!isPlainObject(pkg.metadata)) {
errors.push('metadata must be a plain object');
}

return {
ok: errors.length === 0,
errors
};
}

function cloneRunOrderPrompt(prompt, sequenceNumber, workerId) {
return {
object_type: RUN_ORDER_ITEM_OBJECT_TYPE,
run_order_id: createStableId('run_order', `${prompt.package_prompt_id}|${sequenceNumber}|${workerId}`),
package_prompt_id: prompt.package_prompt_id,
title: prompt.title,
prompt_text: prompt.prompt_text,
sequence: sequenceNumber,
worker_id: workerId,
branch_key: prompt.branch_key,
tags: normalizeStringArray(prompt.tags),
metadata: normalizeMetadata(prompt.metadata)
};
}

function getFixedSequenceRunOrder(pkg) {
return pkg.prompts
.slice()
.sort((left, right) => {
if (left.sequence !== right.sequence) {
return left.sequence - right.sequence;
}
return left.package_prompt_id.localeCompare(right.package_prompt_id);
})
.map((prompt, index) => cloneRunOrderPrompt(prompt, index + 1, prompt.worker_id));
}

function getWorkerBranchRunOrder(pkg) {
const grouped = new Map();

pkg.prompts.forEach((prompt) => {
const branchKey = toNonEmptyString(prompt.branch_key, prompt.worker_id);
if (!grouped.has(branchKey)) {
grouped.set(branchKey, []);
}
grouped.get(branchKey).push(prompt);
});

const result = [];
Array.from(grouped.keys()).sort().forEach((branchKey) => {
grouped.get(branchKey)
.sort((left, right) => {
if (left.sequence !== right.sequence) {
return left.sequence - right.sequence;
}
return left.package_prompt_id.localeCompare(right.package_prompt_id);
})
.forEach((prompt) => {
result.push(cloneRunOrderPrompt(prompt, result.length + 1, prompt.worker_id));
});
});

return result;
}

function getRoundRobinRunOrder(pkg) {
const workers = normalizeStringArray(pkg.worker_ids);
const queues = new Map();

workers.forEach((workerId) => {
queues.set(workerId, []);
});

pkg.prompts
.slice()
.sort((left, right) => {
if (left.sequence !== right.sequence) {
return left.sequence - right.sequence;
}
return left.package_prompt_id.localeCompare(right.package_prompt_id);
})
.forEach((prompt, index) => {
const fallbackWorker = workers[index % workers.length];
const workerId = queues.has(prompt.worker_id) ? prompt.worker_id : fallbackWorker;
queues.get(workerId).push(prompt);
});

const result = [];
let remaining = true;

while (remaining) {
remaining = false;
workers.forEach((workerId) => {
const queue = queues.get(workerId);
if (queue.length > 0) {
remaining = true;
const prompt = queue.shift();
result.push(cloneRunOrderPrompt(prompt, result.length + 1, workerId));
}
});
}

return result;
}

function getPromptPackageRunOrder(pkg, options) {
const validation = validatePromptPackage(pkg);
if (!validation.ok) {
throw new Error(`Cannot build run order for invalid prompt package: ${validation.errors.join('; ')}`);
}

const config = isPlainObject(options) ? options : {};
const policy = normalizeEnum(
config.order_policy || config.orderPolicy || pkg.order_policy,
PROMPT_PACKAGE_ORDER_POLICY,
pkg.order_policy
);

if (policy === PROMPT_PACKAGE_ORDER_POLICY.WORKER_BRANCH) {
return getWorkerBranchRunOrder(pkg);
}

if (policy === PROMPT_PACKAGE_ORDER_POLICY.ROUND_ROBIN) {
return getRoundRobinRunOrder(pkg);
}

return getFixedSequenceRunOrder(pkg);
}

function createDispatchPacket(pkg, runOrderItem, options) {
const config = isPlainObject(options) ? options : {};
const sequenceNumber = normalizeInteger(runOrderItem.sequence, 1);
return {
object_type: DISPATCH_PACKET_TYPE,
schema_version: SCHEMA_VERSION,
dispatch_packet_id: createStableId(
'dispatch_packet',
`${pkg.package_id}|${runOrderItem.package_prompt_id}|${sequenceNumber}|${runOrderItem.worker_id}`
),
package_id: pkg.package_id,
package_title: pkg.title,
queue_item_id: `${pkg.package_id}:${String(sequenceNumber).padStart(4, '0')}:${runOrderItem.package_prompt_id}`,
package_prompt_id: runOrderItem.package_prompt_id,
title: runOrderItem.title,
prompt_text: runOrderItem.prompt_text,
sequence: sequenceNumber,
worker_id: runOrderItem.worker_id,
order_policy: pkg.order_policy,
created_at: toNonEmptyString(config.now, new Date().toISOString()),
metadata: Object.assign({}, normalizeMetadata(runOrderItem.metadata), {
branch_key: runOrderItem.branch_key
})
};
}

function summarizePromptPackage(pkg, options) {
const validation = validatePromptPackage(pkg);
if (!validation.ok) {
return {
ok: false,
package_id: isPlainObject(pkg) ? toNullableString(pkg.package_id) : null,
errors: validation.errors
};
}

const config = isPlainObject(options) ? options : {};
const runOrder = getPromptPackageRunOrder(pkg, config);
const dispatchPackets = runOrder.map((item) => createDispatchPacket(pkg, item, config));
const workerCounts = {};

runOrder.forEach((item) => {
workerCounts[item.worker_id] = (workerCounts[item.worker_id] || 0) + 1;
});

return {
ok: true,
package_id: pkg.package_id,
title: pkg.title,
status: pkg.status,
order_policy: normalizeEnum(
config.order_policy || config.orderPolicy || pkg.order_policy,
PROMPT_PACKAGE_ORDER_POLICY,
pkg.order_policy
),
prompt_count: pkg.prompts.length,
worker_count: pkg.worker_ids.length,
worker_counts: workerCounts,
run_order: runOrder,
dispatch_packets: dispatchPackets
};
}

module.exports = {
SCHEMA_VERSION,
PACKAGE_OBJECT_TYPE,
PACKAGE_PROMPT_OBJECT_TYPE,
RUN_ORDER_ITEM_OBJECT_TYPE,
DISPATCH_PACKET_TYPE,
PROMPT_PACKAGE_STATUS,
PROMPT_PACKAGE_ORDER_POLICY,
createPromptPackage,
validatePromptPackage,
getPromptPackageRunOrder,
summarizePromptPackage
};