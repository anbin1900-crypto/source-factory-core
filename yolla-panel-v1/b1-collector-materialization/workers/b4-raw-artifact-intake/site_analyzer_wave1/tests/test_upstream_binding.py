from pathlib import Path
import json
import unittest

ROOT = Path(__file__).resolve().parents[1]


class UpstreamBindingTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.binding = json.loads((ROOT / "upstream" / "B4_UPSTREAM_BINDING_V1.json").read_text(encoding="utf-8"))
        cls.edge_recipe = json.loads((ROOT / "recipes" / "browser-edge-workflow-recipe.json").read_text(encoding="utf-8"))

    def test_32_a6_exact_head_and_blobs_bound(self):
        a6 = self.binding["a6"]
        self.assertEqual(40, len(a6["head"]))
        self.assertEqual(40, len(a6["adapter_manifest_blob"]))
        self.assertEqual("HYBRID", a6["mode"])
        self.assertIn("failed_step_repair", a6["required_capabilities"])

    def test_33_b3_codegen_actions_mapped(self):
        mapping = self.binding["b4_mapping"]
        for action in self.binding["b3"]["supported_codegen_actions"]:
            if action in {"fill", "selectOption"}:
                continue
            self.assertIn(action, mapping)

    def test_34_edge_recipe_covers_upstream_runtime_mapping(self):
        steps = {item["type"] for item in self.edge_recipe["steps"]}
        required = {"popup", "new_tab", "frame", "download", "load_more", "infinite_scroll", "page_pagination", "cursor_pagination"}
        self.assertTrue(required.issubset(steps))


if __name__ == "__main__":
    unittest.main()
