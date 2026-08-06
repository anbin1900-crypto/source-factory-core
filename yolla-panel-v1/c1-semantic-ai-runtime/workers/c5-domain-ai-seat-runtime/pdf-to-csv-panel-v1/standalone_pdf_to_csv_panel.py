#!/usr/bin/env python3
"""Thin PySide6 panel for GPT-preprocessing PDF -> CSV conversion."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Callable

HERE = Path(__file__).resolve().parent
WORKERS = HERE.parents[1]
C4 = WORKERS / "c4-evidence-knowledge-candidate" / "pdf-to-csv-panel-v1"
if str(C4) not in sys.path:
    sys.path.insert(0, str(C4))

from pdf_to_csv_pipeline_orchestrator import run_pipeline


def build_pipeline_kwargs(
    *,
    mode: str,
    source: str,
    output: str,
    max_chars: int,
    progress: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    normalized = str(mode).upper().strip()
    if normalized == "SINGLE_PDF":
        normalized = "PDF_FILE"
    if normalized not in {"FOLDER", "PDF_FILE"}:
        raise ValueError(f"PANEL_INPUT_MODE_INVALID:{mode}")
    if not isinstance(source, str) or not source.strip():
        raise ValueError("PANEL_SOURCE_REQUIRED")
    if not isinstance(output, str) or not output.strip():
        raise ValueError("PANEL_OUTPUT_REQUIRED")
    if not isinstance(max_chars, int) or isinstance(max_chars, bool) or max_chars < 1:
        raise ValueError("PANEL_MAX_CHARS_INVALID")
    kwargs: dict[str, Any] = {
        "output_folder": output,
        "max_chars": max_chars,
        "progress": progress,
    }
    if normalized == "FOLDER":
        kwargs["source_folder"] = source
    else:
        kwargs["pdf_file"] = source
    return kwargs


def run_panel_request(
    *,
    mode: str,
    source: str,
    output: str,
    max_chars: int = 12000,
    progress: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    """Execute exactly the same Panel -> Pipeline call path without requiring a GUI."""
    return run_pipeline(
        **build_pipeline_kwargs(
            mode=mode,
            source=source,
            output=output,
            max_chars=max_chars,
            progress=progress,
        )
    )


try:
    from PySide6.QtCore import QThread, Signal
    from PySide6.QtWidgets import (
        QApplication,
        QButtonGroup,
        QFileDialog,
        QGridLayout,
        QHBoxLayout,
        QLabel,
        QLineEdit,
        QMainWindow,
        QMessageBox,
        QPushButton,
        QRadioButton,
        QSpinBox,
        QTextEdit,
        QVBoxLayout,
        QWidget,
    )
    PYSIDE6_AVAILABLE = True
    PYSIDE6_IMPORT_ERROR: Exception | None = None
except ImportError as exc:
    PYSIDE6_AVAILABLE = False
    PYSIDE6_IMPORT_ERROR = exc


if PYSIDE6_AVAILABLE:
    class PipelineThread(QThread):
        event = Signal(dict)
        completed = Signal(dict)
        failed = Signal(str)

        def __init__(self, *, mode: str, source: str, output: str, max_chars: int):
            super().__init__()
            self.mode = mode
            self.source = source
            self.output = output
            self.max_chars = max_chars

        def run(self) -> None:
            try:
                self.completed.emit(
                    run_panel_request(
                        mode=self.mode,
                        source=self.source,
                        output=self.output,
                        max_chars=self.max_chars,
                        progress=self.event.emit,
                    )
                )
            except Exception as exc:
                self.failed.emit(str(exc))


    class MainWindow(QMainWindow):
        def __init__(self):
            super().__init__()
            self.worker: PipelineThread | None = None
            self.setWindowTitle("PDF 1차 가공 → CSV")
            self.resize(820, 560)

            root = QWidget()
            self.setCentralWidget(root)
            outer = QVBoxLayout(root)

            mode_row = QHBoxLayout()
            self.folder_mode = QRadioButton("폴더 전체")
            self.pdf_mode = QRadioButton("PDF 파일 1개")
            self.folder_mode.setChecked(True)
            modes = QButtonGroup(self)
            modes.addButton(self.folder_mode)
            modes.addButton(self.pdf_mode)
            mode_row.addWidget(QLabel("입력:"))
            mode_row.addWidget(self.folder_mode)
            mode_row.addWidget(self.pdf_mode)
            mode_row.addStretch(1)
            outer.addLayout(mode_row)

            grid = QGridLayout()
            self.source_edit = QLineEdit()
            self.output_edit = QLineEdit()
            self.source_button = QPushButton("찾기")
            self.output_button = QPushButton("찾기")
            grid.addWidget(QLabel("원본"), 0, 0)
            grid.addWidget(self.source_edit, 0, 1)
            grid.addWidget(self.source_button, 0, 2)
            grid.addWidget(QLabel("출력 폴더"), 1, 0)
            grid.addWidget(self.output_edit, 1, 1)
            grid.addWidget(self.output_button, 1, 2)
            outer.addLayout(grid)

            chunk_row = QHBoxLayout()
            chunk_row.addWidget(QLabel("CSV 조각 최대 문자수"))
            self.max_chars = QSpinBox()
            self.max_chars.setRange(1000, 200000)
            self.max_chars.setValue(12000)
            self.max_chars.setSingleStep(1000)
            chunk_row.addWidget(self.max_chars)
            chunk_row.addStretch(1)
            outer.addLayout(chunk_row)

            action_row = QHBoxLayout()
            self.start_button = QPushButton("1차 가공 시작")
            self.status_label = QLabel("대기")
            action_row.addWidget(self.start_button)
            action_row.addWidget(self.status_label)
            action_row.addStretch(1)
            outer.addLayout(action_row)

            self.log = QTextEdit()
            self.log.setReadOnly(True)
            outer.addWidget(self.log)

            self.source_button.clicked.connect(self.pick_source)
            self.output_button.clicked.connect(self.pick_output)
            self.start_button.clicked.connect(self.start)

        def pick_source(self) -> None:
            if self.folder_mode.isChecked():
                value = QFileDialog.getExistingDirectory(self, "PDF 폴더 선택")
            else:
                value, _ = QFileDialog.getOpenFileName(
                    self, "PDF 파일 선택", "", "PDF Files (*.pdf)"
                )
            if value:
                self.source_edit.setText(value)

        def pick_output(self) -> None:
            value = QFileDialog.getExistingDirectory(self, "CSV 출력 폴더 선택")
            if value:
                self.output_edit.setText(value)

        def start(self) -> None:
            source = self.source_edit.text().strip()
            output = self.output_edit.text().strip()
            if not source or not output:
                QMessageBox.warning(self, "입력 필요", "원본과 출력 폴더를 선택하십시오.")
                return
            mode = "FOLDER" if self.folder_mode.isChecked() else "PDF_FILE"
            self.start_button.setEnabled(False)
            self.status_label.setText("처리 중")
            self.log.clear()
            self.worker = PipelineThread(
                mode=mode,
                source=source,
                output=output,
                max_chars=self.max_chars.value(),
            )
            self.worker.event.connect(self.on_event)
            self.worker.completed.connect(self.on_completed)
            self.worker.failed.connect(self.on_failed)
            self.worker.start()

        def on_event(self, event: dict) -> None:
            stage = event.get("stage", "")
            if stage == "EXTRACTION_START":
                self.status_label.setText(f"PDF {event.get('pdf_count', 0)}개 추출 중")
            elif stage == "SOURCE_COMPLETE":
                self.status_label.setText(
                    f"{event.get('source_file', '')}: CSV {event.get('chunk_count', 0)}개"
                )
            elif stage == "COMPLETE":
                self.status_label.setText("마무리 중")
            self.log.append(json.dumps(event, ensure_ascii=False))

        def on_completed(self, result: dict) -> None:
            self.start_button.setEnabled(True)
            self.status_label.setText(
                f"완료: PDF {result['pdf_count']}개 / CSV {result['chunk_count']}개"
            )
            self.log.append(json.dumps(result, ensure_ascii=False, indent=2))
            QMessageBox.information(self, "완료", self.status_label.text())

        def on_failed(self, error: str) -> None:
            self.start_button.setEnabled(True)
            self.status_label.setText("오류")
            self.log.append(error)
            QMessageBox.critical(self, "처리 오류", error)


def main() -> int:
    if not PYSIDE6_AVAILABLE:
        print(
            f"PySide6 is required for GUI launch: {PYSIDE6_IMPORT_ERROR}",
            file=sys.stderr,
        )
        return 2
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
