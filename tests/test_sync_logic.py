import datetime as dt
import unittest
from unittest import mock

import _paths  # noqa: F401
import drug_targets
import harvest
import pmos_data
import run_sync

UTC = dt.timezone.utc


def ago(days: float) -> str:
    return (dt.datetime.now(UTC) - dt.timedelta(days=days)).isoformat(timespec="seconds")


def versions(**overrides):
    base = {
        "uniprot": ("2026_03", True), "reactome": ("98", True), "open-targets": ("26.09", True),
        "ncbi-gene": ("2026/10/30", False), "pubchem": ("2026/10/30", False),
    }
    base.update(overrides)
    return {sid: {"version": v, "gate": gate, "checkedAt": ago(0)} for sid, (v, gate) in base.items()}


def state(**overrides):
    st = {
        "lastSyncedAt": ago(7),
        "sources": {"uniprot": {"version": "2026_03"}, "reactome": {"version": "98"}, "open-targets": {"version": "26.09"}},
    }
    st.update(overrides)
    return st


class SyncDecisionTests(unittest.TestCase):
    def test_nothing_new_and_recent_skips(self):
        run, reason = run_sync.decide(state(), versions(), force=False)
        self.assertFalse(run)

    def test_force_always_runs(self):
        self.assertEqual(run_sync.decide(state(), versions(), force=True), (True, "forced"))

    def test_first_ever_run_syncs(self):
        run, _ = run_sync.decide(state(lastSyncedAt=None), versions(), force=False)
        self.assertTrue(run)

    def test_new_release_of_a_gated_source_syncs(self):
        run, reason = run_sync.decide(state(), versions(uniprot=("2026_04", True)), force=False)
        self.assertTrue(run)
        self.assertIn("uniprot", reason)

    def test_rolling_sources_never_trigger_alone(self):
        st = state()
        st["sources"]["ncbi-gene"] = {"version": "2026/10/01"}
        run, _ = run_sync.decide(st, versions(**{"ncbi-gene": ("2026/10/30", False)}), force=False)
        self.assertFalse(run)

    def test_failed_version_check_does_not_trigger(self):
        run, _ = run_sync.decide(state(), versions(uniprot=(None, True)), force=False)
        self.assertFalse(run)

    def test_old_sync_triggers_refresh_of_rolling_sources(self):
        run, reason = run_sync.decide(state(lastSyncedAt=ago(run_sync.MAX_AGE_DAYS + 1)), versions(), force=False)
        self.assertTrue(run)
        self.assertIn("days ago", reason)


class ScheduleTests(unittest.TestCase):
    schedule = run_sync.SCHEDULE
    ist = pmos_data.IST

    def next_run(self, y, m, d, hh, mm):
        return pmos_data.next_scheduled_run(self.schedule, dt.datetime(y, m, d, hh, mm, tzinfo=self.ist))

    def test_schedule_is_wednesday_1800_ist(self):
        self.assertEqual((self.schedule["weekday"], self.schedule["hourIst"], self.schedule["minuteIst"]), (2, 18, 0))

    def test_just_before_the_run_is_the_same_day(self):
        self.assertEqual(self.next_run(2026, 11, 4, 17, 59), "2026-11-04T18:00:00+05:30")  # a Wednesday

    def test_just_after_the_run_is_next_week(self):
        self.assertEqual(self.next_run(2026, 11, 4, 18, 1), "2026-11-11T18:00:00+05:30")

    def test_other_days_roll_forward_to_wednesday(self):
        self.assertEqual(self.next_run(2026, 11, 5, 9, 0), "2026-11-11T18:00:00+05:30")  # Thursday
        self.assertEqual(self.next_run(2026, 11, 1, 9, 0), "2026-11-04T18:00:00+05:30")  # Sunday

    def test_utc_input_is_converted_to_ist(self):
        # Wed 12:00 UTC = 17:30 IST, so still before 18:00 IST the same day
        now = dt.datetime(2026, 11, 4, 12, 0, tzinfo=UTC)
        self.assertEqual(pmos_data.next_scheduled_run(self.schedule, now), "2026-11-04T18:00:00+05:30")

    def test_cron_in_workflow_matches_schedule(self):
        # 18:00 IST == 12:30 UTC on Wednesdays (IST is UTC+5:30)
        text = (_paths.ROOT / ".github" / "workflows" / "weekly-sync.yml").read_text(encoding="utf-8")
        self.assertIn('cron: "30 12 * * 3"', text)


class StalenessTests(unittest.TestCase):
    def status(self, days):
        st = {"schedule": run_sync.SCHEDULE, "lastSyncedAt": ago(days), "lastCheckedAt": ago(days), "sources": {},
              "history": [{"outcome": "synced", "reason": "x"}]}
        with mock.patch.object(pmos_data, "load_sync_state", return_value=st):
            return pmos_data.get_sync_status()

    def test_recent_sync_is_not_stale(self):
        self.assertFalse(self.status(8)["stale"])

    def test_overdue_sync_is_flagged_stale(self):
        s = self.status(pmos_data.STALE_AFTER_DAYS + 2)
        self.assertTrue(s["stale"])
        self.assertGreater(s["daysSinceSync"], pmos_data.STALE_AFTER_DAYS)

    def test_no_state_means_no_status(self):
        with mock.patch.object(pmos_data, "load_sync_state", return_value={"schedule": None, "history": []}):
            self.assertIsNone(pmos_data.get_sync_status())


