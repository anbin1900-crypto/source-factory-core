'use strict';

const SCHEMA_VERSION = 'stage4.prompt_library_model.v1';
const LIBRARY_OBJECT_TYPE = 'stage4_prompt_library';
const ITEM_OBJECT_TYPE = 'stage4_prompt_library_item';

const PROMPT_TYPES = Object.freeze({
SYSTEM: 'system',
DEVELOPER: 'developer',
USER: 'user',
ASSISTANT: 'assistant',
TASK: 'task',
TEMPLATE: 'template',
CHECKLIST: 'checklist',
WORKER: 'worker'
});

const PROMPT_SOURCE_TYPES = Object.freeze({
MANUAL: 'manual',
GENERATED: 'generated',
IMPORTED: 'imported',
WORKER_OUTPUT: 'worker_output',
COMMANDER_OUTPUT: 'commander_output',
PACKAGE: 'package',
UNKNOWN: 'unknown'
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

function stableHash(seed) {
const text = toNonEmptyString(seed, 'prompt');
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

function valuesOf(record) {
return Object.keys(record).map((key) => record[key]);
}

function normalizeEnum(value, enumRecord, fallback) {
const text = toNonEmptyString(value, fallback);
const allowed = valuesOf(enumRecord);
return allowed.includes(text) ? text : fallback;
}

function normalizeVersion(value) {
const text = toNonEmptyString(value, '1.0.0');
const match = text.match(/^(\d+)(?:.(\d+))?(?:.(\d+))?$/);
if (!match) {
return '1.0.0';
}

const major = Number(match[1] || 1);
const minor = Number(match[2] || 0);
const patch = Number(match[3] || 0);
return `${major}.${minor}.${patch}`;
}

function bumpPatchVersion(version) {
const normalized = normalizeVersion(version);
const parts = normalized.split('.').map((part) => Number(part));
return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}

function normalizePromptText(value) {
const text = toNonEmptyString(value, '');
return text;
}

function normalizeTimestamps(input, now) {
const createdAt = toNonEmptyString(input.created_at || input.createdAt, now);
const updatedAt = toNonEmptyString(input.updated_at || input.updatedAt, createdAt);
return {
created_at: createdAt,
updated_at: updatedAt
};
}

function createPromptLibraryItem(input, options) {
const source = isPlainObject(input) ? input : {};
const config = isPlainObject(options) ? options : {};
const now = toNonEmptyString(config.now || source.now, new Date().toISOString());
const timestamps = normalizeTimestamps(source, now);
const promptText = normalizePromptText(source.prompt_text || source.promptText || source.text || source.content);
const title = toNonEmptyString(source.title || source.name, 'Untitled Prompt');
const type = normalizeEnum(source.prompt_type || source.promptType || source.type, PROMPT_TYPES, PROMPT_TYPES.TEMPLATE);
const sourceType = normalizeEnum(
source.source_type || source.sourceType,
PROMPT_SOURCE_TYPES,
PROMPT_SOURCE_TYPES.UNKNOWN
);
const seed = [
title,
promptText,
type,
sourceType,
source.source_id || source.sourceId || '',
timestamps.created_at
].join('|');

const promptId = toNonEmptyString(source.prompt_id || source.promptId || source.id, createStableId('prompt', seed));

return {
object_type: ITEM_OBJECT_TYPE,
schema_version: SCHEMA_VERSION,
prompt_id: promptId,
title,
prompt_type: type,
source_type: sourceType,
source_id: toNullableString(source.source_id || source.sourceId),
prompt_text: promptText,
description: toNonEmptyString(source.description, ''),
tags: normalizeStringArray(source.tags),
variables: normalizeStringArray(source.variables),
version: normalizeVersion(source.version),
parent_prompt_id: toNullableString(source.parent_prompt_id || source.parentPromptId),
created_at: timestamps.created_at,
updated_at: timestamps.updated_at,
archived: Boolean(source.archived),
metadata: normalizeMetadata(source.metadata)
};
}

function validatePromptLibraryItem(item) {
const errors = [];

if (!isPlainObject(item)) {
return {
ok: false,
errors: ['item must be a plain object']
};
}

if (item.object_type !== ITEM_OBJECT_TYPE) {
errors.push(`object_type must be ${ITEM_OBJECT_TYPE}`);
}

if (item.schema_version !== SCHEMA_VERSION) {
errors.push(`schema_version must be ${SCHEMA_VERSION}`);
}

if (!toNullableString(item.prompt_id)) {
errors.push('prompt_id is required');
}

if (!toNullableString(item.title)) {
errors.push('title is required');
}

if (!valuesOf(PROMPT_TYPES).includes(item.prompt_type)) {
errors.push(`prompt_type must be one of ${valuesOf(PROMPT_TYPES).join(', ')}`);
}

if (!valuesOf(PROMPT_SOURCE_TYPES).includes(item.source_type)) {
errors.push(`source_type must be one of ${valuesOf(PROMPT_SOURCE_TYPES).join(', ')}`);
}

if (!toNullableString(item.prompt_text)) {
errors.push('prompt_text is required');
}

if (!Array.isArray(item.tags)) {
errors.push('tags must be an array');
}

if (!Array.isArray(item.variables)) {
errors.push('variables must be an array');
}

if (normalizeVersion(item.version) !== item.version) {
errors.push('version must be a semantic version string like 1.0.0');
}

if (!isPlainObject(item.metadata)) {
errors.push('metadata must be a plain object');
}

return {
ok: errors.length === 0,
errors
};
}

function normalizeLibraryInput(library) {
if (Array.isArray(library)) {
return library;
}

if (isPlainObject(library) && Array.isArray(library.items)) {
return library.items;
}

if (isPlainObject(library) && Array.isArray(library.prompts)) {
return library.prompts;
}

return [];
}

function includesInsensitive(source, needle) {
if (!needle) {
return true;
}
return String(source || '').toLowerCase().includes(String(needle).toLowerCase());
}

function itemMatchesQuery(item, query) {
if (!query) {
return true;
}

const haystack = [
item.prompt_id,
item.title,
item.description,
item.prompt_type,
item.source_type,
item.source_id,
item.prompt_text,
Array.isArray(item.tags) ? item.tags.join(' ') : '',
Array.isArray(item.variables) ? item.variables.join(' ') : ''
].join(' ');

return includesInsensitive(haystack, query);
}

function itemMatchesTags(item, tags) {
const requiredTags = normalizeStringArray(tags);
if (requiredTags.length === 0) {
return true;
}

const currentTags = new Set(normalizeStringArray(item.tags).map((tag) => tag.toLowerCase()));
return requiredTags.every((tag) => currentTags.has(tag.toLowerCase()));
}

function filterPromptLibrary(library, criteria) {
const options = isPlainObject(criteria) ? criteria : {};
const items = normalizeLibraryInput(library);
const includeArchived = Boolean(options.include_archived || options.includeArchived);
const promptType = toNullableString(options.prompt_type || options.promptType || options.type);
const sourceType = toNullableString(options.source_type || options.sourceType);
const sourceId = toNullableString(options.source_id || options.sourceId);
const query = toNullableString(options.query || options.search || options.text);
const tags = options.tags;

return items.filter((item) => {
if (!includeArchived && item.archived) {
return false;
}

if (promptType && item.prompt_type !== promptType) {
  return false;
}

if (sourceType && item.source_type !== sourceType) {
  return false;
}

if (sourceId && item.source_id !== sourceId) {
  return false;
}

if (!itemMatchesQuery(item, query)) {
  return false;
}

return itemMatchesTags(item, tags);

});
}

function clonePromptWithVersion(item, changes) {
const validation = validatePromptLibraryItem(item);
if (!validation.ok) {
throw new Error(`Cannot clone invalid prompt library item: ${validation.errors.join('; ')}`);
}

const overrides = isPlainObject(changes) ? changes : {};
const now = toNonEmptyString(overrides.now || overrides.updated_at || overrides.updatedAt, new Date().toISOString());
const nextVersion = normalizeVersion(overrides.version || bumpPatchVersion(item.version));
const nextText = Object.prototype.hasOwnProperty.call(overrides, 'prompt_text')
? overrides.prompt_text
: Object.prototype.hasOwnProperty.call(overrides, 'promptText')
? overrides.promptText
: item.prompt_text;
const nextTitle = Object.prototype.hasOwnProperty.call(overrides, 'title') ? overrides.title : item.title;
const seed = [
item.prompt_id,
nextVersion,
nextTitle,
nextText,
now
].join('|');

return createPromptLibraryItem(Object.assign({}, item, overrides, {
prompt_id: toNonEmptyString(overrides.prompt_id || overrides.promptId, createStableId('prompt', seed)),
parent_prompt_id: item.prompt_id,
version: nextVersion,
title: nextTitle,
prompt_text: nextText,
created_at: now,
updated_at: now,
archived: Boolean(overrides.archived),
metadata: Object.assign({}, item.metadata, normalizeMetadata(overrides.metadata), {
cloned_from_prompt_id: item.prompt_id,
cloned_from_version: item.version
})
}));
}

function serializePromptLibrary(library, options) {
const config = isPlainObject(options) ? options : {};
const now = toNonEmptyString(config.now, new Date().toISOString());
const rawItems = normalizeLibraryInput(library);
const items = rawItems.map((item) => createPromptLibraryItem(item, { now }));
const source = isPlainObject(library) && !Array.isArray(library) ? library : {};
const libraryId = toNonEmptyString(
source.library_id || source.libraryId || source.id,
createStableId('prompt_library', `${source.title || source.name || 'library'}|${items.length}`)
);

const payload = {
object_type: LIBRARY_OBJECT_TYPE,
schema_version: SCHEMA_VERSION,
library_id: libraryId,
title: toNonEmptyString(source.title || source.name, 'Prompt Library'),
created_at: toNonEmptyString(source.created_at || source.createdAt, now),
updated_at: toNonEmptyString(source.updated_at || source.updatedAt, now),
items
};

if (config.asObject) {
return payload;
}

return JSON.stringify(payload, null, 2);
}

module.exports = {
SCHEMA_VERSION,
LIBRARY_OBJECT_TYPE,
ITEM_OBJECT_TYPE,
PROMPT_TYPES,
PROMPT_SOURCE_TYPES,
createPromptLibraryItem,
validatePromptLibraryItem,
filterPromptLibrary,
clonePromptWithVersion,
serializePromptLibrary
};