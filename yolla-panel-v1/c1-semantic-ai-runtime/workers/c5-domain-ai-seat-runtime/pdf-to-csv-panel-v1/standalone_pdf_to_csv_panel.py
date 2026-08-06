#!/usr/bin/env python3
"""Standalone PySide6 panel for folder-or-single-PDF -> UTF-8-SIG CSV preprocessing."""
from __future__ import annotations

import importlib.util
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

HERE = Path(__file__).resolve().parent
WORKERS = HERE.parents[1]
C4_PIPELINE_PATH = (
    WORKERS
    / "c4-evidence-knowledge-candidate"
    / "pdf-to-csv-panel-v1"
    / "pdf_to_csv_pipeline_orchestrator.py"
)

PYSIDE6_AVAILABLE = False
PYSIDE6_IMPORT_ERROR: Exception | None = None
try:
    from PySide6.QtCore import QThread, Signal
    from PySide6.QtWidgets import (
        QApplication,
        QFileDialog,
        QGridLayout,
        QHBoxLayout,
        QLabel,
        QLineEdit,
        QMainWindow,
        QMessageBox,
        QProgressBar,
        QPushButton,
        QSpinBox,
        QTextEdit,
        QVBoxLayout,
        QWidget,
    )
    PYSIDE6_AVAILABLE = True
except ImportError as exc:
    PYSIDE6_IMPORT_ERROR = exc


class PanelInputError(ValueError):
    """User-facing request validation error."""


@dataclass(frozen=True)
class PipelineRequest:
    mode: str
    source: str
    output: str
    max_chars: int


def normalize_mode(mode: str | None) -> str:
    normalized = (mode or "").strip().upper()
    if normalized == "SINGLE_PDF":
        normalized = "PDF_FILE"
    if normalized not in {"FOLDER", "PDF_FILE"}:
        raise PanelInputError(f"PANEL_INPUT_MODE_INVALID:{mode}")
    return normalized