def fake_open_targets(search_hits, moa_rows):
    """Replaces harvest.fetch for Open Targets drug search + drug detail."""

    def fetch(source, query, url, params=None, json_body=None, delay=0.4):
        variables = json_body["variables"]
        if "q" in variables:
            response = {"data": {"search": {"hits": search_hits}}}
        else:
            response = {"data": {"drug": {"id": variables["id"], "mechanismsOfAction": {"rows": moa_rows}}}}
        return {"retrieved_at": "2026-10-31T00:00:00+00:00", "response": response}

    return fetch


def moa(name, action, symbols):
    return {"mechanismOfAction": name, "actionType": action,
            "targets": [{"id": f"ENSG{i}", "approvedSymbol": s} for i, s in enumerate(symbols)]}


class DrugTargetTests(unittest.TestCase):
    def setUp(self):
        harvest.unresolved.clear()

    def lookup(self, drug, hits, rows):
        with mock.patch.object(drug_targets.harvest, "fetch", fake_open_targets(hits, rows)):
            return drug_targets.lookup_targets(drug, drug.lower())

    def test_exact_name_match_returns_targets_with_provenance(self):
        rows = self.lookup("Flutamide", [{"id": "CHEMBL806", "name": "FLUTAMIDE"}], [moa("AR antagonist", "ANTAGONIST", ["ar"])])
        self.assertEqual(len(rows), 1)
        r = rows[0]
        self.assertEqual((r["gene_symbol"], r["chembl_id"], r["source"]), ("AR", "CHEMBL806", "Open Targets"))

    def test_top_hit_for_a_different_drug_is_rejected(self):
        hits = [{"id": "CHEMBL3137320", "name": "TALAZOPARIB"}, {"id": "CHEMBL409", "name": "BICALUTAMIDE"}]
        rows = self.lookup("Bicalutamide", hits, [moa("AR antagonist", "ANTAGONIST", ["AR"])])
        self.assertEqual([r["chembl_id"] for r in rows], ["CHEMBL409"])  # picked by name, not by rank

    def test_no_name_match_gives_no_targets_and_is_logged(self):
        rows = self.lookup("Myo-inositol", [{"id": "CHEMBL1222251", "name": "INOSITOL"}], [])
        self.assertEqual(rows, [])
        self.assertEqual(harvest.unresolved[0]["entity_type"], "therapeutic")

    def test_drug_with_no_mechanism_gives_no_targets(self):
        self.assertEqual(self.lookup("Foo", [{"id": "CHEMBL1", "name": "FOO"}], []), [])

    def test_protein_complex_is_not_expanded(self):
        subunits = [f"NDUFA{i}" for i in range(drug_targets.MAX_TARGETS_PER_MECHANISM + 1)]
        rows = self.lookup("Metformin", [{"id": "CHEMBL1431", "name": "METFORMIN"}],
                           [moa("Complex I inhibitor", "INHIBITOR", subunits), moa("GPD2 inhibitor", "INHIBITOR", ["GPD2"])])
        self.assertEqual([r["gene_symbol"] for r in rows], ["GPD2"])
        self.assertTrue(any("not expanded" in u["reason"] for u in harvest.unresolved))


class SeedTests(unittest.TestCase):
    CLINICAL_ONLY = "clinical:0.69"
    GENETIC = "genetic_association:0.80;literature:0.50"

    @classmethod
    def ot(cls, n, weak=()):
        return [{"gene_symbol": f"G{i}", "ot_rank": i, "ot_score": 1 - i / 100,
                 "datatypes": cls.CLINICAL_ONLY if i in weak else cls.GENETIC}
                for i in range(1, n + 1)]

    def test_top_n_pcos_genes_become_seeds_in_rank_order(self):
        seeds = harvest.pcos_seed_genes(self.ot(5), 3)
        self.assertEqual(list(seeds), ["G1", "G2", "G3"])
        self.assertIn("rank 1", seeds["G1"])

    def test_clinical_only_genes_are_skipped_and_replaced_by_the_next_ranked(self):
        # e.g. mitochondrial complex I subunits whose "association" is propagated from metformin trials
        seeds = harvest.pcos_seed_genes(self.ot(6, weak={2, 3}), 3)
        self.assertEqual(list(seeds), ["G1", "G4", "G5"])

    def test_clinical_plus_substantive_other_evidence_is_kept(self):
        ot = [{"gene_symbol": "ESR1", "ot_rank": 1, "ot_score": 0.6, "datatypes": "literature:0.94;clinical:0.93"}]
        self.assertEqual(list(harvest.pcos_seed_genes(ot, 5)), ["ESR1"])

    def test_clinical_plus_trivial_literature_mention_is_skipped(self):
        # a complex I subunit: clinical 0.69 propagated from metformin, literature 0.03 text-mining noise
        ot = [{"gene_symbol": "NDUFAB1", "ot_rank": 32, "ot_score": 0.42, "datatypes": "clinical:0.69;literature:0.03"}]
        self.assertEqual(harvest.pcos_seed_genes(ot, 5), {})

    def test_evidence_score_exactly_at_the_threshold_counts(self):
        ot = [{"gene_symbol": "X", "ot_rank": 1, "ot_score": 0.5,
               "datatypes": f"literature:{harvest.MIN_GENE_LEVEL_SCORE:.2f}"}]
        self.assertEqual(list(harvest.pcos_seed_genes(ot, 5)), ["X"])

    def test_gene_without_any_evidence_types_is_skipped(self):
        ot = [{"gene_symbol": "X", "ot_rank": 1, "ot_score": 0.5, "datatypes": ""}]
        self.assertEqual(harvest.pcos_seed_genes(ot, 5), {})


if __name__ == "__main__":
    unittest.main()
