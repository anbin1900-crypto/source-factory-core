from __future__ import annotations

import contextlib
import importlib.util
import io
import subprocess
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
MODULE_PATH = HERE / "standalone_pdf_to_csv_panel.py"
spec = importlib.util.spec_from_file_location("c5_actual_launch_panel", MODULE_PATH)
assert spec and spec.loader
panel = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = panel
spec.loader.exec_module(panel)


class ActualPanelLaunchRepairTests(unittest.TestCase):
    def test_dependency_message_is_user_facing(self):
        message = panel.pyside6_dependency_message()
        self.assertIn("PySide6가 설치되어 있지 않아", message)
        self.assertIn("PDF→CSV 패널을 시작할 수 없습니다", message)

    def test_dependency_message_contains_exact_interpreter(self):
        message = panel.pyside6_dependency_message()
        self.assertIn(str(Path(sys.executable).resolve()), message)

    def test_dependency_message_contains_install_command(self):
        message = panel.pyside6_dependency_message()
        expected = subprocess.list2cmdline(
            [str(Path(sys.executable).resolve()), "-m", "pip", "install", "PySide6"]
        )
        self.assertIn(expected, message)

    def test_dependency_message_contains_relaunch_command(self):
        message = panel.pyside6_dependency_message()
        expected = subprocess.list2cmdline(
            [str(Path(sys.executable).resolve()), str(MODULE_PATH.resolve())]
        )
        self.assertIn(expected, message)

    def test_launch_error_message_is_actionable(self):
        message = panel.launch_error_message(RuntimeError("display-failed"))
        self.assertIn("패널 창을 시작하지 못했습니다", message)
        self.assertIn("RuntimeError: display-failed", message)
        self.assertIn("재실행 명령:", message)

    def test_command_line_quotes_space_paths(self):
        rendered = panel._command_line(["C:/Program Files/Python/python.exe", "x y.py"])
        self.assertIn('"C:/Program Files/Python/python.exe"', rendered)
        self.assertIn('"x y.py"', rendered)

    def test_missing_pyside6_main_returns_exact_blocker(self):
        if panel.PYSIDE6_AVAILABLE:
            self.skipTest("PySide6 is installed; missing-dependency path is not active")
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            code = panel.main()
        text = stderr.getvalue()
        self.assertEqual(code, 2)
        self.assertIn("설치 명령:", text)
        self.assertIn("설치 후 실행:", text)
        self.assertIn("pip install PySide6", text)
        self.assertIn("standalone_pdf_to_csv_panel.py", text)


if __name__ == "__main__":
    unittest.main(verbosity=2)
