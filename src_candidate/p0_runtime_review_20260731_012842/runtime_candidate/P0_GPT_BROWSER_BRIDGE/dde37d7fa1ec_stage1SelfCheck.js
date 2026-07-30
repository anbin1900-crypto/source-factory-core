const fs = require("fs");
const path = require("path");
const startupInitializer = require("./startupInitializer");
const diagnostics = require("./diagnostics");

const STATUS_COLORS = diagnostics.STATUS_COLORS;

const README_PATH = "README_STAGE1_SOURCE_FACTORY_BROWSER.md";
const CHECKLIST_PATH = "STAGE1_INTEGRATION_CHECKLIST.md";

function createCriterion(id, label, color, outcome, details) {
return {
id: id,
label: label,
color: color,
outcome: outcome,
details: details || {}
};
}

function readTextFileIfExists(root, relativePath) {
const targetPath = path.join(root, relativePath);

try {
if (!fs.statSync(targetPath).isFile()) {
return null;
}
return fs.readFileSync(targetPath, "utf8");
} catch (error) {
return null;
}
}

function containsAll(text, requiredParts) {
if (typeof text !== "string") {
return false;
}

return requiredParts.every(function checkPart(part) {
return text.indexOf(part) !== -1;
});
}

function buildRestrictedPolicyText() {
return ["D:", "BABY"].join("\\");
}

function checkSupportDocumentPresence(root, relativePath, id, label) {
const targetPath = path.join(root, relativePath);

try {
if (fs.statSync(targetPath).isFile()) {
return createCriterion(
id,
label,
STATUS_COLORS.BLUE,
"PASS",
{
relativePath: relativePath
}
);
}
} catch (error) {
return createCriterion(
id,
label,
STATUS_COLORS.RED,
"FAIL",
{
relativePath: relativePath,
reason: "Support document is missing."
}
);
}

return createCriterion(
id,
label,
STATUS_COLORS.RED,
"FAIL",
{
relativePath: relativePath,
reason: "Support document is not a file."
}
);
}

function buildPolicyCriteria(root) {
const readmeText = readTextFileIfExists(root, README_PATH);
const checklistText = readTextFileIfExists(root, CHECKLIST_PATH);
const combinedText = String(readmeText || "") + "\n" + String(checklistText || "");
const restrictedPolicyText = buildRestrictedPolicyText();
const criteria = [];

criteria.push(checkSupportDocumentPresence(
root,
README_PATH,
"README_PRESENT",
"Stage 1 README must exist."
));

criteria.push(checkSupportDocumentPresence(
root,
CHECKLIST_PATH,
"INTEGRATION_CHECKLIST_PRESENT",
"Stage 1 integration checklist must exist."
));

if (containsAll(readmeText, ["사용자가 직접 로그인"])) {
criteria.push(createCriterion(
"README_DIRECT_LOGIN_POLICY",
"README must state that the user logs in directly.",
STATUS_COLORS.BLUE,
"PASS"
));
} else {
criteria.push(createCriterion(
"README_DIRECT_LOGIN_POLICY",
"README must state that the user logs in directly.",
STATUS_COLORS.RED,
"FAIL",
{
reason: "Required direct-login policy text was not found."
}
));
}

if (combinedText.indexOf(restrictedPolicyText) !== -1 && combinedText.indexOf("수정 금지") !== -1) {
criteria.push(createCriterion(
"NO_RESTRICTED_ROOT_MODIFICATION_POLICY",
"Documents must state that the restricted root is not modified in this stage.",
STATUS_COLORS.BLUE,
"PASS"
));
} else {
criteria.push(createCriterion(
"NO_RESTRICTED_ROOT_MODIFICATION_POLICY",
"Documents must state that the restricted root is not modified in this stage.",
STATUS_COLORS.RED,
"FAIL",
{
reason: "Required restricted-root modification ban was not found in support documents."
}
));
}

if (containsAll(combinedText, ["CREATE FILES", "ASSEMBLY", "후속 단계"])) {
criteria.push(createCriterion(
"CREATE_FILES_AND_ASSEMBLY_FUTURE_STAGE_POLICY",
"Documents must state that CREATE FILES and ASSEMBLY are future stages.",
STATUS_COLORS.BLUE,
"PASS"
));
} else {
criteria.push(createCriterion(
"CREATE_FILES_AND_ASSEMBLY_FUTURE_STAGE_POLICY",
"Documents must state that CREATE FILES and ASSEMBLY are future stages.",
STATUS_COLORS.RED,
"FAIL",
{
reason: "Required future-stage policy text was not found."
}
));
}

if (combinedText.indexOf("20명 Worker") !== -1 && combinedText.indexOf("후속 단계") !== -1) {
criteria.push(createCriterion(
"TWENTY_WORKER_EXTENSION_FUTURE_STAGE_POLICY",
"Documents must state that 20-worker expansion is a future stage.",
STATUS_COLORS.BLUE,
"PASS"
));
} else {
criteria.push(createCriterion(
"TWENTY_WORKER_EXTENSION_FUTURE_STAGE_POLICY",
"Documents must state that 20-worker expansion is a future stage.",
STATUS_COLORS.RED,
"FAIL",
{
reason: "Required 20-worker future-stage policy text was not found."
}
));
}

if (combinedText.indexOf("Assembly Record") !== -1 && combinedText.indexOf("공식 완료") !== -1) {
criteria.push(createCriterion(
"NO_OVERSTATED_COMPLETION_POLICY",
"Documents must not present Stage 1 source output as official assembly completion.",
STATUS_COLORS.BLUE,
"PASS"
));
} else {
criteria.push(createCriterion(
"NO_OVERSTATED_COMPLETION_POLICY",
"Documents must explain that official completion requires an Assembly Record.",
STATUS_COLORS.RED,
"FAIL",
{
reason: "Assembly Record based official completion statement was not found."
}
));
}

return criteria;
}

