"""
Retrieval benchmark on the real knowledge base: eval/retrieval_cases.json.

Each case states what must hold: the status (answerable / refused / no evidence), the records that must be
returned (optionally within the first N), the kind of record that must come first, and the question words the
knowledge base cannot cover. Run with -v to see the per-group scores.
"""
import json
import shutil
import tempfile
import unittest
from collections import defaultdict
from pathlib import Path

import _paths  # noqa: F401
import pmos_data
import retrieval as rt

ROOT = _paths.ROOT
CASES = json.loads((ROOT / "eval" / "retrieval_cases.json").read_text(encoding="utf-8"))


def check(case: dict, result: dict) -> list[str]:
    problems = []
    if result["status"] != case["status"]:
        problems.append(f"status {result['status']!r}, expected {case['status']!r}")
    if "intent" in case and result["intent"] != case["intent"]:
        problems.append(f"intent {result['intent']!r}, expected {case['intent']!r}")
    if "reason" in case and result["reason"] != case["reason"]:
        problems.append(f"reason {result['reason']!r}, expected {case['reason']!r}")
    ids = [r["id"] for r in result["records"]]
    pool = ids[: case["within"]] if "within" in case else ids
    for wanted in case.get("include", []):
        if wanted not in pool:
            problems.append(f"missing {wanted}" + (f" within the first {case['within']}" if "within" in case else ""))
    if "first_type" in case and (not result["records"] or result["records"][0]["type"] != case["first_type"]):
        problems.append(f"first record should be a {case['first_type']}")
    for t in case.get("exclude_types", []):
        if any(r["type"] == t for r in result["records"]):
            problems.append(f"unexpected {t} record")
    for term in case.get("unmatched", []):
        if term not in result["unmatchedTerms"]:
            problems.append(f"{term!r} should be reported as not found")
    for phrase in case.get("answer_contains", []):
        if phrase not in rt.compose_extractive(result):
            problems.append(f"the answer does not say {phrase!r}")
    for term in case.get("not_unmatched", []):
        if term in result["unmatchedTerms"]:
            problems.append(f"{term!r} is filler and should not be reported as missing from the knowledge base")
    if case["status"] != "ok" and result["records"]:
        problems.append("returned records although the question cannot be answered")
    return problems


class RetrievalBenchmark(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="pmos_eval_"))
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

    def test_benchmark(self):
        scores = defaultdict(lambda: [0, 0])
        failures = []
        for case in CASES:
            problems = check(case, rt.retrieve(self.index, case["q"]))
            scores[case["group"]][1] += 1
            if problems:
                failures.append(f"[{case['group']}] {case['q']!r}: " + "; ".join(problems))
            else:
                scores[case["group"]][0] += 1
        report = ", ".join(f"{g} {ok}/{n}" for g, (ok, n) in scores.items())
        print(f"\nretrieval benchmark: {sum(o for o, _ in scores.values())}/{len(CASES)} passed ({report})")
        self.assertEqual(failures, [], "\n" + "\n".join(failures))

    def test_every_question_in_the_benchmark_has_a_unique_text(self):
        questions = [c["q"] for c in CASES]
        self.assertEqual(len(questions), len(set(questions)))

    def test_every_expected_record_exists_in_the_knowledge_base(self):
        known = set(self.index.by_id) | {c["id"] for c in self.index.concepts}
        for case in CASES:
            for wanted in case.get("include", []):
                self.assertIn(wanted, known, f"{wanted} (case {case['q']!r}) is not in the knowledge base")

    def test_answers_to_link_requests_contain_working_looking_source_urls(self):
        for case in [c for c in CASES if c.get("intent") == "link"]:
            result = rt.retrieve(self.index, case["q"])
            text = rt.compose_extractive(result)
            self.assertIn("](/entity/", text, case["q"])
            self.assertRegex(text, r"https://(www\.ncbi\.nlm\.nih\.gov|www\.uniprot\.org|reactome\.org|pubchem\.ncbi\.nlm\.nih\.gov|pubmed\.ncbi\.nlm\.nih\.gov)/",
                             case["q"])


if __name__ == "__main__":
    unittest.main()
