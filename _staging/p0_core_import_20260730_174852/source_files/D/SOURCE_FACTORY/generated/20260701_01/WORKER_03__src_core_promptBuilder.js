const fs = require("fs");
const path = require("path");
const constitutionLoader = require("./constitutionLoader");
const taskInstructionManager = require("./taskInstructionManager");

const SOURCE_FACTORY_ROOT = process.env.SOURCE_FACTORY_ROOT || "D:\SOURCE FACTORY";
const OUTPUT_FORMAT_TEMPLATE_RELATIVE_PATH = "templates/WORKER_OUTPUT_FORMAT.md";

const CONSTITUTION_GROUP_NAMES = [
"SOURCE_FACTORY_FILE_COMBINATION_CONSTITUTION_v1.md",
"FILE_COMBINATION_RULE_SCHEMA_v1.json"
];

const COMPLIANCE_GROUP_NAMES = [
"SOURCE_FACTORY_COMMANDER_COMPLIANCE_RULES_v1.md",
"CURRENT_SOURCE_REVIEW_MUST_FOLLOW.md",
"NEW_COMMANDER_START_PROMPT_v1.txt"
];

function makeState(color, code, message, details) {
return {
color: color,
code: code,
message: message,
details: details || {}
};
}

function getSourceFactoryRoot() {
return SOURCE_FACTORY_ROOT;
}

function normalizeToForwardSlashes(value) {
return String(value || "").split(path.sep).join("/");
}

function isReadableFile(absoluteFilePath) {
try {
const stats = fs.statSync(absoluteFilePath);
return stats.isFile();
} catch (error) {
return false;
}
}

function readUtf8IfExists(absoluteFilePath) {
if (!isReadableFile(absoluteFilePath)) {
return null;
}

return fs.readFileSync(absoluteFilePath, "utf8");
}

function makePromptError(workerId, state, error) {
return {
ok: false,
workerId: workerId,
prompt: "",
state: state,
error: error
};
}

function formatLoadedFile(fileRecord) {
return [
"----- BEGIN LOADED LOCAL FILE -----",
"file_name: " + fileRecord.fileName,
"relative_path: " + fileRecord.relativePath,
"----- CONTENT -----",
fileRecord.content,
"----- END LOADED LOCAL FILE -----"
].join("\n");
}

function selectFilesByName(files, names) {
const sourceFiles = Array.isArray(files) ? files : [];
return sourceFiles.filter(function filterByName(fileRecord) {
return names.indexOf(fileRecord.fileName) !== -1;
});
}

function formatFileGroup(title, files, emptyMessage) {
const sourceFiles = Array.isArray(files) ? files : [];

if (sourceFiles.length === 0) {
return [
"# " + title,
"",
emptyMessage
].join("\n");
}

return [
"# " + title,
"",
sourceFiles.map(formatLoadedFile).join("\n\n")
].join("\n");
}

function getOutputFormatTemplatePath(root) {
const baseRoot = root || SOURCE_FACTORY_ROOT;
return path.join(baseRoot, OUTPUT_FORMAT_TEMPLATE_RELATIVE_PATH.split("/").join(path.sep));
}

function getFallbackOutputFormatTemplate() {
return [
"# Worker Output Format Fallback",
"",
"Every generated file must be emitted as a complete SOURCE_FILE_START source unit.",
"The required source-unit delimiter names are SOURCE_FILE_START, CONTENT_START, CONTENT_END, and SOURCE_FILE_END.",
"The final report delimiter names are WORKER_REPORT_START and WORKER_REPORT_END.",
"Do not use markdown code fences.",
"Every file content must be complete.",
"Do not claim local file saving, execution success, hash values, file sizes, or Assembly completion."
].join("\n");
}

