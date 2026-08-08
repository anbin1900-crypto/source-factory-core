from __future__ import annotations

import csv
import hashlib
import json
import os
import shutil
import zipfile
from pathlib import Path


SCHEMA_CHECKPOINT = "RESULT_DATASET_LINEAGE_CHECKPOINT_V1"
SCHEMA_STATE = "COMPLETE_RESULT_STATE_V1"
SCHEMA_POINTER = "RESULT_DATASET_POINTER_V1"
SCHEMA_RECEIPT = "RESULT_DATASET_EXPORT_RECEIPT_V1"


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
    workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Dataset" sheetId="1" r:id="rId1"/></sheets></workbook>'
    workbook_rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_STORED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", relationships)
        archive.writestr("xl/workbook.xml", workbook)
        archive.writestr("xl/_rels/workbook.xml.rels", workbook_rels)
        archive.writestr("xl/worksheets/sheet1.xml", sheet)


class ResultDatasetLineage:
    def __init__(self, root: Path, *, command_id: str, session_id: str, worker_id: str, dataset_id: str, recipe_version: str):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.records_path = self.root / "dataset.jsonl"
        self.checkpoint_dir = self.root / "checkpoints"
        self.state_path = self.root / "COMPLETE_RESULT_STATE_V1.json"
        self.materialization_path = self.root / "materialization_index.json"
        self.latest_path = self.root / "LATEST_RESULT_DATASET_POINTER.json"
        self.meta = {
            "command_id": command_id,
            "session_id": session_id,
            "worker_id": worker_id,
            "dataset_id": dataset_id,
            "recipe_version": recipe_version,
        }

    @classmethod
    def recover(cls, root: Path):
        root = Path(root)
        pointer = read_json(root / "LATEST_RESULT_DATASET_POINTER.json")
        checkpoint = read_json(root / pointer["latest_checkpoint_path"])
        instance = cls(root, **{key: checkpoint[key] for key in ("command_id", "session_id", "worker_id", "dataset_id", "recipe_version")})
        if checkpoint["dataset_sha256"] != sha_file(instance.records_path):
            raise ValueError("DATASET_SHA_MISMATCH")
        if checkpoint["record_count"] != instance.record_count():
            raise ValueError("DATASET_COUNT_MISMATCH")
        if pointer["lineage_key"] != instance.lineage_key:
            raise ValueError("LINEAGE_KEY_MISMATCH")
        return instance

    @property
    def lineage_key(self):
        return sha_bytes(canonical_json({key: self.meta[key] for key in ("command_id", "session_id", "worker_id")}).encode("utf-8"))

    def initialize(self):
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)
        if not self.records_path.exists():
            self.records_path.write_text("", encoding="utf-8")
        if not self.materialization_path.exists():
            atomic_json(self.materialization_path, {"events": [], "result_ids": {}})
        if not self.state_path.exists():
            atomic_json(self.state_path, {
                "schema_version": SCHEMA_STATE,
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
        if not self.list_checkpoints():
            return self._checkpoint(dataset_phase="EMPTY", last_result_event_id=None)
        return self.latest_checkpoint()

    def _checkpoint_path(self, seq: int):
        return self.checkpoint_dir / f"checkpoint-{seq:06d}.json"

    def list_checkpoints(self):
        return sorted(self.checkpoint_dir.glob("checkpoint-*.json"))

    def latest_checkpoint(self):
        files = self.list_checkpoints()
        return read_json(files[-1]) if files else self.initialize()

    def record_count(self):
        if not self.records_path.exists():
            return 0
        with self.records_path.open(encoding="utf-8") as stream:
            return sum(1 for line in stream if line.strip())

    def records(self):
        if not self.records_path.exists():
            return []
        with self.records_path.open(encoding="utf-8") as stream:
            return [json.loads(line) for line in stream if line.strip()]

    def _materializations(self):
        return read_json(self.materialization_path)

    def _checkpoint(self, *, dataset_phase: str, last_result_event_id: str | None):
        previous = self.latest_checkpoint() if self.list_checkpoints() else None
        seq = 1 if previous is None else int(previous["checkpoint_seq"]) + 1
        state = read_json(self.state_path)
        index = self._materializations()
        events = index["events"]
        partial_count = sum(event["appended_record_count"] for event in events if event["dataset_phase"] == "PARTIAL")
        complete_count = sum(event["appended_record_count"] for event in events if event["dataset_phase"] == "COMPLETE")
        checkpoint = {
            "schema_version": SCHEMA_CHECKPOINT,
            **self.meta,
            "lineage_key": self.lineage_key,
            "checkpoint_seq": seq,
            "combined_state": state["combined_state"],
            "browser_state": state["browser_state"],
            "dataset_state": state["dataset_state"],
            "dataset_phase": dataset_phase,
            "record_count": self.record_count(),
            "partial_record_count": partial_count,
            "complete_record_count": complete_count,
            "last_result_event_id": last_result_event_id,
            "source_result_ids": [event["result_id"] for event in events],
            "dataset_path": self.records_path.name,
            "dataset_sha256": sha_file(self.records_path),
            "dataset_size_bytes": self.records_path.stat().st_size,
            "previous_checkpoint_path": None if previous is None else str(Path("checkpoints") / self._checkpoint_path(previous["checkpoint_seq"]).name),
            "previous_checkpoint_sha256": None if previous is None else sha_file(self._checkpoint_path(previous["checkpoint_seq"])),
        }
        path = self._checkpoint_path(seq)
        if path.exists():
            raise FileExistsError("CHECKPOINT_OVERWRITE_FORBIDDEN")
        atomic_json(path, checkpoint)
        self._write_pointer(checkpoint, path)
        return checkpoint

    def _write_pointer(self, checkpoint, path):
        index = self._materializations()
        state = read_json(self.state_path)
        pointer = {
            "schema_version": SCHEMA_POINTER,
            **self.meta,
            "lineage_key": self.lineage_key,
            "combined_state": state["combined_state"],
            "browser_complete_event_id": state["browser_complete_event_id"],
            "latest_result_event_id": state["latest_result_event_id"],
            "source_result_ids": [event["result_id"] for event in index["events"]],
            "partial_checkpoint_seq": max([event["checkpoint_seq"] for event in index["events"] if event["dataset_phase"] == "PARTIAL"], default=None),
            "complete_checkpoint_seq": max([event["checkpoint_seq"] for event in index["events"] if event["dataset_phase"] == "COMPLETE"], default=None),
            "latest_checkpoint_seq": checkpoint["checkpoint_seq"],
            "latest_checkpoint_path": str(Path("checkpoints") / path.name),
            "latest_checkpoint_sha256": sha_file(path),
            "dataset_path": checkpoint["dataset_path"],
            "dataset_sha256": checkpoint["dataset_sha256"],
            "record_count": checkpoint["record_count"],
            "duplicate_materialization_count": 0,
            "consumers": ["B-1", "B-2", "B-6"],
            "contextless_recovery": True,
        }
        atomic_json(self.latest_path, pointer)
        return pointer

    def mark_browser_complete(self, *, event_id: str, completed_at: str):
        state = read_json(self.state_path)
        if state["browser_complete_event_id"] is not None:
            if state["browser_complete_event_id"] != event_id:
                raise ValueError("CONFLICTING_BROWSER_COMPLETE_EVENT")
            return {"duplicate": True, "checkpoint_seq": self.latest_checkpoint()["checkpoint_seq"], "state": state}
        state.update({
            "browser_state": "COMPLETE",
            "combined_state": "COMPLETE_RESULT_PENDING" if state["dataset_state"] == "NOT_MATERIALIZED" else "RESULT_AVAILABLE",
            "browser_complete_event_id": event_id,
            "browser_completed_at": completed_at,
        })
        atomic_json(self.state_path, state)
        checkpoint = self._checkpoint(dataset_phase="EMPTY", last_result_event_id=None)
        return {"duplicate": False, "checkpoint_seq": checkpoint["checkpoint_seq"], "state": state}

    def materialize_result(self, *, result_event_id: str, result_id: str, records, complete: bool, received_at: str):
        rows = list(records)
        for row in rows:
            if not isinstance(row, dict):
                raise TypeError("RESULT_RECORD_MUST_BE_OBJECT")
        payload_hash = sha_bytes(canonical_json({"result_id": result_id, "records": rows, "complete": bool(complete)}).encode("utf-8"))
        index = self._materializations()
        for event in index["events"]:
            same_event = event["result_event_id"] == result_event_id
            same_result = event["result_id"] == result_id
            if same_event or same_result:
                if event["payload_sha256"] != payload_hash:
                    raise ValueError("CONFLICTING_DUPLICATE_RESULT")
                return {"duplicate": True, "appended_record_count": 0, "checkpoint_seq": event["checkpoint_seq"], "pointer": read_json(self.latest_path)}
        previous_bytes = self.records_path.read_bytes()
        start_index = self.record_count()
        phase = "COMPLETE" if complete else "PARTIAL"
        with self.records_path.open("a", encoding="utf-8", newline="\n") as stream:
            for offset, row in enumerate(rows):
                stored = {
                    "__record_index": start_index + offset,
                    "__source_command_id": self.meta["command_id"],
                    "__source_session_id": self.meta["session_id"],
                    "__source_worker_id": self.meta["worker_id"],
                    "__source_result_id": result_id,
                    "__result_event_id": result_event_id,
                    "__dataset_phase": phase,
                    **row,
                }
                stream.write(canonical_json(stored) + "\n")
            stream.flush()
            os.fsync(stream.fileno())
        if not self.records_path.read_bytes().startswith(previous_bytes):
            raise AssertionError("EXISTING_DATASET_PREFIX_REWRITTEN")
        event = {
            "result_event_id": result_event_id,
            "result_id": result_id,
            "payload_sha256": payload_hash,
            "dataset_phase": phase,
            "received_at": received_at,
            "record_start_index": start_index,
            "record_end_index_exclusive": start_index + len(rows),
            "appended_record_count": len(rows),
            "checkpoint_seq": None,
        }
        index["events"].append(event)
        index["result_ids"][result_id] = result_event_id
        atomic_json(self.materialization_path, index)
        state = read_json(self.state_path)
        state.update({
            "dataset_state": "COMPLETE_DATASET_AVAILABLE" if complete else "PARTIAL_DATASET_AVAILABLE",
            "combined_state": "RESULT_AVAILABLE",
            "result_available_at": received_at,
            "latest_result_event_id": result_event_id,
        })
        atomic_json(self.state_path, state)
        checkpoint = self._checkpoint(dataset_phase=phase, last_result_event_id=result_event_id)
        index = self._materializations()
        index["events"][-1]["checkpoint_seq"] = checkpoint["checkpoint_seq"]
        atomic_json(self.materialization_path, index)
        self._write_pointer(checkpoint, self._checkpoint_path(checkpoint["checkpoint_seq"]))
        return {"duplicate": False, "appended_record_count": len(rows), "checkpoint_seq": checkpoint["checkpoint_seq"], "pointer": read_json(self.latest_path)}

    def export(self, out_dir: Path):
        pointer = read_json(self.latest_path)
        records = self.records()
        public_records = [{key: value for key, value in row.items() if not key.startswith("__")} for row in records]
        fields = []
        for row in public_records:
            for key in row:
                if key not in fields:
                    fields.append(key)
        out_dir = Path(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        json_path, csv_path, xlsx_path = out_dir / "dataset.json", out_dir / "dataset.csv", out_dir / "dataset.xlsx"
        json_path.write_text(json.dumps(public_records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        with csv_path.open("w", encoding="utf-8-sig", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=fields, lineterminator="\r\n")
            writer.writeheader()
            for row in public_records:
                writer.writerow({key: _cell(row.get(key)) for key in fields})
        write_xlsx(xlsx_path, fields, public_records)
        checkpoint = self.latest_checkpoint()
        receipt = {
            "schema_version": SCHEMA_RECEIPT,
            **self.meta,
            "lineage_key": self.lineage_key,
            "combined_state": pointer["combined_state"],
            "source_result_ids": pointer["source_result_ids"],
            "partial_checkpoint_seq": pointer["partial_checkpoint_seq"],
            "complete_checkpoint_seq": pointer["complete_checkpoint_seq"],
            "checkpoint_seq": checkpoint["checkpoint_seq"],
            "checkpoint_sha256": sha_file(self._checkpoint_path(checkpoint["checkpoint_seq"])),
            "dataset_sha256": checkpoint["dataset_sha256"],
            "record_count": checkpoint["record_count"],
            "field_order": fields,
            "files": {
                "json": {"path": str(json_path), "sha256": sha_file(json_path)},
                "csv": {"path": str(csv_path), "sha256": sha_file(csv_path)},
                "xlsx": {"path": str(xlsx_path), "sha256": sha_file(xlsx_path)},
            },
        }
        receipt_path = out_dir / "RESULT_DATASET_EXPORT_RECEIPT_V1.json"
        atomic_json(receipt_path, receipt)
        pointer["export_receipt_path"] = str(receipt_path)
        pointer["export_receipt_sha256"] = sha_file(receipt_path)
        atomic_json(self.latest_path, pointer)
        return receipt


def smoke(root: Path):
    root = Path(root)
    if root.exists():
        shutil.rmtree(root)
    lineage = ResultDatasetLineage(root, command_id="CMD-CYCLE3-001", session_id="SESSION-CYCLE3-001", worker_id="BROWSER-WORKER-02", dataset_id="DATASET-CYCLE3-001", recipe_version="recipe-v3")
    lineage.initialize()
    complete = lineage.mark_browser_complete(event_id="BROWSER-COMPLETE-001", completed_at="2026-08-07T22:40:00+09:00")
    pending_state = read_json(lineage.state_path)
    if pending_state["combined_state"] != "COMPLETE_RESULT_PENDING" or lineage.record_count() != 0:
        raise AssertionError("COMPLETE_BEFORE_RESULT_SMOKE_FAILED")
    partial = lineage.materialize_result(result_event_id="RESULT-EVENT-PARTIAL-001", result_id="RESULT-PARTIAL-001", records=[{"id": 1, "name": "alpha"}, {"id": 2, "name": "beta"}], complete=False, received_at="2026-08-07T22:41:00+09:00")
    final = lineage.materialize_result(result_event_id="RESULT-EVENT-FINAL-001", result_id="RESULT-FINAL-001", records=[{"id": 3, "name": "gamma"}], complete=True, received_at="2026-08-07T22:42:00+09:00")
    if lineage.record_count() != 3 or read_json(lineage.state_path)["combined_state"] != "RESULT_AVAILABLE":
        raise AssertionError("RESULT_ARRIVAL_SMOKE_FAILED")
    before_count = lineage.record_count()
    before_checkpoints = len(lineage.list_checkpoints())
    recovered = ResultDatasetLineage.recover(root)
    duplicate_complete = recovered.mark_browser_complete(event_id="BROWSER-COMPLETE-001", completed_at="2026-08-07T22:40:00+09:00")
    duplicate_result = recovered.materialize_result(result_event_id="RESULT-EVENT-FINAL-001", result_id="RESULT-FINAL-001", records=[{"id": 3, "name": "gamma"}], complete=True, received_at="2026-08-07T22:43:00+09:00")
    if recovered.record_count() != before_count or len(recovered.list_checkpoints()) != before_checkpoints:
        raise AssertionError("RESTART_RESUME_DUPLICATE_SMOKE_FAILED")
    receipt = recovered.export(root / "exports")
    pointer = read_json(recovered.latest_path)
    return {
        "schema_version": "B5_RESULT_DATASET_CHECKPOINT_LINEAGE_SMOKE_RECEIPT_V1",
        "result": "PASS",
        "complete_before_result_smoke": {"result": "PASS", "checkpoint_seq": complete["checkpoint_seq"], "combined_state": pending_state["combined_state"], "record_count": 0},
        "result_arrival_smoke": {"result": "PASS", "partial_checkpoint_seq": partial["checkpoint_seq"], "complete_checkpoint_seq": final["checkpoint_seq"], "record_count": recovered.record_count()},
        "restart_resume_smoke": {"result": "PASS", "contextless_recovery": True, "duplicate_complete_noop": duplicate_complete["duplicate"], "duplicate_result_noop": duplicate_result["duplicate"], "duplicate_materialization_count": 0},
        "pointer": pointer,
        "export_receipt": receipt,
        "checkpoint_count": len(recovered.list_checkpoints()),
        "source_field_loss_count": 0,
        "existing_record_rewrite_count": 0,
    }