def build_pipeline_kwargs(
    *,
    mode: str,
    source: str,
    output: str,
    max_chars: int,
    progress: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    normalized = normalize_mode(mode)
    if not isinstance(source, str) or not source.strip():
        raise PanelInputError("PANEL_SOURCE_REQUIRED")
    if not isinstance(output, str) or not output.strip():
        raise PanelInputError("PANEL_OUTPUT_REQUIRED")
    if not isinstance(max_chars, int) or isinstance(max_chars, bool) or max_chars < 1:
        raise PanelInputError("PANEL_MAX_CHARS_INVALID")

    kwargs: dict[str, Any] = {
        "output_folder": output,
        "max_chars": max_chars,
    }
    if progress is not None:
        kwargs["progress"] = progress
    if normalized == "FOLDER":
        kwargs["source_folder"] = source
    else:
        kwargs["pdf_file"] = source
    return kwargs


def validate_request(
    *,
    mode: str | None,
    source: str,
    output: str,
    max_chars: int,
) -> PipelineRequest:
    normalized = normalize_mode(mode)
    if not source or not source.strip():
        raise PanelInputError("SOURCE_NOT_SELECTED")
    if not output or not output.strip():
        raise PanelInputError("OUTPUT_FOLDER_NOT_SELECTED")
    if not isinstance(max_chars, int) or isinstance(max_chars, bool) or max_chars < 1:
        raise PanelInputError("CHUNK_SIZE_INVALID")

    source_path = Path(source).expanduser()
    output_path = Path(output).expanduser()

    if not source_path.exists():
        raise PanelInputError("SOURCE_NOT_FOUND")
    if normalized == "FOLDER":
        if not source_path.is_dir():
            raise PanelInputError("FOLDER_SELECTION_NOT_DIRECTORY")
    else:
        if not source_path.is_file():
            raise PanelInputError("PDF_SELECTION_NOT_FILE")
        if source_path.suffix.casefold() != ".pdf":
            raise PanelInputError("PDF_SELECTION_EXTENSION_INVALID")

    if not output_path.exists():
        raise PanelInputError("OUTPUT_FOLDER_NOT_FOUND")
    if not output_path.is_dir():
        raise PanelInputError("OUTPUT_SELECTION_NOT_DIRECTORY")

    return PipelineRequest(
        mode=normalized,
        source=str(source_path.resolve()),
        output=str(output_path.resolve()),
        max_chars=max_chars,
    )


def load_c4_pipeline() -> Callable[..., dict[str, Any]]:
    path = Path(C4_PIPELINE_PATH)
    if not path.is_file():
        raise RuntimeError(f"C4_PIPELINE_NOT_FOUND:{path}")

    spec = importlib.util.spec_from_file_location("yolla_c4_pdf_to_csv_pipeline", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("C4_PIPELINE_IMPORT_SPEC_FAILED")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    pipeline = getattr(module, "run_pipeline", None)
    if not callable(pipeline):
        raise RuntimeError("C4_RUN_PIPELINE_NOT_CALLABLE")
    return pipeline


def run_panel_request(
    *,
    mode: str,
    source: str,
    output: str,
    max_chars: int = 12000,
    progress: Callable[[dict[str, Any]], None] | None = None,
    pipeline_loader: Callable[[], Callable[..., dict[str, Any]]] = load_c4_pipeline,
) -> dict[str, Any]:
    request = validate_request(
        mode=mode,
        source=source,
        output=output,
        max_chars=max_chars,
    )
    pipeline = pipeline_loader()
    result = pipeline(
        **build_pipeline_kwargs(
            mode=request.mode,
            source=request.source,
            output=request.output,
            max_chars=request.max_chars,
            progress=progress,
        )
    )
    if not isinstance(result, dict):
        raise RuntimeError("C4_PIPELINE_RESULT_NOT_OBJECT")
    if result.get("status") != "PASS":
        raise RuntimeError(f"C4_PIPELINE_RESULT_NOT_PASS:{result.get('status')}")
    return result


def result_summary(result: dict[str, Any]) -> str:
    return (
        f"완료: PDF {int(result.get('pdf_count', 0))}개 / "
        f"CSV {int(result.get('chunk_count', 0))}개"
    )


if PYSIDE6_AVAILABLE:
    class PipelineThread(QThread):
        event = Signal(dict)
        completed = Signal(dict)
        failed = Signal(str)

        def __init__(self, request: PipelineRequest):
            super().__init__()
            self.request = request

        def run(self) -> None:
            try:
                result = run_panel_request(
                    mode=self.request.mode,
                    source=self.request.source,
                    output=self.request.output,
                    max_chars=self.request.max_chars,
                    progress=self.event.emit,
                )
                self.completed.emit(result)
            except Exception as exc:
                self.failed.emit(f"{type(exc).__name__}: {exc}")


    class MainWindow(QMainWindow):
        def __init__(self):
            super().__init__()
            self.worker: PipelineThread | None = None
            self.input_mode: str | None = None
            self.expected_pdf_count = 0
            self.completed_pdf_count = 0

            self.setWindowTitle("PDF 1차 가공 → CSV")
            self.resize(900, 700)

            root = QWidget()
            self.setCentralWidget(root)
            outer = QVBoxLayout(root)

            source_grid = QGridLayout()
            self.folder_button = QPushButton("폴더 선택")
            self.pdf_button = QPushButton("PDF 파일 선택")
            self.source_edit = QLineEdit()
            self.source_edit.setReadOnly(True)
            self.source_edit.setPlaceholderText("폴더 또는 PDF 파일 1개를 선택하십시오.")
            self.mode_label = QLabel("입력: 미선택")
            source_grid.addWidget(self.folder_button, 0, 0)
            source_grid.addWidget(self.pdf_button, 0, 1)
            source_grid.addWidget(self.mode_label, 0, 2)
            source_grid.addWidget(QLabel("선택 경로"), 1, 0)
            source_grid.addWidget(self.source_edit, 1, 1, 1, 2)
            outer.addLayout(source_grid)

            output_row = QHBoxLayout()
            self.output_button = QPushButton("출력 폴더 선택")
            self.output_edit = QLineEdit()
            self.output_edit.setReadOnly(True)
            self.output_edit.setPlaceholderText("CSV 출력 폴더를 선택하십시오.")
            output_row.addWidget(self.output_button)
            output_row.addWidget(self.output_edit, 1)
            outer.addLayout(output_row)

            chunk_row = QHBoxLayout()
            chunk_row.addWidget(QLabel("조각 크기(최대 문자수)"))
            self.max_chars = QSpinBox()
            self.max_chars.setRange(1000, 200000)
            self.max_chars.setValue(12000)
            self.max_chars.setSingleStep(1000)
            chunk_row.addWidget(self.max_chars)
            chunk_row.addStretch(1)
            outer.addLayout(chunk_row)

            action_row = QHBoxLayout()
            self.start_button = QPushButton("시작")
            self.status_label = QLabel("대기")
            action_row.addWidget(self.start_button)
            action_row.addWidget(self.status_label, 1)
            outer.addLayout(action_row)

            self.progress_bar = QProgressBar()
            self.progress_bar.setRange(0, 100)
            self.progress_bar.setValue(0)
            self.progress_bar.setFormat("%p%")
            outer.addWidget(self.progress_bar)

            outer.addWidget(QLabel("오류"))
            self.error_text = QTextEdit()
            self.error_text.setReadOnly(True)
            self.error_text.setMaximumHeight(100)
            outer.addWidget(self.error_text)

            outer.addWidget(QLabel("진행 / 완료 결과"))
            self.result_text = QTextEdit()
            self.result_text.setReadOnly(True)
            outer.addWidget(self.result_text, 1)

            self.folder_button.clicked.connect(self.pick_folder)
            self.pdf_button.clicked.connect(self.pick_pdf)
            self.output_button.clicked.connect(self.pick_output)
            self.start_button.clicked.connect(self.start)

        def _set_input(self, mode: str, value: str) -> None:
            self.input_mode = mode
            self.source_edit.setText(value)
            label = "폴더" if mode == "FOLDER" else "PDF 파일 1개"
            self.mode_label.setText(f"입력: {label}")

        def pick_folder(self) -> None:
            value = QFileDialog.getExistingDirectory(self, "PDF 폴더 선택")
            if value:
                self._set_input("FOLDER", value)

        def pick_pdf(self) -> None:
            value, _ = QFileDialog.getOpenFileName(
                self,
                "PDF 파일 선택",
                "",
                "PDF Files (*.pdf)",
            )
            if value:
                self._set_input("PDF_FILE", value)

        def pick_output(self) -> None:
            value = QFileDialog.getExistingDirectory(self, "CSV 출력 폴더 선택")
            if value:
                self.output_edit.setText(value)

        def _set_busy(self, busy: bool) -> None:
            self.folder_button.setEnabled(not busy)
            self.pdf_button.setEnabled(not busy)
            self.output_button.setEnabled(not busy)
            self.max_chars.setEnabled(not busy)
            self.start_button.setEnabled(not busy)

        def start(self) -> None:
            if self.worker is not None and self.worker.isRunning():
                return
            try:
                request = validate_request(
                    mode=self.input_mode,
                    source=self.source_edit.text(),
                    output=self.output_edit.text(),
                    max_chars=self.max_chars.value(),
                )
            except PanelInputError as exc:
                message = str(exc)
                self.status_label.setText("입력 오류")
                self.error_text.setPlainText(message)
                QMessageBox.warning(self, "입력 확인", message)
                return

            self.error_text.clear()
            self.result_text.clear()
            self.progress_bar.setValue(0)
            self.status_label.setText("시작 준비")
            self.expected_pdf_count = 0
            self.completed_pdf_count = 0
            self._set_busy(True)

            self.worker = PipelineThread(request)
            self.worker.event.connect(self.on_event)
            self.worker.completed.connect(self.on_completed)
            self.worker.failed.connect(self.on_failed)
            self.worker.finished.connect(self.on_worker_finished)
            self.worker.start()

        def on_event(self, event: dict) -> None:
            stage = str(event.get("stage", ""))
            if stage == "SELECTION_START":
                self.progress_bar.setValue(5)
                self.status_label.setText("입력 확인 중")
            elif stage == "EXTRACTION_START":
                self.expected_pdf_count = max(1, int(event.get("pdf_count", 1)))
                self.progress_bar.setValue(10)
                self.status_label.setText(
                    f"PDF {self.expected_pdf_count}개 추출/OCR 처리 중"
                )
            elif stage == "SOURCE_COMPLETE":
                self.completed_pdf_count += 1
                if self.expected_pdf_count:
                    percent = 10 + int(
                        80
                        * min(self.completed_pdf_count, self.expected_pdf_count)
                        / self.expected_pdf_count
                    )
                    self.progress_bar.setValue(min(percent, 90))
                self.status_label.setText(
                    f"{event.get('source_file', '')}: CSV "
                    f"{event.get('chunk_count', 0)}개 생성"
                )
            elif stage == "COMPLETE":
                self.progress_bar.setValue(95)
                self.status_label.setText("마무리 중")
            self.result_text.append(json.dumps(event, ensure_ascii=False))

        def on_completed(self, result: dict) -> None:
            self.progress_bar.setValue(100)
            summary = result_summary(result)
            self.status_label.setText(summary)
            self.result_text.append(json.dumps(result, ensure_ascii=False, indent=2))
            QMessageBox.information(self, "완료", summary)

        def on_failed(self, error: str) -> None:
            self.status_label.setText("오류")
            self.progress_bar.setValue(0)
            self.error_text.setPlainText(error)
            QMessageBox.critical(self, "처리 오류", error)

        def on_worker_finished(self) -> None:
            worker = self.worker
            self.worker = None
            self._set_busy(False)
            if worker is not None:
                worker.deleteLater()


def main() -> int:
    if not PYSIDE6_AVAILABLE:
        detail = f": {PYSIDE6_IMPORT_ERROR}" if PYSIDE6_IMPORT_ERROR else ""
        print(
            "PySide6 is required. Install it with: pip install PySide6" + detail,
            file=sys.stderr,
        )
        return 2
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