function buildManualVerificationCriteria() {
return [
createCriterion(
"MANUAL_GPT_LOGIN_VERIFICATION_REQUIRED",
"GPT login cannot be verified by this script. User must log in directly in the GPT window.",
STATUS_COLORS.ORANGE,
"WARN",
{
manualCheck: true
}
),
createCriterion(
"MANUAL_SHARED_SESSION_VERIFICATION_REQUIRED",
"Shared GPT session across seven windows must be verified in the Electron UI.",
STATUS_COLORS.ORANGE,
"WARN",
{
manualCheck: true,
requiredSessionPartition: startupInitializer.SESSION_PARTITION
}
),
createCriterion(
"MANUAL_BUTTON_FLOW_VERIFICATION_REQUIRED",
"START, STOP, and SAVE FULL OUTPUT button behavior must be verified in the UI.",
STATUS_COLORS.ORANGE,
"WARN",
{
manualCheck: true
}
)
];
}

function summarizeCriteria(criteria) {
const summary = {
blueCount: 0,
orangeCount: 0,
redCount: 0,
passCount: 0,
warnCount: 0,
failCount: 0
};

criteria.forEach(function countCriterion(criterion) {
if (criterion.color === STATUS_COLORS.BLUE) {
summary.blueCount += 1;
} else if (criterion.color === STATUS_COLORS.ORANGE) {
summary.orangeCount += 1;
} else if (criterion.color === STATUS_COLORS.RED) {
summary.redCount += 1;
}

if (criterion.outcome === "PASS") {
  summary.passCount += 1;
} else if (criterion.outcome === "WARN") {
  summary.warnCount += 1;
} else if (criterion.outcome === "FAIL") {
  summary.failCount += 1;
}

});

return summary;
}

