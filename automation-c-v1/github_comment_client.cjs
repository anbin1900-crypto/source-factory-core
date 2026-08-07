'use strict';

const { correlateReports } = require('./report_parser/index.cjs');

async function collectIssueComments(fetchPage, options = {}) {
  const perPage = options.per_page || 100;
  const maxPages = options.max_pages || 100;
  const maxAttempts = options.max_attempts || 5;
  const comments = [];
  for (let page = 1; page <= maxPages; page += 1) {
    let response;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        response = await fetchPage({ page, per_page: perPage, attempt });
        if (!Array.isArray(response)) throw new Error('MALFORMED_GITHUB_PAGE');
        break;
      } catch (error) {
        if (attempt === maxAttempts) throw error;
      }
    }
    comments.push(...response);
    if (response.length < perPage) break;
  }
  return comments;
}

async function evaluateGithubReports(fetchPage, expected, options = {}) {
  const comments = await collectIssueComments(fetchPage, options);
  return correlateReports(comments, expected, options);
}

module.exports = { collectIssueComments, evaluateGithubReports };
