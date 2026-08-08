from __future__ import annotations

from dataclasses import replace
import re
import unittest
import unicodedata

from output_path_policy import (
    ChunkOutputPlan,
    OutputPathPolicyError,
    SourceOutputPlan,
    build_chunk_output_plan,
    build_source_output_plan,
    normalize_source_relative_path,
    plan_chunk_outputs,
    plan_source_outputs,
    safe_windows_component,
    validate_batch_output_uniqueness,
)


class ErrorCodeMixin:
    def assertPolicyError(self, code: str, callable_obj, *args, **kwargs):
        with self.assertRaises(OutputPathPolicyError) as ctx:
            callable_obj(*args, **kwargs)
        self.assertEqual(code, ctx.exception.code)
        return ctx.exception


class NormalizeSourceRelativePathTests(ErrorCodeMixin, unittest.TestCase):
    def test_windows_separators_become_posix(self):
        self.assertEqual("folder/sub/document.pdf", normalize_source_relative_path(r"folder\sub\document.pdf").as_posix())

    def test_dot_segments_are_canonicalized(self):
        self.assertEqual("folder/document.pdf", normalize_source_relative_path("./folder/./document.pdf").as_posix())

    def test_repeated_separators_are_canonicalized(self):
        self.assertEqual("folder/document.pdf", normalize_source_relative_path("folder///document.pdf").as_posix())

    def test_uppercase_pdf_suffix_is_allowed(self):
        self.assertEqual("A.PDF", normalize_source_relative_path("A.PDF").as_posix())

    def test_posix_absolute_path_is_rejected(self):
        self.assertPolicyError("SOURCE_PATH_ABSOLUTE", normalize_source_relative_path, "/folder/a.pdf")

    def test_windows_drive_path_is_rejected(self):
        self.assertPolicyError("SOURCE_PATH_ABSOLUTE", normalize_source_relative_path, r"C:\folder\a.pdf")

    def test_unc_path_is_rejected(self):
        self.assertPolicyError("SOURCE_PATH_ABSOLUTE", normalize_source_relative_path, r"\\server\share\a.pdf")

    def test_parent_traversal_is_rejected(self):
        self.assertPolicyError("SOURCE_PATH_TRAVERSAL", normalize_source_relative_path, "folder/../a.pdf")

    def test_empty_path_is_rejected(self):
        self.assertPolicyError("SOURCE_PATH_EMPTY", normalize_source_relative_path, "   ")

    def test_non_pdf_path_is_rejected(self):
        self.assertPolicyError("SOURCE_NOT_PDF", normalize_source_relative_path, "folder/a.txt")

    def test_nul_is_rejected(self):
        self.assertPolicyError("SOURCE_PATH_NUL", normalize_source_relative_path, "folder/a\x00.pdf")

    def test_unicode_is_nfc_normalized(self):
        decomposed = "folder/" + unicodedata.normalize("NFD", "한글") + ".pdf"
        actual = normalize_source_relative_path(decomposed).as_posix()
        self.assertEqual("folder/한글.pdf", actual)
        self.assertEqual(actual, unicodedata.normalize("NFC", actual))


class SafeWindowsComponentTests(ErrorCodeMixin, unittest.TestCase):
    def test_forbidden_characters_are_replaced(self):
        self.assertEqual("a_b_c_d_e_f_g_h_i_", safe_windows_component('a<b>c:d"e/f\\g|h?i*'))

    def test_whitespace_is_collapsed(self):
        self.assertEqual("a b c", safe_windows_component("  a\t b\n c  "))

    def test_trailing_dots_and_spaces_are_removed(self):
        self.assertEqual("report", safe_windows_component("report...   "))

    def test_reserved_con_is_prefixed(self):
        self.assertEqual("_CON", safe_windows_component("CON"))

    def test_reserved_con_extension_is_prefixed(self):
        self.assertEqual("_con.txt", safe_windows_component("con.txt"))

    def test_reserved_com9_is_prefixed(self):
        self.assertEqual("_COM9", safe_windows_component("COM9"))

    def test_empty_after_sanitization_becomes_underscore(self):
        self.assertEqual("_", safe_windows_component("...   "))

    def test_long_component_is_deterministically_shortened(self):
        value = "가" * 100
        first = safe_windows_component(value, max_length=40)
        second = safe_windows_component(value, max_length=40)
        self.assertEqual(first, second)
        self.assertLessEqual(len(first), 40)
        self.assertRegex(first, r"--[0-9a-f]{12}$")

    def test_too_small_max_length_is_rejected(self):
        self.assertPolicyError("COMPONENT_MAX_LENGTH_TOO_SMALL", safe_windows_component, "abc", max_length=10)


