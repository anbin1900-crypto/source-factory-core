"use strict";

const fs = require("fs");
const path = require("path");
const startupInitializer = require("./startupInitializer");

const SOURCE_FACTORY_ROOT = startupInitializer.SOURCE_FACTORY_ROOT;
const WORKER_IDS = startupInitializer.WORKER_IDS;

const STATUS_COLORS = Object.freeze({
  BLUE: "BLUE",
  ORANGE: "ORANGE",
  RED: "RED"
});

const REQUIRED_FILES = Object.freeze([
  {
    id: "PACKAGE_JSON_EXISTS",
    relativePath: "package.json",
    description: "package.json must exist at the project root."
  },
  {
    id: "MAIN_ENTRY_EXISTS",
    relativePath: "src/main/main.js",
    description: "Electron main entry must exist at src/main/main.js."
  },
  {
    id: "RENDERER_ENTRY_EXISTS",
    relativePath: "src/renderer/index.html",
    description: "Renderer entry must exist at src/renderer/index.html."
  }
]);

const CONSTITUTION_CANDIDATE_FOLDERS = Object.freeze(["CONSTITUTION", "_CONSTITUTION"]);

const CONSTITUTION_ROOT_FILE_CANDIDATES = Object.freeze([
  "SOURCE_FACTORY_FILE_COMBINATION_CONSTITUTION_v1.md",
  "SOURCE_FACTORY_COMMANDER_COMPLIANCE_RULES_v1.md",
  "CURRENT_SOURCE_REVIEW_MUST_FOLLOW.md",
  "FILE_COMBINATION_RULE_SCHEMA_v1.json"
]);

const TEXT_EXTENSIONS = Object.freeze([
  ".bat",
  ".cmd",
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".txt"
]);

const SKIP_DIRECTORY_NAMES = Object.freeze([
  ".git",
  "node_modules",
  "browsers",
  "raw_outputs",
  "extracted_units",
  "materialized_files",
  "states",
  "logs",
  "reports",
  "_PATCH_BACKUP_20260701_025232"
]);

function makeCheck(id, label, color, outcome, details) {
  return {
    id: id,
    label: label,
    color: color,
    outcome: outcome,
    details: details || {},
    generatedAt: new Date().toISOString()
  };
}

function fileExists(root, relativePath) {
  try {
    return fs.statSync(path.join(root, relativePath)).isFile();
  } catch (error) {
    return false;
  }
}

function directoryExists(root, relativePath) {
  try {
    return fs.statSync(path.join(root, relativePath)).isDirectory();
  } catch (error) {
    return false;
  }
}

function toDisplayPath(root, targetPath) {
  const rel = path.relative(root, targetPath);
  return rel ? rel.split(path.sep).join("/") : ".";
}

function checkRequiredFiles(root) {
  return REQUIRED_FILES.map(function (rule) {
    if (fileExists(root, rule.relativePath)) {
      return makeCheck(rule.id, rule.description, STATUS_COLORS.BLUE, "PASS", {
        relativePath: rule.relativePath
      });
    }
    return makeCheck(rule.id, rule.description, STATUS_COLORS.RED, "FAIL", {
      relativePath: rule.relativePath,
      reason: "Required file is missing."
    });
  });
}

function checkBrowserFolders(root) {
  const checks = [];

  checks.push(directoryExists(root, "browsers")
    ? makeCheck("BROWSERS_ROOT_EXISTS", "browsers folder must exist.", STATUS_COLORS.BLUE, "PASS", { relativePath: "browsers" })
    : makeCheck("BROWSERS_ROOT_EXISTS", "browsers folder must exist.", STATUS_COLORS.RED, "FAIL", { relativePath: "browsers", reason: "Required folder is missing." })
  );

  WORKER_IDS.forEach(function (workerId) {
    const rel = "browsers/" + workerId;
    checks.push(directoryExists(root, rel)
      ? makeCheck("BROWSER_FOLDER_EXISTS_" + workerId, workerId + " browser folder must exist.", STATUS_COLORS.BLUE, "PASS", { workerId: workerId, relativePath: rel })
      : makeCheck("BROWSER_FOLDER_EXISTS_" + workerId, workerId + " browser folder must exist.", STATUS_COLORS.RED, "FAIL", { workerId: workerId, relativePath: rel, reason: "Required worker browser folder is missing." })
    );
  });

  return checks;
}

