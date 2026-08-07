from __future__ import annotations

import csv
import hashlib
import json
import os
import shutil
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path


DATASET_SCHEMAS = (
    "AI_PRODUCT_BLUEPRINT_DATASET_V1",
    "REAL_ESTATE_LISTING_FIELD_ONTOLOGY_V1",
    "SITE_LISTING_FIELD_BINDING_V1",
    "REAL_ESTATE_SITE_CAPABILITY_PROFILE_V1",
    "YOLLA_LISTING_LEDGER_SCHEMA_CANDIDATE_V1",
)
SEMANTIC_STATES = {"UNKNOWN", "CANDIDATE", "CANONICAL"}
STATE_SCHEMA = "COMPLETE_RESULT_STATE_V1"
CHECKPOINT_SCHEMA = "BLUEPRINT_ONTOLOGY_BINDING_CHECKPOINT_V1"
POINTER_SCHEMA = "RESULT_DATASET_POINTER_V1"
EXPORT_SCHEMA = "BLUEPRINT_ONTOLOGY_BINDING_EXPORT_RECEIPT_V1"


def canonical_json(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha_file(path: Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path: Path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def atomic_json(path: Path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(temp, path)


def _cell(value):
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (dict, list)):
        return canonical_json(value)
    return str(value)


def _escape(value):
    return _cell(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def _column(index: int) -> str:
    result = ""
    number = index + 1
    while number:
        number, remainder = divmod(number - 1, 26)
        result = chr(65 + remainder) + result
    return result


def write_xlsx(path: Path, fields, records):
    rows = [fields] + [[row.get(field) for field in fields] for row in records]
    xml_rows = []
    for row_index, row in enumerate(rows, 1):
        cells = []
        for column_index, value in enumerate(row):
            ref = f"{_column(column_index)}{row_index}"
            cells.append(f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">{_escape(value)}</t></is></c>')
        xml_rows.append(f'<row r="{row_index}">{"".join(cells)}</row>')
    sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + "".join(xml_rows) + "</sheetData></worksheet>"
    content_types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'
    relationships = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
    workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="SiteBinding" sheetId="1" r:id="rId1"/></sheets></workbook>'
    workbook_rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_STORED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", relationships)
        archive.writestr("xl/workbook.xml", workbook)
        archive.writestr("xl/_rels/workbook.xml.rels", workbook_rels)
        archive.writestr("xl/worksheets/sheet1.xml", sheet)


def read_xlsx(path: Path):
    ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(path) as archive:
        root = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
    rows = []
    for row in root.findall(".//s:row", ns):
        values = []
        for cell in row.findall("s:c", ns):
            node = cell.find("s:is/s:t", ns)
            values.append("" if node is None or node.text is None else node.text)
        rows.append(values)
    if not rows:
        return []
    fields = rows[0]
    return [dict(zip(fields, values)) for values in rows[1:]]


def _identity(record):
    return record["source_site_id"], record["source_field_name"]


class BlueprintOntologyBindingDataset:
    def __init__(self, root: Path, *, command_id: str, session_id: str, worker_id: str, dataset_id: str, recipe_version: str):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.checkpoint_dir = self.root / "checkpoints"
        self.state_path = self.root / "COMPLETE_RESULT_STATE_V1.json"
        self.index_path = self.root / "materialization_index.json"
        self.meta_path = self.root / "STORE_METADATA.json"
        self.pointer_path = self.root / "RESULT_DATASET_POINTER_V1.json"
        self.dataset_dir = self.root / "datasets"
        self.meta = {
            "command_id": command_id,
            "session_id": session_id,
            "worker_id": worker_id,
            "dataset_id": dataset_id,
            "recipe_version": recipe_version,
        }

    @property
    def lineage_key(self):
        return sha_bytes(canonical_json(self.meta).encode("utf-8"))

    @classmethod
    def recover(cls, root: Path):
        root = Path(root)
        meta = read_json(root / "STORE_METADATA.json")
        store = cls(root, **{key: meta[key] for key in ("command_id", "session_id", "worker_id", "dataset_id", "recipe_version")})
        pointer = read_json(store.pointer_path)
        checkpoint = read_json(root / pointer["latest_checkpoint_path"])
        if pointer["lineage_key"] != store.lineage_key:
            raise ValueError("LINEAGE_KEY_MISMATCH")
        if checkpoint["checkpoint_sha256"] != store._checkpoint_digest(checkpoint):
            raise ValueError("CHECKPOINT_DIGEST_MISMATCH")
        for schema, item in checkpoint["datasets"].items():
            path = root / item["path"]
            if sha_file(path) != item["sha256"] or len(read_json(path)["records"]) != item["record_count"]:
                raise ValueError(f"DATASET_READBACK_MISMATCH:{schema}")
        return store

    def initialize(self):
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)
        self.dataset_dir.mkdir(parents=True, exist_ok=True)
        if not self.meta_path.exists():
            atomic_json(self.meta_path, {**self.meta, "lineage_key": self.lineage_key})
        if not self.index_path.exists():
            atomic_json(self.index_path, {"events": []})
        if not self.state_path.exists():
            atomic_json(self.state_path, {
                "schema_version": STATE_SCHEMA,
                **self.meta,
                "lineage_key": self.lineage_key,
                "browser_state": "RUNNING",
                "dataset_state": "NOT_MATERIALIZED",
                "combined_state": "BROWSER_RUNNING",
                "browser_complete_event_id": None,
                "browser_completed_at": None,
                "result_available_at": None,
                "latest_result_event_id": None,
            })
        for schema in DATASET_SCHEMAS:
            path = self._dataset_path(schema)
            if not path.exists():
                atomic_json(path, {"schema_version": schema, "records": []})
        if not self.list_checkpoints():
            return self._checkpoint(dataset_phase="EMPTY", last_result_event_id=None, blueprint_id=None)
        return self.latest_checkpoint()

    def _dataset_path(self, schema):
        return self.dataset_dir / f"{schema}.json"

    def _checkpoint_path(self, seq):
        return self.checkpoint_dir / f"checkpoint-{seq:06d}.json"

    def list_checkpoints(self):
        return sorted(self.checkpoint_dir.glob("checkpoint-*.json"))

    def latest_checkpoint(self):
        files = self.list_checkpoints()
        return read_json(files[-1]) if files else self.initialize()

    def _index(self):
        return read_json(self.index_path)

    def _checkpoint_digest(self, checkpoint):
        value = {key: val for key, val in checkpoint.items() if key != "checkpoint_sha256"}
        return sha_bytes(canonical_json(value).encode("utf-8"))

    def _checkpoint(self, *, dataset_phase, last_result_event_id, blueprint_id):
        previous = self.latest_checkpoint() if self.list_checkpoints() else None
        seq = 1 if previous is None else previous["checkpoint_seq"] + 1
        state = read_json(self.state_path)
        datasets = {}
        for schema in DATASET_SCHEMAS:
            path = self._dataset_path(schema)
            datasets[schema] = {
                "path": str(path.relative_to(self.root)),
                "sha256": sha_file(path),
                "record_count": len(read_json(path)["records"]),
            }
        checkpoint = {
            "schema_version": CHECKPOINT_SCHEMA,
            **self.meta,
            "lineage_key": self.lineage_key,
            "checkpoint_seq": seq,
            "combined_state": state["combined_state"],
            "dataset_phase": dataset_phase,
            "blueprint_id": blueprint_id,
            "last_result_event_id": last_result_event_id,
            "datasets": datasets,
            "previous_checkpoint_path": None if previous is None else str(Path("checkpoints") / self._checkpoint_path(previous["checkpoint_seq"]).name),
            "previous_checkpoint_sha256": None if previous is None else sha_file(self._checkpoint_path(previous["checkpoint_seq"])),
        }
        checkpoint["checkpoint_sha256"] = self._checkpoint_digest(checkpoint)
        path = self._checkpoint_path(seq)
        if path.exists():
            raise FileExistsError("CHECKPOINT_OVERWRITE_FORBIDDEN")
        atomic_json(path, checkpoint)
        self._write_pointer(checkpoint)
        return checkpoint

    def _write_pointer(self, checkpoint):
        state = read_json(self.state_path)
        index = self._index()
        latest = index["events"][-1] if index["events"] else None
        pointer = {
            "schema_version": POINTER_SCHEMA,
            **self.meta,
            "lineage_key": self.lineage_key,
            "combined_state": state["combined_state"],
            "source_result_ids": [event["result_id"] for event in index["events"]],
            "source_blueprint_ids": [event["blueprint_id"] for event in index["events"]],
            "latest_result_event_id": state["latest_result_event_id"],
            "latest_checkpoint_seq": checkpoint["checkpoint_seq"],
            "latest_checkpoint_path": str(Path("checkpoints") / self._checkpoint_path(checkpoint["checkpoint_seq"]).name),
            "latest_checkpoint_sha256": sha_file(self._checkpoint_path(checkpoint["checkpoint_seq"])),
            "datasets": checkpoint["datasets"],
            "source_field_loss_count": 0 if latest is None else latest["source_field_loss_count"],
            "evidence_pointer_count": 0 if latest is None else latest["evidence_pointer_count"],
            "semantic_status_counts": {} if latest is None else latest["semantic_status_counts"],
            "duplicate_materialization_count": 0,
            "contextless_recovery": True,
            "consumers": ["B-1", "B-2", "B-6"],
        }
        atomic_json(self.pointer_path, pointer)
        return pointer

    def mark_browser_complete(self, *, event_id, completed_at):
        state = read_json(self.state_path)
        if state["browser_complete_event_id"] is not None:
            if state["browser_complete_event_id"] != event_id:
                raise ValueError("CONFLICTING_BROWSER_COMPLETE_EVENT")
            return {"duplicate": True, "checkpoint_seq": self.latest_checkpoint()["checkpoint_seq"]}
        state.update({
            "browser_state": "COMPLETE",
            "combined_state": "COMPLETE_RESULT_PENDING" if state["dataset_state"] == "NOT_MATERIALIZED" else "RESULT_AVAILABLE",
            "browser_complete_event_id": event_id,
            "browser_completed_at": completed_at,
        })
        atomic_json(self.state_path, state)
        checkpoint = self._checkpoint(dataset_phase="EMPTY", last_result_event_id=None, blueprint_id=None)
        return {"duplicate": False, "checkpoint_seq": checkpoint["checkpoint_seq"]}

    def _validate_bundle(self, bundle):
        if set(bundle) != set(DATASET_SCHEMAS):
            raise ValueError("REQUIRED_DATASET_SET_MISMATCH")
        for schema, dataset in bundle.items():
            if dataset.get("schema_version") != schema or not isinstance(dataset.get("records"), list):
                raise ValueError(f"DATASET_CONTRACT_MISMATCH:{schema}")
        blueprints = bundle["AI_PRODUCT_BLUEPRINT_DATASET_V1"]["records"]
        bindings = bundle["SITE_LISTING_FIELD_BINDING_V1"]["records"]
        ontology = bundle["REAL_ESTATE_LISTING_FIELD_ONTOLOGY_V1"]["records"]
        ledger = bundle["YOLLA_LISTING_LEDGER_SCHEMA_CANDIDATE_V1"]["records"]
        source_fields = {(item["source_site_id"], field) for item in blueprints for field in item["source_fields"]}
        bound_fields = {_identity(item) for item in bindings}
        if len(bound_fields) != len(bindings):
            raise ValueError("DUPLICATE_SOURCE_FIELD_BINDING")
        loss = source_fields - bound_fields
        if loss:
            raise ValueError("SOURCE_FIELD_LOSS:" + canonical_json(sorted(loss)))
        ontology_ids = {item["canonical_candidate_id"] for item in ontology}
        ledger_ids = {item["canonical_candidate_id"] for item in ledger}
        status_counts = {state: 0 for state in sorted(SEMANTIC_STATES)}
        for item in bindings + ontology + ledger:
            status = item.get("semantic_status")
            if status not in SEMANTIC_STATES:
                raise ValueError("INVALID_SEMANTIC_STATUS")
            status_counts[status] += 1
            if status == "CANONICAL" and not item.get("canonical_authority_pointer"):
                raise ValueError("UNSUPPORTED_CANONICAL_CONFIRMATION")
        for item in bindings:
            if item["canonical_candidate_id"] not in ontology_ids or item["canonical_candidate_id"] not in ledger_ids:
                raise ValueError("UNRESOLVED_CANONICAL_CANDIDATE")
            for key in ("read_transform", "write_transform", "evidence_pointer", "site_field_name"):
                if key not in item:
                    raise ValueError(f"MISSING_BINDING_FIELD:{key}")
            evidence = item["evidence_pointer"]
            if not isinstance(evidence, dict) or not evidence.get("artifact_sha256") or not evidence.get("path"):
                raise ValueError("INVALID_EVIDENCE_POINTER")
        return {
            "source_field_count": len(source_fields),
            "bound_source_field_count": len(bound_fields),
            "source_field_loss_count": len(loss),
            "evidence_pointer_count": len(bindings),
            "semantic_status_counts": status_counts,
        }

    def materialize(self, *, result_event_id, result_id, blueprint_id, bundle, complete, received_at):
        metrics = self._validate_bundle(bundle)
        bundle_hash = sha_bytes(canonical_json(bundle).encode("utf-8"))
        index = self._index()
        for event in index["events"]:
            identity_match = result_event_id == event["result_event_id"] or result_id == event["result_id"] or blueprint_id == event["blueprint_id"]
            if identity_match:
                if bundle_hash != event["bundle_sha256"]:
                    raise ValueError("CONFLICTING_DUPLICATE_RESULT_OR_BLUEPRINT")
                return {"duplicate": True, "checkpoint_seq": event["checkpoint_seq"], "pointer": read_json(self.pointer_path)}
        previous = {schema: self._dataset_path(schema).read_bytes() for schema in DATASET_SCHEMAS}
        lineage = {**self.meta, "lineage_key": self.lineage_key, "result_id": result_id, "result_event_id": result_event_id, "blueprint_id": blueprint_id}
        for schema in DATASET_SCHEMAS:
            materialized = {**bundle[schema], "lineage": lineage}
            atomic_json(self._dataset_path(schema), materialized)
        state = read_json(self.state_path)
        state.update({
            "dataset_state": "COMPLETE_DATASET_AVAILABLE" if complete else "PARTIAL_DATASET_AVAILABLE",
            "combined_state": "RESULT_AVAILABLE",
            "result_available_at": received_at,
            "latest_result_event_id": result_event_id,
        })
        atomic_json(self.state_path, state)
        event = {
            "result_event_id": result_event_id,
            "result_id": result_id,
            "blueprint_id": blueprint_id,
            "bundle_sha256": bundle_hash,
            "dataset_phase": "COMPLETE" if complete else "PARTIAL",
            "received_at": received_at,
            "checkpoint_seq": None,
            **metrics,
        }
        index["events"].append(event)
        atomic_json(self.index_path, index)
        checkpoint = self._checkpoint(dataset_phase=event["dataset_phase"], last_result_event_id=result_event_id, blueprint_id=blueprint_id)
        index = self._index()
        index["events"][-1]["checkpoint_seq"] = checkpoint["checkpoint_seq"]
        atomic_json(self.index_path, index)
        self._write_pointer(checkpoint)
        for schema, data in previous.items():
            if not data:
                raise AssertionError(f"MISSING_PREVIOUS_DATASET:{schema}")
        return {"duplicate": False, "checkpoint_seq": checkpoint["checkpoint_seq"], "pointer": read_json(self.pointer_path)}

    def bundle(self):
        return {schema: {key: value for key, value in read_json(self._dataset_path(schema)).items() if key != "lineage"} for schema in DATASET_SCHEMAS}

    def export(self, out_dir: Path):
        out_dir = Path(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        bundle = self.bundle()
        bindings = bundle["SITE_LISTING_FIELD_BINDING_V1"]["records"]
        fields = ["source_site_id", "source_field_name", "site_field_name", "canonical_candidate_id", "semantic_status", "read_transform", "write_transform", "evidence_pointer"]
        rows = [{field: _cell(item[field]) for field in fields} for item in bindings]
        json_path = out_dir / "blueprint_ontology_bundle.json"
        csv_path = out_dir / "site_listing_field_binding.csv"
        xlsx_path = out_dir / "site_listing_field_binding.xlsx"
        json_path.write_text(json.dumps(bundle, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        with csv_path.open("w", encoding="utf-8-sig", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=fields, lineterminator="\r\n")
            writer.writeheader()
            writer.writerows(rows)
        write_xlsx(xlsx_path, fields, rows)
        with csv_path.open(encoding="utf-8-sig", newline="") as stream:
            csv_rows = list(csv.DictReader(stream))
        xlsx_rows = read_xlsx(xlsx_path)
        json_roundtrip = read_json(json_path) == bundle
        csv_roundtrip = csv_rows == rows
        xlsx_roundtrip = xlsx_rows == rows
        if not (json_roundtrip and csv_roundtrip and xlsx_roundtrip):
            raise AssertionError("EXPORT_ROUNDTRIP_MISMATCH")
        checkpoint = self.latest_checkpoint()
        receipt = {
            "schema_version": EXPORT_SCHEMA,
            **self.meta,
            "lineage_key": self.lineage_key,
            "checkpoint_seq": checkpoint["checkpoint_seq"],
            "checkpoint_sha256": sha_file(self._checkpoint_path(checkpoint["checkpoint_seq"])),
            "source_result_ids": read_json(self.pointer_path)["source_result_ids"],
            "source_blueprint_ids": read_json(self.pointer_path)["source_blueprint_ids"],
            "record_count": len(bindings),
            "field_order": fields,
            "files": {
                "json": {"path": str(json_path), "sha256": sha_file(json_path)},
                "csv": {"path": str(csv_path), "sha256": sha_file(csv_path)},
                "xlsx": {"path": str(xlsx_path), "sha256": sha_file(xlsx_path)},
            },
            "roundtrip": {"json": json_roundtrip, "csv": csv_roundtrip, "xlsx": xlsx_roundtrip},
        }
        receipt_path = out_dir / f"{EXPORT_SCHEMA}.json"
        atomic_json(receipt_path, receipt)
        pointer = read_json(self.pointer_path)
        pointer["export_receipt_path"] = str(receipt_path)
        pointer["export_receipt_sha256"] = sha_file(receipt_path)
        atomic_json(self.pointer_path, pointer)
        return receipt


def smoke(root: Path, fixture_path: Path):
    root = Path(root)
    if root.exists():
        shutil.rmtree(root)
    bundle = read_json(fixture_path)
    store = BlueprintOntologyBindingDataset(root, command_id="CMD-CYCLE4-001", session_id="SESSION-CYCLE4-001", worker_id="BROWSER-WORKER-02", dataset_id="DATASET-CYCLE4-001", recipe_version="recipe-v4")
    store.initialize()
    complete = store.mark_browser_complete(event_id="BROWSER-COMPLETE-CYCLE4-001", completed_at="2026-08-08T13:10:00+09:00")
    pending = read_json(store.state_path)
    if pending["combined_state"] != "COMPLETE_RESULT_PENDING":
        raise AssertionError("COMPLETE_RESULT_PENDING_NOT_PRESERVED")
    materialized = store.materialize(result_event_id="RESULT-EVENT-CYCLE4-001", result_id="RESULT-CYCLE4-001", blueprint_id="BLUEPRINT-REAL-ESTATE-CYCLE4-001", bundle=bundle, complete=True, received_at="2026-08-08T13:11:00+09:00")
    before = len(store.list_checkpoints())
    duplicate_result = store.materialize(result_event_id="RESULT-EVENT-CYCLE4-001", result_id="RESULT-CYCLE4-001", blueprint_id="BLUEPRINT-REAL-ESTATE-CYCLE4-001", bundle=bundle, complete=True, received_at="2026-08-08T13:12:00+09:00")
    duplicate_blueprint = store.materialize(result_event_id="RESULT-EVENT-CYCLE4-002", result_id="RESULT-CYCLE4-002", blueprint_id="BLUEPRINT-REAL-ESTATE-CYCLE4-001", bundle=bundle, complete=True, received_at="2026-08-08T13:13:00+09:00")
    if len(store.list_checkpoints()) != before or not duplicate_result["duplicate"] or not duplicate_blueprint["duplicate"]:
        raise AssertionError("DUPLICATE_MATERIALIZATION_NOT_ZERO")
    recovered = BlueprintOntologyBindingDataset.recover(root)
    receipt = recovered.export(root / "exports")
    pointer = read_json(recovered.pointer_path)
    return {
        "schema_version": "B5_BLUEPRINT_ONTOLOGY_BINDING_DATASET_SMOKE_RECEIPT_V1",
        "result": "PASS",
        "complete_result_pending_to_result_available": pending["combined_state"] == "COMPLETE_RESULT_PENDING" and pointer["combined_state"] == "RESULT_AVAILABLE",
        "initial_checkpoint_seq": 1,
        "complete_checkpoint_seq": complete["checkpoint_seq"],
        "materialized_checkpoint_seq": materialized["checkpoint_seq"],
        "checkpoint_sequence": [read_json(path)["checkpoint_seq"] for path in recovered.list_checkpoints()],
        "contextless_recovery": True,
        "dataset_contract_count": len(DATASET_SCHEMAS),
        "site_count": len(bundle["REAL_ESTATE_SITE_CAPABILITY_PROFILE_V1"]["records"]),
        "binding_count": len(bundle["SITE_LISTING_FIELD_BINDING_V1"]["records"]),
        "source_field_loss_count": pointer["source_field_loss_count"],
        "evidence_pointer_count": pointer["evidence_pointer_count"],
        "semantic_status_counts": pointer["semantic_status_counts"],
        "duplicate_result_noop": duplicate_result["duplicate"],
        "duplicate_blueprint_noop": duplicate_blueprint["duplicate"],
        "duplicate_materialization_count": 0,
        "checkpoint_resume_export_roundtrip": all(receipt["roundtrip"].values()),
        "export_receipt": receipt,
    }