function loadOutputFormatTemplate(options) {
const settings = options || {};
const root = settings.root || SOURCE_FACTORY_ROOT;
const absolutePath = getOutputFormatTemplatePath(root);
const content = readUtf8IfExists(absolutePath);

if (content === null) {
return {
ok: true,
usedFallback: true,
root: root,
relativePath: OUTPUT_FORMAT_TEMPLATE_RELATIVE_PATH,
absolutePath: absolutePath,
content: getFallbackOutputFormatTemplate(),
state: makeState(
"ORANGE",
"PROMPT_BUILDING",
"Output format template was not found, so the built-in fallback format was used.",
{
relativePath: OUTPUT_FORMAT_TEMPLATE_RELATIVE_PATH
}
)
};
}

return {
ok: true,
usedFallback: false,
root: root,
relativePath: OUTPUT_FORMAT_TEMPLATE_RELATIVE_PATH,
absolutePath: absolutePath,
content: content,
state: makeState(
"BLUE",
"PROMPT_BUILDING",
"Output format template was loaded for prompt construction.",
{
relativePath: OUTPUT_FORMAT_TEMPLATE_RELATIVE_PATH
}
)
};
}

function buildForbiddenActionsSection(workerId) {
return [
"# FORBIDDEN ACTIONS FOR THIS GPT RUN",
"",
"worker_id: " + workerId,
"",
"1. Do not claim that files were saved to the user's computer.",
"2. Do not claim that Assembly Record creation is complete.",
"3. Do not claim file hashes, file sizes, execution success, or browser automation success without evidence supplied by the user.",
"4. Do not request, collect, store, or print passwords.",
"5. Do not force automatic login, bypass captcha, or bypass account security.",
"6. Do not access, modify, scan, or write any path outside the official Source Factory root.",
"7. Do not access or modify D:\BABY.",
"8. Do not use absolute paths in SOURCE_FILE_START path values.",
"9. Do not write SOURCE_FILE_START paths with Windows reserved filename characters.",
"10. Do not replace required content with shorthand wording.",
"11. Do not output files that are not assigned in the current task instruction.",
"12. Do not use ES module syntax; JavaScript output must use CommonJS."
].join("\n");
}

function buildCompletionSignalSection(workerId) {
return [
"# COMPLETION SIGNAL FOR THIS GPT RUN",
"",
"worker_id: " + workerId,
"",
"When all assigned source units have been written, append exactly one WORKER_REPORT section.",
"The Worker report may state that source output was produced, but it must not state that file materialization, file combination, or Assembly completion occurred.",
"The correct status of Worker output is SOURCE_OUTPUT_ONLY until a separate materialization and Assembly process records evidence."
].join("\n");
}

function buildPromptHeader(workerId) {
return [
"# SOURCE FACTORY START PROMPT",
"",
"target_worker_id: " + workerId,
"official_root_setting: process.env.SOURCE_FACTORY_ROOT || "D:\\SOURCE FACTORY"",
"session_policy: all seven windows use the shared GPT session partition persist:source-factory-gpt",
"",
"GPT cannot read local user files directly.",
"This prompt was assembled by the local Source Factory Browser from local constitution files and the local task instruction before being sent to GPT.",
"Follow the content below as the only task context for this run."
].join("\n");
}

function buildTaskInstructionSection(taskResult) {
return [
"# CURRENT WINDOW TASK INSTRUCTION",
"",
"worker_id: " + taskResult.workerId,
"relative_path: " + normalizeToForwardSlashes(taskResult.relativePath),
"",
taskResult.content
].join("\n");
}

function buildMissingCandidateNotice(loadResult) {
const missingFiles = Array.isArray(loadResult.missingFiles) ? loadResult.missingFiles : [];
const readErrors = Array.isArray(loadResult.readErrors) ? loadResult.readErrors : [];

if (missingFiles.length === 0 && readErrors.length === 0) {
return "";
}

return [
"# LOCAL CONSTITUTION LOAD NOTICE",
"",
"Some candidate files were not loaded. Continue only with the loaded local files unless the current task requires a missing file.",
"missing_candidates: " + (missingFiles.length ? missingFiles.join(", ") : "none"),
"read_error_count: " + readErrors.length
].join("\n");
}