function findConstitutionLocation(root) {
  for (let i = 0; i < CONSTITUTION_CANDIDATE_FOLDERS.length; i += 1) {
    const folderName = CONSTITUTION_CANDIDATE_FOLDERS[i];
    if (directoryExists(root, folderName)) {
      return {
        mode: "FOLDER",
        relativePath: folderName,
        foundFiles: []
      };
    }
  }

  const foundRootFiles = CONSTITUTION_ROOT_FILE_CANDIDATES.filter(function (fileName) {
    return fileExists(root, fileName);
  });

  if (foundRootFiles.length > 0) {
    return {
      mode: "ROOT_FALLBACK",
      relativePath: ".",
      foundFiles: foundRootFiles
    };
  }

  return null;
}

function checkConstitutionLocation(root) {
  const location = findConstitutionLocation(root);

  if (!location) {
    return makeCheck("CONSTITUTION_LOCATION", "CONSTITUTION or _CONSTITUTION folder should exist; root fallback is also recognized.", STATUS_COLORS.RED, "FAIL", {
      reason: "No constitution folder or root fallback constitution file was found."
    });
  }

  if (location.mode === "FOLDER") {
    return makeCheck("CONSTITUTION_LOCATION", "CONSTITUTION or _CONSTITUTION folder exists.", STATUS_COLORS.BLUE, "PASS", location);
  }

  return makeCheck("CONSTITUTION_LOCATION", "Root fallback constitution file was found, but a constitution folder is recommended.", STATUS_COLORS.ORANGE, "WARN", location);
}

function isTextFileByName(filePath) {
  const base = path.basename(filePath).toLowerCase();
  const ext = path.extname(filePath).toLowerCase();
  return base === "package.json" || TEXT_EXTENSIONS.indexOf(ext) !== -1;
}

function shouldSkipDirectory(dirName) {
  if (SKIP_DIRECTORY_NAMES.indexOf(dirName) !== -1) {
    return true;
  }
  if (dirName.indexOf("_PATCH_BACKUP_") === 0 || dirName.indexOf("_AUTO_PATCH_BACKUP_") === 0 || dirName.indexOf("_HARD_PATCH_BACKUP_") === 0) {
    return true;
  }
  return false;
}

function collectScanFiles(root) {
  const output = [];
  const scanTargets = ["package.json", "src", "run"];

  function walk(targetPath) {
    if (!fs.existsSync(targetPath)) {
      return;
    }

    const stat = fs.statSync(targetPath);

    if (stat.isFile()) {
      if (isTextFileByName(targetPath)) {
        output.push(targetPath);
      }
      return;
    }

    if (!stat.isDirectory()) {
      return;
    }

    fs.readdirSync(targetPath, { withFileTypes: true }).forEach(function (entry) {
      if (entry.isDirectory() && shouldSkipDirectory(entry.name)) {
        return;
      }
      walk(path.join(targetPath, entry.name));
    });
  }

  scanTargets.forEach(function (rel) {
    walk(path.join(root, rel));
  });

  return output;
}

function buildRestrictedRootPatterns() {
  return [
    "D:\\\\BABY",
    "D:/BABY"
  ];
}

function checkRestrictedRootReferences(root) {
  const patterns = buildRestrictedRootPatterns();
  const scanFiles = collectScanFiles(root);
  const matches = [];

  scanFiles.forEach(function (filePath) {
    let content = "";
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch (error) {
      return;
    }

    const lower = content.toLowerCase();

    patterns.forEach(function (pattern) {
      let index = lower.indexOf(pattern.toLowerCase());
      while (index !== -1) {
        matches.push({
          relativePath: toDisplayPath(root, filePath),
          marker: "RESTRICTED_ROOT_REFERENCE",
          offset: index
        });
        index = lower.indexOf(pattern.toLowerCase(), index + pattern.length);
      }
    });
  });

  if (matches.length > 0) {
    return makeCheck("RESTRICTED_ROOT_REFERENCE_SCAN", "Restricted root references found for review.", STATUS_COLORS.ORANGE, "WARN", {
      scannedFileCount: scanFiles.length,
      matchCount: matches.length,
      matches: matches
    });
  }

  return makeCheck("RESTRICTED_ROOT_REFERENCE_SCAN", "No restricted root access reference was found.", STATUS_COLORS.BLUE, "PASS", {
    scannedFileCount: scanFiles.length,
    matchCount: 0
  });
}

