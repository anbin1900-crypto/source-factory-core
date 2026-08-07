#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const https = require('node:https');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 2) {
    if (!argv[i] || !argv[i].startsWith('--') || argv[i + 1] == null) throw new Error(`BAD_ARG:${argv[i] || ''}`);
    out[argv[i].slice(2)] = argv[i + 1];
  }
  for (const key of ['manifest', 'output', 'receipt']) if (!out[key]) throw new Error(`MISSING_ARG:${key}`);
  return out;
}
function sha256(body) { return crypto.createHash('sha256').update(body).digest('hex'); }
function safePath(root, relative) {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, relative);
  if (target !== resolvedRoot && !target.startsWith(resolvedRoot + path.sep)) throw new Error(`BUNDLE_PATH_ESCAPE:${relative}`);
  return target;
}
function requestJson(url, token) {
  return new Promise((resolve, reject) => {
    const headers = { 'User-Agent': 'yolla-w3-wave15-blob-fetcher', Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (token) headers.Authorization = `Bearer ${token}`;
    https.get(url, { headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`GITHUB_BLOB_HTTP_${response.statusCode}:${text.slice(0, 200)}`));
        try { resolve(JSON.parse(text)); } catch (error) { reject(new Error(`GITHUB_BLOB_JSON_INVALID:${error.message}`)); }
      });
    }).on('error', reject);
  });
}
async function fetchBundle(manifest, outputRoot, request = requestJson, token = process.env.GITHUB_TOKEN || '') {
  if (manifest.schema_version !== 'W3_WAVE15_EXACT_UI_BLOB_BUNDLE_V1') throw new Error('MANIFEST_SCHEMA_MISMATCH');
  const staged = [];
  for (const member of manifest.members) {
    const endpoint = manifest.git_blob_api.endpoint_template.replace('{blob_sha1}', member.blob_sha1);
    const payload = await request(manifest.git_blob_api.base_url + endpoint, token);
    if (payload.sha !== member.blob_sha1) throw new Error(`BLOB_SHA1_MISMATCH:${member.logical_role}`);
    if (payload.encoding !== 'base64') throw new Error(`BLOB_ENCODING_UNSUPPORTED:${member.logical_role}`);
    const body = Buffer.from(String(payload.content || '').replace(/\s+/g, ''), 'base64');
    if (body.length !== member.size_bytes) throw new Error(`BLOB_SIZE_MISMATCH:${member.logical_role}`);
    if (sha256(body) !== member.sha256) throw new Error(`BLOB_SHA256_MISMATCH:${member.logical_role}`);
    staged.push({ member, body });
  }
  const results = [];
  for (const item of staged) {
    const target = safePath(outputRoot, item.member.bundle_path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, item.body);
    results.push({ logical_role: item.member.logical_role, blob_sha1: item.member.blob_sha1, sha256: item.member.sha256, size_bytes: item.body.length, bundle_path: item.member.bundle_path, status: 'PASS' });
  }
  return { schema_version: 'W3_WAVE15_BLOB_FETCH_RECEIPT_V1', status: 'PASS', result_key: manifest.result_key, target_version: manifest.target_version, fetched_member_count: results.length, members: results, raw_github_dns_used: false, mounted_checkout_used: false, live_pass_claimed: false };
}
if (require.main === module) {
  (async () => {
    const args = parseArgs(process.argv);
    const manifest = JSON.parse(fs.readFileSync(args.manifest, 'utf8'));
    const receipt = await fetchBundle(manifest, args.output);
    fs.mkdirSync(path.dirname(path.resolve(args.receipt)), { recursive: true });
    fs.writeFileSync(args.receipt, JSON.stringify(receipt, null, 2) + '\n');
    console.log(`W3_WAVE15_BLOB_FETCH_PASS members=${receipt.fetched_member_count}`);
  })().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
}
module.exports = { fetchBundle, requestJson, sha256, safePath };
