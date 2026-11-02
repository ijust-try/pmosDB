"""
Does the answer checker accept faithful answers and reject unfaithful ones? (eval/answer_cases.json)

The 'model' here is canned text, so this is deterministic and free. It measures the safety net itself:
how often a hallucination would reach a visitor (it should be never, for the failure types listed),
and how often a faithful answer is wrongly thrown away.
"""
import json
import re
import shutil
import tempfile
import unittest
from pathlib import Path

import _paths  # noqa: F401
import chat
import pmos_data
import retrieval as rt

ROOT = _paths.ROOT
CASES = json.loads((ROOT / "eval" / "answer_cases.json").read_text(encoding="utf-8"))


class AnswerCheckBenchmark(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="pmos_answers_"))
        cls.db = cls.tmp / "kb.db"
        shutil.copyfile(ROOT / "pmos_knowledge_base.db", cls.db)
        cls._saved = pmos_data.DB_PATH
        pmos_data.DB_PATH = cls.db
        conn = pmos_data.get_connection()
        cls.index = pmos_data.build_index(conn)
        conn.close()

    @classmethod
    def tearDownClass(cls):
        pmos_data.DB_PATH = cls._saved
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def setUp(self):
        chat.reset_state()

    def fill(self, case):
        records = rt.retrieve(self.index, case["q"])["records"]
        refs = {r["id"]: r["ref"] for r in records}

        def ref(match):
            self.assertIn(match.group(1), refs, f"{match.group(1)} is not retrieved for {case['q']!r}")
            return refs[match.group(1)]

        text = re.sub(r"\{ref:([^}]+)\}", ref, case["a"])
        return re.sub(r"\{score:([^}]+)\}", lambda m: f"{self.index.by_id[m.group(1)]['pcosAssociation']['score']:.2f}", text)

    def run_case(self, case):
        chat.reset_state()  # each case is a separate visitor and question: no shared rate limit, cache or pause
        text = self.fill(case)
        return chat.answer(self.index, case["q"], generate=lambda *a: text, api_key="x")

    def test_faithful_answers_are_accepted(self):
        wrongly_rejected = []
        for case in CASES["accept"]:
            out = self.run_case(case)
            if out["mode"] != "model":
                wrongly_rejected.append(f"{case['q']!r}: {out.get('rejected')}")
        print(f"\nanswer checker: {len(CASES['accept']) - len(wrongly_rejected)}/{len(CASES['accept'])} faithful answers accepted")
        self.assertEqual(wrongly_rejected, [], "\n" + "\n".join(wrongly_rejected))

    def test_unfaithful_answers_are_rejected(self):
        let_through = []
        for case in CASES["reject"]:
            out = self.run_case(case)
            if out["mode"] == "model":
                let_through.append(f"[{case['why']}] {self.fill(case)!r}")
        print(f"answer checker: {len(CASES['reject']) - len(let_through)}/{len(CASES['reject'])} unfaithful answers rejected")
        self.assertEqual(let_through, [], "a hallucination would have reached the visitor:\n" + "\n".join(let_through))

    def test_rejected_answers_fall_back_to_records_with_a_notice(self):
        for case in CASES["reject"][:3]:
            out = self.run_case(case)
            self.assertEqual(out["notice"], chat.MSG_NOT_VERIFIED)
            self.assertIn("](/entity/", out["answer"])
            self.assertTrue(out["records"])

    def test_known_gaps_are_still_gaps(self):
        """Documented limits: if one starts being caught, move it to 'reject'."""
        for case in CASES["known_gaps"]:
            self.assertEqual(self.run_case(case)["mode"], "model", case["why"])


if __name__ == "__main__":
    unittest.main()
