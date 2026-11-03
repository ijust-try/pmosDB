"""
Run the open questions of the retrieval benchmark through the real chat pipeline with the real model.

    $k = Read-Host "Gemini key" -AsSecureString; $env:GEMINI_API_KEY = [System.Net.NetworkCredential]::new("", $k).Password
    py eval/live_eval.py              # every open question (about 35), paced for the free tier
    py eval/live_eval.py --limit 10   # a quick pass
    py eval/live_eval.py --show       # also print each answer for reading

For each question it reports what happened to the model's answer:

  verified   the answer passed every check (citations exist, each sentence supported by the records it cites, no
             invented identifiers or numbers, no dosing or efficacy words) and is what a visitor would see
  rejected   the checker discarded it; the reason is printed, and the visitor would have seen the matching records
  fallback   the model was unavailable (quota, network), so nothing was learned about that question
  no answer  the model said the records do not answer the question

A rejected answer is either a model that went beyond the evidence (the checker did its job) or a faithful answer the
checker was too strict about. Reading the reasons is how the system prompt and the checker get tuned; the canned
cases in eval/answer_cases.json pin those decisions down so they do not regress.

Questions that are answered without a model (definitions, symptoms, full forms, links, refusals) are not run here:
they are covered exactly by eval/retrieval_cases.json, which needs no key.
"""
import argparse
import json
import os
import shutil
import sys
import tempfile
import time
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

import chat  # noqa: E402
import pmos_data  # noqa: E402
import retrieval  # noqa: E402

PAUSE_S = 5  # the free tier allows roughly 15 requests a minute; stay well under it


def open_questions() -> list[str]:
    cases = json.loads((ROOT / "eval" / "retrieval_cases.json").read_text(encoding="utf-8"))
    seen, out = set(), []
    for c in cases:
        if c["status"] == "ok" and c.get("intent", "qa") == "qa" and c["q"] not in seen:
            seen.add(c["q"])
            out.append(c["q"])
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--limit", type=int, default=0, help="only the first N questions")
    ap.add_argument("--show", action="store_true", help="print each answer")
    ap.add_argument("--out", help="write the full results to this JSON file")
    args = ap.parse_args()

    if not os.environ.get("GEMINI_API_KEY", "").strip():
        print("Set GEMINI_API_KEY first (see the top of this file). The key is only read from the environment and never printed.")
        return 2

    tmp = Path(tempfile.mkdtemp(prefix="pmos_live_"))
    try:
        shutil.copyfile(ROOT / "pmos_knowledge_base.db", tmp / "kb.db")
        pmos_data.DB_PATH = tmp / "kb.db"
        conn = pmos_data.get_connection()
        index = pmos_data.build_index(conn)
        conn.close()

        # the visitor limits protect the live site; here the pacing below is what respects the provider's quota
        chat.MODEL_LIMITER = chat.RateLimiter(per_minute=10_000, per_day=10_000, global_per_day=10_000)
        questions = open_questions()
        if args.limit:
            questions = questions[: args.limit]
        print(f"model: {os.environ.get('GEMINI_MODEL', chat.DEFAULT_MODEL)} | {len(questions)} open questions\n")

        outcomes, rows = Counter(), []
        for n, q in enumerate(questions, 1):
            chat.reset_state()
            started = time.time()
            out = chat.answer(index, q, visitor=f"eval-{n}")
            if out["mode"] == "model":
                kind, detail = "verified", ""
            elif out.get("rejected"):
                kind, detail = "rejected", out["rejected"]
            elif out.get("modelIssue"):
                kind, detail = "fallback", out["modelIssue"]
            else:
                kind, detail = "no answer", ""
            outcomes[kind] += 1
            rows.append({"q": q, "outcome": kind, "detail": detail, "answer": out["answer"], "seconds": round(time.time() - started, 1)})
            print(f"{n:>3}. [{kind:<9}] {q}" + (f"\n       why: {detail}" if detail else ""))
            if args.show:
                print("       " + out["answer"].replace("\n", "\n       ") + "\n")
            if kind == "fallback" and "quota" in detail.lower():
                print("\nThe provider's quota is used up; stopping. Try again later.")
                break
            time.sleep(PAUSE_S)

        total = sum(outcomes.values())
        print("\n" + ", ".join(f"{k} {v}" for k, v in outcomes.items()) + f"  (of {total})")
        judged = outcomes["verified"] + outcomes["rejected"]
        if judged:
            print(f"verified rate among answers the model produced: {outcomes['verified']}/{judged} "
                  f"({100 * outcomes['verified'] // judged}%)")
        if args.out:
            Path(args.out).write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")
            print("results written to", args.out)
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
