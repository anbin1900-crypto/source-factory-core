'use strict';

const base = require('./collectorCommanderGateHandoffAdapter.base');
const correlation = require('./p1CommandCorrelationContract');

function decorateHandoff(handoff, response, options) {
  if (!handoff || typeof handoff !== 'object' || Array.isArray(handoff)) {
    return handoff;
  }
  const data = response && response.data && typeof response.data === 'object'
    ? response.data
    : response;
  const corr = correlation.extractCorrelation(handoff, data, options);
  const output = correlation.attachCorrelation(handoff, data, options);

  output.source = correlation.attachCorrelation(output.source || {}, corr, data, options);
  output.gate_inputs = correlation.attachCorrelation(output.gate_inputs || {}, corr, data, options);
  output.collectWorkerOutput = correlation.attachCorrelation(
    output.collectWorkerOutput || {},
    corr,
    data,
    options
  );

  output.next_commander_action = Object.assign({}, output.next_commander_action || {}, {
    command_correlation: Object.assign({}, corr)
  });
  output.gate_recommendation = Object.assign({}, output.gate_recommendation || {}, {
    command_correlation: Object.assign({}, corr)
  });
  return output;
}

function normalizeCollectorResponseToGateHandoff(response, options) {
  return decorateHandoff(
    base.normalizeCollectorResponseToGateHandoff(response, options),
    response,
    options
  );
}

module.exports = Object.assign({}, base, {
  normalizeCollectorResponseToGateHandoff,
  __a4P1CorrelationRepair: {
    version: 'A4_P1_PANEL_WORKER_CORRELATION_REPAIR_V2',
    handoff_layer: 'COLLECTOR_COMMANDER_GATE_HANDOFF',
    new_runtime: false
  }
});