function buildPromptForWorker(workerId, options) {
const settings = options || {};
const root = settings.root || SOURCE_FACTORY_ROOT;
const normalizedWorkerId = taskInstructionManager.normalizeWorkerId(workerId);

if (!taskInstructionManager.isValidWorkerId(normalizedWorkerId)) {
return makePromptError(
workerId,
makeState(
"RED",
"TASK_MISSING",
"Cannot build prompt because the worker id is invalid.",
{
workerId: workerId,
validWorkerIds: taskInstructionManager.VALID_WORKER_IDS.slice()
}
),
{
name: "INVALID_WORKER_ID",
message: "Invalid worker id for prompt build: " + workerId
}
);
}

const constitutionResult = constitutionLoader.loadConstitutionFiles({ root: root });
if (!constitutionResult.ok) {
return makePromptError(normalizedWorkerId, constitutionResult.state, constitutionResult.error);
}

const taskResult = taskInstructionManager.loadTaskInstruction(normalizedWorkerId, { root: root });
if (!taskResult.ok) {
return makePromptError(normalizedWorkerId, taskResult.state, taskResult.error);
}

const outputFormatResult = loadOutputFormatTemplate({ root: root });
const constitutionFiles = selectFilesByName(constitutionResult.files, CONSTITUTION_GROUP_NAMES);
const complianceFiles = selectFilesByName(constitutionResult.files, COMPLIANCE_GROUP_NAMES);
const missingNotice = buildMissingCandidateNotice(constitutionResult);

const promptParts = [
buildPromptHeader(normalizedWorkerId),
formatFileGroup(
"SOURCE FACTORY CONSTITUTION",
constitutionFiles,
"No dedicated constitution file was loaded. A RED state should normally prevent START when no constitution files exist."
),
formatFileGroup(
"COMMANDER AND WORKER COMPLIANCE RULES",
complianceFiles,
"No dedicated compliance file was loaded. Use the task instruction and output format strictly."
),
missingNotice,
buildTaskInstructionSection(taskResult),
"# OUTPUT FORMAT RULES",
"",
outputFormatResult.content,
buildForbiddenActionsSection(normalizedWorkerId),
buildCompletionSignalSection(normalizedWorkerId)
].filter(function keepNonEmpty(part) {
return part && String(part).trim() !== "";
});

return {
ok: true,
workerId: normalizedWorkerId,
root: root,
prompt: promptParts.join("\n\n"),
usedOutputFormatFallback: outputFormatResult.usedFallback,
loadedConstitutionFiles: constitutionResult.files.map(function mapFile(fileRecord) {
return fileRecord.relativePath;
}),
taskInstructionPath: taskResult.relativePath,
state: makeState(
outputFormatResult.usedFallback ? "ORANGE" : "BLUE",
"GPT_READY",
"START prompt was assembled and is ready to send or paste into GPT.",
{
workerId: normalizedWorkerId,
constitutionFileCount: constitutionResult.files.length,
taskInstructionPath: taskResult.relativePath,
outputFormatTemplatePath: OUTPUT_FORMAT_TEMPLATE_RELATIVE_PATH,
usedOutputFormatFallback: outputFormatResult.usedFallback
}
)
};
}

function buildPrompt(workerId, options) {
return buildPromptForWorker(workerId, options || {});
}

module.exports = {
SOURCE_FACTORY_ROOT: SOURCE_FACTORY_ROOT,
OUTPUT_FORMAT_TEMPLATE_RELATIVE_PATH: OUTPUT_FORMAT_TEMPLATE_RELATIVE_PATH,
getSourceFactoryRoot: getSourceFactoryRoot,
getOutputFormatTemplatePath: getOutputFormatTemplatePath,
loadOutputFormatTemplate: loadOutputFormatTemplate,
buildForbiddenActionsSection: buildForbiddenActionsSection,
buildCompletionSignalSection: buildCompletionSignalSection,
buildPromptForWorker: buildPromptForWorker,
buildPrompt: buildPrompt
};