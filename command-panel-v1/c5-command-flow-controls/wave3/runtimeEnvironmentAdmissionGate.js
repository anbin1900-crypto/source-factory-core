'use strict';

const constants = require('./lib/constants');
const core = require('./lib/core');
const policy = require('./lib/policy');

module.exports = {
  schema_version: 'C5_AI_YOLLA_RUNTIME_ENVIRONMENT_ADMISSION_GATE_WAVE3_V1',
  ...constants,
  ...core,
  ...policy
};