class SourceOutputPlanTests(ErrorCodeMixin, unittest.TestCase):
    def test_source_plan_preserves_canonical_relative_path(self):
        plan = build_source_output_plan(r"법령\소방\위험물.pdf", 1)
        self.assertEqual("법령/소방/위험물.pdf", plan.source_relative_path)
        self.assertEqual("법령/소방", plan.source_parent_relative_path)
        self.assertEqual("위험물.pdf", plan.source_file)
        self.assertEqual("위험물", plan.source_stem)

    def test_source_sequence_is_zero_padded_in_output_dir(self):
        plan = build_source_output_plan("a.pdf", 12)
        self.assertIn("source-00000012--", plan.output_relative_dir)

    def test_source_digest_is_full_sha256(self):
        plan = build_source_output_plan("a.pdf", 1)
        self.assertRegex(plan.source_path_sha256, r"^[0-9a-f]{64}$")
        self.assertTrue(plan.output_relative_dir.endswith(plan.source_path_sha256))

    def test_same_input_produces_same_plan(self):
        self.assertEqual(build_source_output_plan("x/a.pdf", 1), build_source_output_plan("x/a.pdf", 1))

    def test_same_stem_in_different_folders_produces_different_output(self):
        left = build_source_output_plan("left/a.pdf", 1)
        right = build_source_output_plan("right/a.pdf", 2)
        self.assertNotEqual(left.output_relative_dir.casefold(), right.output_relative_dir.casefold())

    def test_sanitized_parent_collision_is_disambiguated(self):
        left = build_source_output_plan("a?/doc.pdf", 1)
        right = build_source_output_plan("a*/doc.pdf", 2)
        self.assertNotEqual(left.output_relative_dir.casefold(), right.output_relative_dir.casefold())

    def test_source_no_zero_is_rejected(self):
        self.assertPolicyError("SOURCE_NO_OUT_OF_RANGE", build_source_output_plan, "a.pdf", 0)

    def test_boolean_source_no_is_rejected(self):
        self.assertPolicyError("SOURCE_NO_TYPE_INVALID", build_source_output_plan, "a.pdf", True)

    def test_tiny_output_budget_is_rejected(self):
        self.assertPolicyError("OUTPUT_PATH_BUDGET_TOO_SMALL", build_source_output_plan, "a.pdf", 1, max_output_relative_chars=50)

    def test_output_path_budget_is_enforced(self):
        path = "/".join(["folder" * 5] * 6 + ["document.pdf"])
        self.assertPolicyError("OUTPUT_RELATIVE_PATH_TOO_LONG", build_source_output_plan, path, 1, max_output_relative_chars=140)

    def test_source_plan_to_dict_is_stable(self):
        plan = build_source_output_plan("x/a.pdf", 1)
        payload = plan.to_dict()
        self.assertEqual(plan.source_relative_path, payload["source_relative_path"])
        self.assertEqual(plan.output_relative_dir, payload["output_relative_dir"])


class SourceBatchTests(ErrorCodeMixin, unittest.TestCase):
    def test_contiguous_source_inventory_is_preserved(self):
        sources = [(1, "a.pdf"), (2, "sub/b.pdf"), (3, "sub/c.pdf")]
        plans = plan_source_outputs(sources)
        self.assertEqual([1, 2, 3], [plan.source_no for plan in plans])
        self.assertEqual([item[1] for item in sources], [plan.source_relative_path for plan in plans])

    def test_noncontiguous_sequence_is_rejected(self):
        self.assertPolicyError("SOURCE_SEQUENCE_NOT_CONTIGUOUS", plan_source_outputs, [(1, "a.pdf"), (3, "b.pdf")])

    def test_duplicate_source_no_is_rejected_when_contiguous_check_disabled(self):
        self.assertPolicyError(
            "DUPLICATE_SOURCE_NO",
            plan_source_outputs,
            [(1, "a.pdf"), (1, "b.pdf")],
            require_contiguous_sequence=False,
        )

    def test_duplicate_path_is_rejected_under_windows_casefold(self):
        self.assertPolicyError("DUPLICATE_SOURCE_PATH", plan_source_outputs, [(1, "A.pdf"), (2, "a.PDF")])

    def test_empty_inventory_is_rejected(self):
        self.assertPolicyError("SOURCE_INVENTORY_EMPTY", plan_source_outputs, [])

    def test_150_source_paths_are_unique_and_deterministic(self):
        inventory = [(i, f"지역-{i % 10:02d}/문서-{i:03d}.pdf") for i in range(1, 151)]
        first = plan_source_outputs(inventory)
        second = plan_source_outputs(inventory)
        self.assertEqual(first, second)
        self.assertEqual(150, len({plan.output_relative_dir.casefold() for plan in first}))


