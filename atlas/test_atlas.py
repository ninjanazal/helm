import sqlite3, sys, tempfile, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import atlas


def names(path, src):
    return [f"{s['kind']}:{s['name']}" for s in atlas.extract_code(atlas.language_for(path), src)["symbols"]]


class Extract(unittest.TestCase):
    def test_gdscript(self):
        src = "extends CharacterBody2D\nclass_name Player\nsignal died(reason)\n\nfunc _ready():\n\tjump(2)\n\nfunc jump(h):\n\tpass\n"
        x = atlas.extract_code("gdscript", src)
        n = [f"{s['kind']}:{s['name']}" for s in x["symbols"]]
        self.assertIn("function:_ready", n); self.assertIn("function:jump", n)
        self.assertTrue(any(s.endswith(":died") for s in n))
        self.assertTrue(any(e["kind"] == "calls" and e["target"] == "jump" for e in x["edges"]))
        self.assertTrue(any(e["kind"] == "extends" and e["target"] == "CharacterBody2D" for e in x["edges"]))

    def test_ts_rust_c_python(self):
        ts = names("a.ts", "export class A { run() { go() } }\nexport function go() {}\nconst f = () => 1\n")
        for w in ("class:A", "method:run", "function:go", "function:f"): self.assertIn(w, ts)
        rs = names("a.rs", "struct S; impl S { fn m(&self) {} }\nfn main() { S.m(); }\n")
        for w in ("struct:S", "method:m", "function:main"): self.assertIn(w, rs)
        self.assertIn("function:add", names("a.c", "int add(int a, int b) { return a + b; }\n"))
        self.assertIn("class:K", names("a.py", "class K:\n    def m(self): pass\n"))

    def test_docs_and_terms(self):
        d = atlas.extract_doc("# Top\ntext\n## Sub\nmore\n# Next\n")["symbols"]
        self.assertEqual(len(d), 3); self.assertEqual((d[0]["start"], d[0]["end"]), (1, 4))
        self.assertEqual(atlas.split_terms("crewSummary sync_herdr HTTPServer"), "crew summary ")


class Index(unittest.TestCase):
    def test_index_query_and_staleness(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "a.py").write_text("def alpha():\n    beta()\n\ndef beta():\n    pass\n")
            c = atlas.db_open(root)
            self.assertEqual(atlas.index(c, root)[1], 1)
            self.assertIn("a.py:1-2 function alpha", atlas.symbol(c, "alpha"))
            self.assertIn("a.py:2 in alpha [parsed]", atlas.neighbors(c, "beta"))
            self.assertIn("a.py:1-", atlas.find(c, "alpha"))  # a.py:1-N
            (root / "b.py").write_text("def gamma(): pass\n")
            self.assertEqual(atlas.pending(c, root), (0, 1, 0))
            self.assertEqual(atlas.index(c, root)[1], 1)
            (root / "a.py").unlink()
            self.assertEqual(atlas.index(c, root)[2], 1)


if __name__ == "__main__":
    unittest.main()
