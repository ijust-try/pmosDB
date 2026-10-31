"""
Weekly synchronisation of the PMOS knowledge base.

    py sync/run_sync.py                 # check upstream versions, re-harvest only if something changed
    py sync/run_sync.py --force         # re-harvest regardless
    py sync/run_sync.py --check-only    # just record upstream versions
    py sync/run_sync.py --offline       # rebuild from the cached data/raw responses (no network harvest)

Scheduled by .github/workflows/weekly-sync.yml: every Wednesday 18:00 IST (12:30 UTC).

Outputs (all written only after the rebuilt database passes validation):
    pmos_knowledge_base.db, data/clean/*.csv, data/raw/*.json, unresolved_mappings.csv,
    seed_entities.csv (new drug-target genes appended), data/sync_state.json
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "backend"))

import drug_targets  # noqa: E402
import harvest  # noqa: E402
import pmos_data  # noqa: E402
import versions  # noqa: E402

STATE_PATH = harvest.ROOT / "data" / "sync_state.json"
DB_PATH = harvest.ROOT / "pmos_knowledge_base.db"
SCHEDULE = {"label": "Every Wednesday, 18:00 IST", "weekday": 2, "hourIst": 18, "minuteIst": 0}
MAX_AGE_DAYS = 28  # rolling sources (NCBI, PubChem, PubMed) are refreshed at least this often
HISTORY_LIMIT = 20


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def load_state() -> dict:
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    return {"schedule": SCHEDULE, "lastSyncedAt": None, "lastCheckedAt": None, "sources": {}, "history": []}


def save_state(state: dict) -> None:
    state["schedule"] = SCHEDULE
    STATE_PATH.write_text(json.dumps(state, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


def decide(state: dict, current: dict, force: bool) -> tuple[bool, str]:
    if force:
        return True, "forced"
    if not state.get("lastSyncedAt"):
        return True, "no previous sync recorded"
    changed = [sid for sid, c in current.items()
               if c["gate"] and c["version"] and state["sources"].get(sid, {}).get("version") != c["version"]]
    if changed:
        return True, "new release from " + ", ".join(changed)
    age = dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(state["lastSyncedAt"])
    if age.days >= MAX_AGE_DAYS:
        return True, f"last sync was {age.days} days ago"
    return False, "no new upstream release"


def run_harvest(offline: bool) -> dict:
    harvest.set_refresh(not offline)
    harvest.unresolved.clear()

    ot_rows = harvest.open_targets_pcos()
    ot_score = {r["gene_symbol"]: r["ot_score"] for r in ot_rows}

    added_pcos = harvest.add_seed_genes(harvest.pcos_seed_genes(ot_rows))
    if added_pcos:
        harvest.log(f"Added {len(added_pcos)} top PCOS-associated genes to seed_entities.csv")

    targets = drug_targets.lookup_all(harvest.read_seeds())
    added = harvest.add_seed_genes({t["gene_symbol"]: "drug target (Open Targets / ChEMBL mechanism of action)"
                                    for t in targets})
    if added:
        harvest.log(f"Added {len(added)} drug-target genes to seed_entities.csv: {', '.join(added)}")

    raw = harvest.harvest(harvest.read_seeds(), ot_score)
    clean = harvest.clean_all(raw)

    # Stage the CSVs first: the backend builds its link tables from them.
    staging = harvest.ROOT / "data" / "clean.staging"
    harvest.write_clean(clean, ot_rows, targets, staging)

    tmp_db = DB_PATH.with_suffix(".new.db")
    counts = harvest.build_database(tmp_db, clean, targets)
    failures = harvest.validate_database(tmp_db)
    if failures:
        tmp_db.unlink(missing_ok=True)
        shutil.rmtree(staging, ignore_errors=True)
        raise SystemExit("Validation failed, nothing was replaced:\n  " + "\n  ".join(failures))

    # Stitch relationship tables with the backend and prove the API index builds on the new data.
    pmos_data.DB_PATH = tmp_db
    pmos_data.CLEAN_DIR = staging
    conn = pmos_data.get_connection()
    pmos_data.init_relationships(conn)
    index = pmos_data.build_index(conn)
    conn.close()
    harvest.log(f"Index built: {len(index.entities)} entities, {len(index.relationships)} relationships")

    os.replace(tmp_db, DB_PATH)
    harvest.promote_clean(staging)
    return {"tables": counts, "entities": len(index.entities), "relationships": len(index.relationships),
            "unresolved": len(harvest.unresolved)}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--check-only", action="store_true")
    ap.add_argument("--offline", action="store_true", help="use cached raw responses; no re-harvest from the network")
    args = ap.parse_args()

    state = load_state()
    current = versions.check_all()
    for sid, c in current.items():
        harvest.log(f"  {sid:14s} {c['version']}")
    run, reason = decide(state, current, args.force or args.offline)
    started = now_iso()
    state["lastCheckedAt"] = started
    harvest.log(f"Decision: {'SYNC' if run and not args.check_only else 'skip'} ({reason})")

    entry = {"startedAt": started, "outcome": "checked", "reason": reason}
    if run and not args.check_only:
        entry["result"] = run_harvest(args.offline)
        # --offline reuses cached responses, so it must not claim the data is freshly synced
        entry["outcome"] = "rebuilt-from-cache" if args.offline else "synced"
        if not args.offline:
            state["lastSyncedAt"] = now_iso()
    for sid, c in current.items():
        prev = state["sources"].get(sid, {})
        state["sources"][sid] = {
            "version": c["version"] or prev.get("version"),
            "checkedAt": c["checkedAt"],
            "syncedAt": state["lastSyncedAt"] if entry["outcome"] == "synced" else prev.get("syncedAt"),
        }
    entry["finishedAt"] = now_iso()
    state["history"] = ([entry] + state.get("history", []))[:HISTORY_LIMIT]
    save_state(state)
    return 0


if __name__ == "__main__":
    sys.exit(main())