class ChunkOutputPlanTests(ErrorCodeMixin, unittest.TestCase):
    def setUp(self):
        self.source = build_source_output_plan("folder/report.pdf", 7)

    def test_filename_contains_source_chunk_and_page_sequence(self):
        plan = build_chunk_output_plan(self.source, 3, 5, 8)
        self.assertIn("source-00000007", plan.csv_filename)
        self.assertIn("chunk-00000003", plan.csv_filename)
        self.assertIn("pages-00000005-00000008", plan.csv_filename)
        self.assertTrue(plan.csv_filename.endswith(".csv"))

    def test_output_path_is_under_source_output_dir(self):
        plan = build_chunk_output_plan(self.source, 1, 1, 1)
        self.assertTrue(plan.output_relative_path.startswith(self.source.output_relative_dir + "/"))

    def test_filename_has_no_windows_forbidden_characters(self):
        source = build_source_output_plan('bad/name?<x>.pdf', 1)
        plan = build_chunk_output_plan(source, 1, 1, 2)
        self.assertIsNone(re.search(r'[<>:"/\\|?*]', plan.csv_filename))

    def test_chunk_no_zero_is_rejected(self):
        self.assertPolicyError("CHUNK_NO_OUT_OF_RANGE", build_chunk_output_plan, self.source, 0, 1, 1)

    def test_page_start_zero_is_rejected(self):
        self.assertPolicyError("PAGE_START_OUT_OF_RANGE", build_chunk_output_plan, self.source, 1, 0, 1)

    def test_page_end_zero_is_rejected(self):
        self.assertPolicyError("PAGE_END_OUT_OF_RANGE", build_chunk_output_plan, self.source, 1, 1, 0)

    def test_reversed_page_range_is_rejected(self):
        self.assertPolicyError("PAGE_RANGE_REVERSED", build_chunk_output_plan, self.source, 1, 3, 2)

    def test_wrong_source_plan_type_is_rejected(self):
        self.assertPolicyError("SOURCE_PLAN_TYPE_INVALID", build_chunk_output_plan, {}, 1, 1, 1)

    def test_chunk_to_dict_preserves_binding(self):
        plan = build_chunk_output_plan(self.source, 1, 1, 2)
        payload = plan.to_dict()
        self.assertEqual(self.source.source_relative_path, payload["source_relative_path"])
        self.assertEqual(self.source.source_path_sha256, payload["source_path_sha256"])


class ChunkBatchTests(ErrorCodeMixin, unittest.TestCase):
    def setUp(self):
        self.source = build_source_output_plan("folder/report.pdf", 1)

    def test_chunk_sequence_and_page_order_are_preserved(self):
        plans = plan_chunk_outputs(self.source, [(1, 1, 2), (2, 2, 4), (3, 5, 8)])
        self.assertEqual([1, 2, 3], [plan.chunk_no for plan in plans])
        self.assertEqual(sorted(plan.csv_filename for plan in plans), [plan.csv_filename for plan in plans])

    def test_noncontiguous_chunk_sequence_is_rejected(self):
        self.assertPolicyError("CHUNK_SEQUENCE_NOT_CONTIGUOUS", plan_chunk_outputs, self.source, [(1, 1, 1), (3, 2, 2)])

    def test_page_start_regression_is_rejected(self):
        self.assertPolicyError("PAGE_ORDER_NOT_PRESERVED", plan_chunk_outputs, self.source, [(1, 3, 3), (2, 2, 4)])

    def test_empty_chunk_inventory_is_rejected(self):
        self.assertPolicyError("CHUNK_INVENTORY_EMPTY", plan_chunk_outputs, self.source, [])

    def test_chunk_paths_are_unique_for_large_sequence(self):
        chunks = [(i, i, i) for i in range(1, 1001)]
        plans = plan_chunk_outputs(self.source, chunks)
        self.assertEqual(1000, len({plan.output_relative_path.casefold() for plan in plans}))


class BatchUniquenessTests(ErrorCodeMixin, unittest.TestCase):
    def test_valid_combined_batch(self):
        sources = plan_source_outputs([(1, "a.pdf"), (2, "nested/a.pdf")])
        chunks = plan_chunk_outputs(sources[0], [(1, 1, 1), (2, 2, 2)])
        chunks += plan_chunk_outputs(sources[1], [(1, 1, 3)])
        result = validate_batch_output_uniqueness(sources, chunks)
        self.assertEqual(2, result["source_plan_count"])
        self.assertEqual(3, result["chunk_plan_count"])
        self.assertEqual(0, result["collision_count"])
        self.assertTrue(result["valid"])

    def test_duplicate_chunk_path_is_rejected(self):
        source = build_source_output_plan("a.pdf", 1)
        chunk = build_chunk_output_plan(source, 1, 1, 1)
        self.assertPolicyError("CHUNK_OUTPUT_COLLISION", validate_batch_output_uniqueness, [source], [chunk, chunk])

    def test_chunk_source_binding_is_required(self):
        source_a = build_source_output_plan("a.pdf", 1)
        source_b = build_source_output_plan("b.pdf", 2)
        chunk_b = build_chunk_output_plan(source_b, 1, 1, 1)
        self.assertPolicyError("CHUNK_SOURCE_BINDING_MISSING", validate_batch_output_uniqueness, [source_a], [chunk_b])

    def test_case_insensitive_directory_collision_is_rejected(self):
        source_a = build_source_output_plan("a.pdf", 1)
        source_b = replace(build_source_output_plan("b.pdf", 2), output_relative_dir=source_a.output_relative_dir.upper())
        self.assertPolicyError("OUTPUT_DIRECTORY_COLLISION", validate_batch_output_uniqueness, [source_a, source_b], [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
