/* eslint-env node */
"use strict";

const https = require("node:https");
const childProcess = require("node:child_process");

function cleanText(value, maxLength = 20000) {
  return String(value == null ? "" : value).replace(/\u0000/g, "").trim().slice(0, maxLength);
}

function ghAvailable() {
  try {
    const result = childProcess.spawnSync("gh", ["--version"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 5000
    });
    return result.status === 0;
  } catch (_error) {
    return false;
  }
}

function fetchCommentsWithGh(repository, pr) {
  const endpoint = `repos/${repository}/issues/${Number(pr)}/comments?per_page=100`;
  const result = childProcess.spawnSync("gh", ["api", endpoint, "--paginate"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 30000,
    maxBuffer: 30 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(`GH_API_FAILED:${cleanText(result.stderr, 1500)}`);
  }
  const text = String(result.stdout || "").trim();
  if (!text) return [];
  try {
    return JSON.parse(text);
  } catch (_error) {
    return text.split(/\r?\n(?=\[)/).filter(Boolean).flatMap(part => JSON.parse(part));
  }
}

function requestJson(url, token) {
  return new Promise((resolve, reject) => {
    const headers = {
      Accept: "application/vnd.github+json",
      "User-Agent": "AI-YOLLA-C-MODE-RUNTIME",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const request = https.get(url, { headers, timeout: 20000 }, response => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { body += chunk; });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`GITHUB_HTTP_${response.statusCode}:${body.slice(0, 500)}`));
          return;
        }
        try { resolve(JSON.parse(body)); }
        catch (error) { reject(error); }
      });
    });
    request.on("timeout", () => request.destroy(new Error("GITHUB_REQUEST_TIMEOUT")));
    request.on("error", reject);
  });
}

async function fetchIssueComments(repository, pr) {
  if (!/^[^/\s]+\/[^/\s]+$/.test(String(repository || ""))) {
    throw new Error("C_MODE_REPOSITORY_INVALID");
  }
  if (!Number.isInteger(Number(pr)) || Number(pr) < 1) {
    throw new Error("C_MODE_CONTROL_PR_INVALID");
  }
  if (ghAvailable()) {
    try { return fetchCommentsWithGh(repository, pr); }
    catch (_error) {}
  }
  const token = process.env.YOLLA_GITHUB_TOKEN || process.env.GITHUB_TOKEN || "";
  const all = [];
  for (let page = 1; page <= 10; page += 1) {
    const url = `https://api.github.com/repos/${repository}/issues/${Number(pr)}/comments?per_page=100&page=${page}`;
    const rows = await requestJson(url, token);
    if (!Array.isArray(rows)) break;
    all.push(...rows);
    if (rows.length < 100) break;
  }
  return all;
}

module.exports = {
  ghAvailable,
  fetchCommentsWithGh,
  fetchIssueComments
};
