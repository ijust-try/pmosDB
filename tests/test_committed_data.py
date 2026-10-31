"""Checks on the real, committed knowledge base (offline, read-only; the database is copied before use)."""
import json
import shutil
import sqlite3
import tempfile
import unittest
from pathlib import Path

import _paths  # noqa: F401
import harvest
import pmos_data

ROOT = _paths.ROOT
BASE_TABLES = ["genes", "proteins", "pathways", "hormones", "biomarkers", "therapeutics", "publications",
               "go_annotations", "therapeutic_target"]


class CommittedDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="pmos_real_"))
        cls.db = cls.tmp / "kb.db"
        shutil.copyfile(ROOT / "pmos_knowledge_base.db", cls.db)
        cls._saved = pmos_data.DB_PATH
        pmos_data.DB_PATH = cls.db
        cls.conn = pmos_data.get_connection()
        pmos_data.init_relationships(cls.conn)
        cls.index = pmos_data.build_index(cls.conn)

    @classmethod
    def tearDownClass(cls):
        cls.conn.close()
        pmos_data.DB_PATH = cls._saved
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_database_passes_the_pipeline_validation(self):
        self.assertEqual(harvest.validate_database(ROOT / "pmos_knowledge_base.db"), [])

    def test_no_foreign_key_violations_after_stitching(self):
        self.assertEqual(self.conn.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_every_row_has_provenance(self):
        for table in BASE_TABLES:
            n = self.conn.execute(
                f"SELECT COUNT(*) FROM {table} WHERE source IS NULL OR source_accession IS NULL OR retrieved_on IS NULL"
            ).fetchone()[0]
            self.assertEqual(n, 0, f"{table} has rows without provenance")

    def test_only_trusted_sources_are_used(self):
        trusted = set(pmos_data.SOURCE_ID_MAP)
        for table in BASE_TABLES:
            for (source,) in self.conn.execute(f"SELECT DISTINCT source FROM {table}"):
                self.assertIn(source, trusted, f"{table} uses unexpected source {source!r}")

    def test_coverage_floor(self):
        counts = {t: self.conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in BASE_TABLES}
        self.assertGreaterEqual(counts["genes"], 90)
        self.assertGreaterEqual(counts["pathways"], 100)
        self.assertGreaterEqual(counts["therapeutics"], 10)
        self.assertGreaterEqual(counts["therapeutic_target"], 8)

    def test_entity_ids_are_unique_and_relationships_resolve(self):
        self.assertEqual(len(self.index.entities), len(self.index.by_id), "two entities share an ID")
        for r in self.index.relationships:
            self.assertIn(r["source"], self.index.by_id)
            self.assertIn(r["target"], self.index.by_id)

    def test_every_pcos_associated_gene_carries_its_score(self):
        symbols = [r[0] for r in self.conn.execute("SELECT gene_symbol FROM gene_pcos_association")]
        self.assertTrue(symbols)
        for s in symbols:
            assoc = self.index.by_id[pmos_data.gene_id(s)].get("pcosAssociation")
            self.assertIsNotNone(assoc, s)
            self.assertTrue(0 <= assoc["score"] <= 1)

    def test_drug_targets_are_curated_only(self):
        targets = [r for r in self.index.relationships if r["label"] == "targets"]
        self.assertTrue(targets)
        self.assertEqual({r["status"] for r in targets}, {pmos_data.DOC})
        self.assertTrue(all("Open Targets" in r["note"] for r in targets))

    def test_flutamide_has_target_pathways_and_context(self):
        """Regression: Flutamide's pathways and biological context were empty on the live site."""
        ix = self.index
        genes = [n["entity"] for n in pmos_data.get_neighbours(ix, "therapeutic-flutamide") if n["entity"]["type"] == "gene"]
        self.assertEqual([g["name"] for g in genes], ["AR"])
        graph = pmos_data.get_graph(ix, "therapeutic-flutamide", 3)
        pathways = [e for e in graph["entities"] if e["type"] == "pathway"]
        self.assertGreaterEqual(len(pathways), 1)
        self.assertIn("process-pcos", {e["id"] for e in graph["entities"]})

    def test_most_drugs_resolve_to_pathways(self):
        drugs = [e for e in self.index.entities if e["type"] == "therapeutic"]
        with_pathways = 0
        for d in drugs:
            graph = pmos_data.get_graph(self.index, d["id"], 3)
            with_pathways += any(e["type"] == "pathway" for e in graph["entities"])
        self.assertGreaterEqual(with_pathways, 9, f"only {with_pathways} of {len(drugs)} drugs reach a pathway")

    def test_every_source_has_a_last_sync(self):
        for s in pmos_data.get_sources(self.index):
            self.assertIsNotNone(s["lastSync"], s["id"])

    def test_sync_state_file_is_valid(self):
        state = json.loads((ROOT / "data" / "sync_state.json").read_text(encoding="utf-8"))
        self.assertEqual(state["schedule"]["weekday"], 2)
        self.assertTrue(state["sources"])

    def test_clean_csvs_match_the_database(self):
        for table, key in [("genes", "gene_symbol"), ("pathways", "pathway_name"), ("publications", "pmid")]:
            rows = harvest.csv.DictReader((ROOT / "data" / "clean" / f"{table}.csv").open(encoding="utf-8-sig"))
            csv_keys = {r[key] for r in rows}
            db_keys = {str(r[0]) for r in sqlite3.connect(self.db).execute(f"SELECT {key} FROM {table}")}
            self.assertEqual(csv_keys, db_keys, f"{table}.csv is out of step with the database")


if __name__ == "__main__":
    unittest.main()