function runStage1SelfCheck(options) {
const selectedOptions = options || {};
const root = startupInitializer.normalizeRoot(selectedOptions.root || startupInitializer.SOURCE_FACTORY_ROOT);

const initializationResult = startupInitializer.initializeStartupFolders({ root: root });
const diagnosticResult = diagnostics.runDiagnostics({ root: root });
const criteria = [];

if (initializationResult.ok) {
criteria.push(createCriterion(
"STARTUP_INITIALIZER_RUN",
"Startup initializer must create or confirm required browser folders.",
STATUS_COLORS.BLUE,
"PASS",
{
createdCount: initializationResult.created.length,
existingCount: initializationResult.existing.length
}
));
} else {
criteria.push(createCriterion(
"STARTUP_INITIALIZER_RUN",
"Startup initializer must create or confirm required browser folders.",
STATUS_COLORS.RED,
"FAIL",
{
errors: initializationResult.errors
}
));
}

if (diagnosticResult.summary.redCount === 0) {
criteria.push(createCriterion(
"DIAGNOSTICS_REQUIRED_CHECKS",
"Diagnostics must have no RED checks.",
diagnosticResult.summary.orangeCount > 0 ? STATUS_COLORS.ORANGE : STATUS_COLORS.BLUE,
diagnosticResult.summary.orangeCount > 0 ? "WARN" : "PASS",
{
diagnosticColor: diagnosticResult.color,
diagnosticSummary: diagnosticResult.summary
}
));
} else {
criteria.push(createCriterion(
"DIAGNOSTICS_REQUIRED_CHECKS",
"Diagnostics must have no RED checks.",
STATUS_COLORS.RED,
"FAIL",
{
diagnosticColor: diagnosticResult.color,
diagnosticSummary: diagnosticResult.summary
}
));
}

buildPolicyCriteria(root).forEach(function addPolicyCriterion(criterion) {
criteria.push(criterion);
});

buildManualVerificationCriteria().forEach(function addManualCriterion(criterion) {
criteria.push(criterion);
});

const summary = summarizeCriteria(criteria);
const overallColor = summary.redCount > 0
? STATUS_COLORS.RED
: (summary.orangeCount > 0 ? STATUS_COLORS.ORANGE : STATUS_COLORS.BLUE);

return {
ok: summary.redCount === 0,
root: root,
generatedAt: new Date().toISOString(),
color: overallColor,
initialization: initializationResult,
diagnostics: diagnosticResult,
criteria: criteria,
summary: summary
};
}

function printStage1SelfCheck(result) {
console.log("SOURCE_FACTORY_STAGE1_SELF_CHECK");
console.log("root=" + result.root);
console.log("generated_at=" + result.generatedAt);
console.log("overall_color=" + result.color);
console.log("ok=" + String(result.ok));
console.log("created_folder_count=" + result.initialization.created.length);
console.log("existing_folder_count=" + result.initialization.existing.length);
console.log("diagnostic_color=" + result.diagnostics.color);
console.log("criteria_blue_count=" + result.summary.blueCount);
console.log("criteria_orange_count=" + result.summary.orangeCount);
console.log("criteria_red_count=" + result.summary.redCount);

console.log("");
console.log("DIAGNOSTIC_CHECKS");
result.diagnostics.checks.forEach(function printDiagnosticCheck(check) {
console.log("[" + check.color + "] " + check.outcome + " " + check.id + " - " + check.label);
});

console.log("");
console.log("STAGE1_CRITERIA");
result.criteria.forEach(function printCriterion(criterion) {
console.log("[" + criterion.color + "] " + criterion.outcome + " " + criterion.id + " - " + criterion.label);

if (criterion.details && criterion.details.reason) {
  console.log("  reason=" + criterion.details.reason);
}

if (criterion.details && criterion.details.manualCheck) {
  console.log("  manual_check_required=true");
}

});

console.log("");
if (result.ok) {
if (result.color === STATUS_COLORS.ORANGE) {
console.log("stage1_self_check_result=DONE_WITH_MANUAL_WARNINGS");
} else {
console.log("stage1_self_check_result=DONE");
}
} else {
console.log("stage1_self_check_result=FAILED");
}

console.log("official_assembly_status=NOT_CLAIMED_BY_STAGE1_SELF_CHECK");
}

if (require.main === module) {
const result = runStage1SelfCheck();
printStage1SelfCheck(result);
process.exit(result.ok ? 0 : 1);
}

module.exports = {
README_PATH: README_PATH,
CHECKLIST_PATH: CHECKLIST_PATH,
createCriterion: createCriterion,
readTextFileIfExists: readTextFileIfExists,
containsAll: containsAll,
buildRestrictedPolicyText: buildRestrictedPolicyText,
buildPolicyCriteria: buildPolicyCriteria,
buildManualVerificationCriteria: buildManualVerificationCriteria,
summarizeCriteria: summarizeCriteria,
runStage1SelfCheck: runStage1SelfCheck,
printStage1SelfCheck: printStage1SelfCheck
};