function summarizeChecks(checks) {
  const summary = {
    blueCount: 0,
    orangeCount: 0,
    redCount: 0,
    passCount: 0,
    warnCount: 0,
    failCount: 0
  };

  checks.forEach(function (check) {
    if (check.color === STATUS_COLORS.BLUE) {
      summary.blueCount += 1;
    } else if (check.color === STATUS_COLORS.ORANGE) {
      summary.orangeCount += 1;
    } else if (check.color === STATUS_COLORS.RED) {
      summary.redCount += 1;
    }

    if (check.outcome === "PASS") {
      summary.passCount += 1;
    } else if (check.outcome === "WARN") {
      summary.warnCount += 1;
    } else if (check.outcome === "FAIL") {
      summary.failCount += 1;
    }
  });

  return summary;
}

function runDiagnostics(options) {
  const root = startupInitializer.normalizeRoot((options && options.root) || SOURCE_FACTORY_ROOT);
  let checks = [];

  checks = checks.concat(checkRequiredFiles(root));
  checks = checks.concat(checkBrowserFolders(root));
  checks.push(checkConstitutionLocation(root));
  checks.push(checkRestrictedRootReferences(root));

  const summary = summarizeChecks(checks);
  const overallColor = summary.redCount > 0 ? STATUS_COLORS.RED : (summary.orangeCount > 0 ? STATUS_COLORS.ORANGE : STATUS_COLORS.BLUE);

  return {
    ok: summary.redCount === 0,
    root: root,
    color: overallColor,
    generatedAt: new Date().toISOString(),
    checks: checks,
    summary: summary
  };
}

function printDiagnostics(result) {
  console.log("SOURCE_FACTORY_STAGE1_DIAGNOSTIC");
  console.log("root=" + result.root);
  console.log("generated_at=" + result.generatedAt);
  console.log("overall_color=" + result.color);
  console.log("ok=" + String(result.ok));
  console.log("blue_count=" + result.summary.blueCount);
  console.log("orange_count=" + result.summary.orangeCount);
  console.log("red_count=" + result.summary.redCount);

  result.checks.forEach(function (check) {
    console.log("[" + check.color + "] " + check.outcome + " " + check.id + " - " + check.label);
    if (check.details && check.details.relativePath) {
      console.log("  path=" + check.details.relativePath);
    }
    if (check.details && check.details.reason) {
      console.log("  reason=" + check.details.reason);
    }
    if (check.details && typeof check.details.scannedFileCount === "number") {
      console.log("  scanned_file_count=" + check.details.scannedFileCount);
    }
    if (check.details && typeof check.details.matchCount === "number") {
      console.log("  match_count=" + check.details.matchCount);
    }
  });

  console.log("diagnostic_result=" + (result.ok ? "DONE" : "FAILED"));
}

if (require.main === module) {
  const result = runDiagnostics();
  printDiagnostics(result);
  process.exit(result.ok ? 0 : 1);
}

module.exports = {
  SOURCE_FACTORY_ROOT,
  STATUS_COLORS,
  REQUIRED_FILES,
  CONSTITUTION_CANDIDATE_FOLDERS,
  CONSTITUTION_ROOT_FILE_CANDIDATES,
  makeCheck,
  fileExists,
  directoryExists,
  checkRequiredFiles,
  checkBrowserFolders,
  findConstitutionLocation,
  checkConstitutionLocation,
  buildRestrictedRootPatterns,
  checkRestrictedRootReferences,
  summarizeChecks,
  runDiagnostics,
  printDiagnostics
};
