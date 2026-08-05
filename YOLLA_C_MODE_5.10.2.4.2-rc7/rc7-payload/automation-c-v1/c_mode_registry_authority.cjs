'use strict';

const crypto = require('node:crypto');
const { parseWavePointer, PointerRelayState } = require('./c_mode_wave_pointer.cjs');

function fail(code) { const e = new Error(code); e.code = code; throw e; }

class RegistryAuthorityState extends PointerRelayState {
  constructor(snapshot = null) {
    super();
    this.registries = new Map();
    this.latestByWave = new Map();
    if (snapshot) this.restoreRegistry(snapshot);
  }

  register(text, metadata = {}) {
    const pointer = parseWavePointer(text);
    const sequence = metadata.registry_sequence;
    if (!Number.isSafeInteger(sequence) || sequence <= 0) fail('INVALID_REGISTRY_SEQUENCE');
    const key = `${pointer.wave_id}:${sequence}`;
    if (this.registries.has(key)) fail('DUPLICATE_WAVE_SEQUENCE_READY');

    const previous = this.latestByWave.get(pointer.wave_id) || null;
    if (previous && sequence <= previous.registry_sequence) fail('REGISTRY_SEQUENCE_NOT_MONOTONIC');
    const supersedes = metadata.supersedes || null;
    if (previous && supersedes !== previous.registry_id) fail('SUPERSEDES_CHAIN_MISMATCH');
    if (!previous && supersedes !== null) fail('UNEXPECTED_SUPERSEDES');

    const registryId = metadata.registry_id || `${pointer.wave_id}:REGISTRY:${sequence}`;
    const entry = {
      registry_id: registryId,
      registry_sequence: sequence,
      wave_id: pointer.wave_id,
      supersedes,
      pointer,
      source_comment: metadata.source_comment || null,
      created_at: metadata.created_at || null
    };
    this.registries.set(key, entry);
    this.latestByWave.set(pointer.wave_id, entry);
    return structuredClone(entry);
  }

  latestSnapshot(waveId) {
    const entry = this.latestByWave.get(waveId);
    if (!entry) fail('REGISTRY_NOT_FOUND');
    return structuredClone(entry);
  }

  exportSourceManifest(waveId, sources) {
    const registry = this.latestSnapshot(waveId);
    if (!Array.isArray(sources) || sources.length === 0) fail('SOURCE_EXPORT_EMPTY');
    const files = sources.map((source, index) => {
      for (const field of ['path','commit','blob_sha','sha256']) if (!source[field]) fail(`SOURCE_${field.toUpperCase()}_MISSING`);
      if (!/^[0-9a-f]{40}$/.test(source.commit)) fail('SOURCE_COMMIT_INVALID');
      if (!/^[0-9a-f]{40}$/.test(source.blob_sha)) fail('SOURCE_BLOB_INVALID');
      if (!/^[0-9a-f]{64}$/.test(source.sha256)) fail('SOURCE_SHA256_INVALID');
      return { order:index + 1, ...source };
    });
    const manifest = {
      schema_version: 'C_MODE_REGISTRY_SOURCE_EXPORT_V1',
      wave_id: waveId,
      registry_id: registry.registry_id,
      registry_sequence: registry.registry_sequence,
      supersedes: registry.supersedes,
      files
    };
    manifest.manifest_sha256 = crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
    return manifest;
  }

  snapshot() {
    return {
      relay: super.snapshot(),
      registries: [...this.registries],
      latest_by_wave: [...this.latestByWave]
    };
  }

  restoreRegistry(snapshot) {
    if (!snapshot || !snapshot.relay || !Array.isArray(snapshot.registries) || !Array.isArray(snapshot.latest_by_wave)) fail('INVALID_REGISTRY_SNAPSHOT');
    super.restore(snapshot.relay);
    this.registries = new Map(snapshot.registries);
    this.latestByWave = new Map(snapshot.latest_by_wave);
  }
}

module.exports = { RegistryAuthorityState };
