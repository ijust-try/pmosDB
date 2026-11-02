import pathlib
import sqlite3
import tempfile
import unittest
from unittest import mock

import _paths  # noqa: F401
import chat
import harvest
import pmos_data
import retrieval as rt
from fixtures import FixtureKB

XREFS = [
    {"database": "GeneID", "id": "367"},
    {"database": "PDB", "id": "1E3G", "properties": [{"key": "Method", "value": "X-ray"}, {"key": "Resolution", "value": "2.40 A"}, {"key": "Chains", "value": "A=658-920"}]},
    {"database": "PDB", "id": "2AM9", "properties": [{"key": "Method", "value": "X-ray"}, {"key": "Resolution", "value": "1.64 A"}, {"key": "Chains", "value": "A=663-919"}]},
    {"database": "PDB", "id": "1XYZ", "properties": [{"key": "Method", "value": "NMR"}, {"key": "Resolution", "value": "-"}, {"key": "Chains", "value": "A=1-50"}]},
    {"database": "AlphaFoldDB", "id": "P10275", "properties": [{"key": "Description", "value": "-"}]},
    {"database": "Reactome", "id": "R-HSA-1"},
]


class HarvestTests(unittest.TestCase):
    def test_parse_structures(self):
        entries, alphafold = harvest.parse_structures(XREFS)
        self.assertEqual([e["pdb_id"] for e in entries], ["1E3G", "2AM9", "1XYZ"])
        self.assertEqual(entries[1], {"pdb_id": "2AM9", "method": "X-ray", "resolution": 1.64, "chains": "A=663-919", "span": 257})
        self.assertIsNone(entries[2]["resolution"], "an NMR entry has no resolution")
        self.assertEqual(alphafold, "P10275")

    def test_parse_handles_proteins_without_structures(self):
        self.assertEqual(harvest.parse_structures([{"database": "GeneID", "id": "1"}]), ([], None))
        self.assertEqual(harvest.parse_structures([{"database": "PDB", "id": "1ABC"}])[0][0]["resolution"], None)

    def test_best_structures_are_the_best_resolved_with_unresolved_last(self):
        entries = [{"pdb_id": f"{i}AAA", "method": "X-ray", "resolution": r, "chains": None}
                   for i, r in enumerate([3.0, 1.2, 2.5, 1.9, 2.0, 2.2, 2.8, 1.5, 3.2, 1.1], start=1)]
        entries.append({"pdb_id": "9NMR", "method": "NMR", "resolution": None, "chains": None})
        best = harvest.best_structures(entries)
        self.assertEqual(len(best), harvest.STRUCTURES_PER_PROTEIN)
        self.assertEqual([e["resolution"] for e in best], sorted(e["resolution"] for e in best))
        self.assertEqual(best[0]["resolution"], 1.1)
        self.assertNotIn("9NMR", [e["pdb_id"] for e in best])
        few = harvest.best_structures(entries[:2] + [entries[-1]])
        self.assertEqual([e["pdb_id"] for e in few], ["2AAA", "1AAA", "9NMR"], "NMR still shown when there is room")

    def test_regions_are_measured_from_the_chains_field(self):
        entries, _ = harvest.parse_structures([
            {"database": "PDB", "id": "1AAA", "properties": [{"key": "Chains", "value": "A=665-920"}]},
            {"database": "PDB", "id": "2BBB", "properties": [{"key": "Chains", "value": "A/B=10-20, C=100-400"}]},
            {"database": "PDB", "id": "3CCC", "properties": [{"key": "Chains", "value": "A=-"}]},
        ])
        self.assertEqual([e["span"] for e in entries], [256, 301, None])

    def test_a_peptide_bound_by_another_protein_is_not_a_structure_of_this_protein(self):
        # ESR1 is 595 residues; 7BAA is a 14-3-3 complex that only maps an 8-residue ESR1 peptide
        peptide = {"pdb_id": "7BAA", "method": "X-ray", "resolution": 1.10, "chains": "B=588-595", "span": 8}
        receptor = {"pdb_id": "1ERE", "method": "X-ray", "resolution": 3.1, "chains": "A=297-554", "span": 258}
        better = {"pdb_id": "5ACC", "method": "X-ray", "resolution": 1.8, "chains": "A=298-554", "span": 257}
        best = harvest.best_structures([peptide, receptor, better], length=595)
        self.assertEqual([e["pdb_id"] for e in best], ["5ACC", "1ERE"], "the better-resolved peptide must not rank first")

    def test_a_small_protein_needs_only_a_share_of_its_length(self):
        small = {"pdb_id": "1SML", "method": "X-ray", "resolution": 1.0, "chains": "A=1-45", "span": 45}
        stub = {"pdb_id": "2STB", "method": "X-ray", "resolution": 0.9, "chains": "A=1-5", "span": 5}
        best = harvest.best_structures([stub, small], length=60)  # 30% of 60 is 18 residues
        self.assertEqual([e["pdb_id"] for e in best], ["1SML"])

    def test_if_no_entry_is_substantial_all_are_used(self):
        only_peptides = [{"pdb_id": f"{i}PEP", "method": "X-ray", "resolution": float(i), "chains": "B=1-9", "span": 9}
                         for i in range(1, 4)]
        self.assertEqual(len(harvest.best_structures(only_peptides, length=500)), 3)

    def test_an_entry_with_an_unknown_region_is_kept(self):
        unknown = {"pdb_id": "4UNK", "method": "X-ray", "resolution": 2.0, "chains": None, "span": None}
        self.assertEqual(harvest.best_structures([unknown], length=500), [unknown])

    def test_ties_break_by_id_so_runs_are_reproducible(self):
        a = {"pdb_id": "2BBB", "method": "X-ray", "resolution": 2.0, "chains": None}
        b = {"pdb_id": "1AAA", "method": "X-ray", "resolution": 2.0, "chains": None}
        self.assertEqual([e["pdb_id"] for e in harvest.best_structures([a, b])], ["1AAA", "2BBB"])

    def test_uniprot_reads_structures_from_the_response(self):
        response = {"results": [{"primaryAccession": "P10275", "genes": [{"geneName": {"value": "AR"}}],
                                 "uniProtKBCrossReferences": XREFS}]}
        fake = lambda *a, **k: {"response": response, "retrieved_at": "2026-01-01T00:00:00+00:00"}
        with mock.patch.object(harvest, "fetch", fake):
            p = harvest.uniprot("AR")
        self.assertEqual(p["alphafold_id"], "P10275")
        self.assertEqual(len(p["pdb"]), 3)

    def test_the_uniprot_request_asks_for_structure_cross_references(self):
        seen = {}

        def fake(source, query, url, params=None, **kw):
            seen.update(params or {})
            return {"response": {"results": []}, "retrieved_at": "2026-01-01T00:00:00+00:00"}

        with mock.patch.object(harvest, "fetch", fake):
            harvest.uniprot("AR")
        self.assertIn("xref_pdb", seen["fields"])
        self.assertIn("xref_alphafolddb", seen["fields"])
        self.assertIn("length", seen["fields"].split(","))

    def test_structures_flow_through_cleaning_into_the_database(self):
        raw = {k: [] for k in ["genes", "proteins", "pathways", "protein_pathway", "go", "hormones", "biomarkers",
                               "therapeutics", "publications", "entity_pubs", "structures"]}
        raw["genes"] = [{"gene_symbol": "AR", "name": "AR", "ncbi_gene_id": "367", "description": "d", "source": "NCBI Gene",
                         "source_accession": "367", "retrieved_on": "2026-01-01"}]
        raw["proteins"] = [{"protein_id": "P10275", "name": "AR", "function": "f", "gene_symbol": "AR", "uniprot_geneid": "367",
                            "pdb_count": 95, "alphafold_id": "P10275", "source": "UniProt", "source_accession": "P10275",
                            "retrieved_on": "2026-01-01"}]
        row = lambda protein, pdb, res: {"protein_id": protein, "pdb_id": pdb, "method": "X-ray", "resolution": res,
                                         "chains": "A=1-2", "source": "PDB", "source_accession": pdb, "retrieved_on": "2026-01-01"}
        raw["structures"] = [row("P10275", "1GS4", 1.95), row("P10275", "1GS4", 1.95), row("P10275", "2AM9", 1.64),
                             row("Q00000", "9ZZZ", 1.0)]  # duplicate, and a protein that is not in the database
        clean = harvest.clean_all(raw)
        self.assertEqual([s["pdb_id"] for s in clean["protein_structure"]], ["2AM9", "1GS4"])
        db = pathlib.Path(tempfile.mkdtemp()) / "t.db"
        counts = harvest.build_database(db, clean, [])
        self.assertEqual(counts["protein_structure"], 2)
        conn = sqlite3.connect(db)
        self.assertEqual(conn.execute("SELECT pdb_count, alphafold_id FROM proteins").fetchone(), (95, "P10275"))
        conn.execute("PRAGMA foreign_keys = ON")
        self.assertEqual(conn.execute("PRAGMA foreign_key_check").fetchall(), [])


class EntityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.kb = FixtureKB()
        cls.index = cls.kb.index

    @classmethod
    def tearDownClass(cls):
        cls.kb.close()

    def test_protein_carries_best_structures_first_with_links(self):
        st = self.index.by_id["protein-ar"]["structures"]
        self.assertEqual(st["pdbCount"], 95)
        self.assertEqual([e["id"] for e in st["entries"]], ["2AM9", "1GS4", "1E3G"])
        self.assertEqual(st["entries"][0]["url"], "https://www.rcsb.org/structure/2AM9")
        self.assertEqual(st["entries"][0]["image"], "https://cdn.rcsb.org/images/structures/2am9_assembly-1.jpeg")
        self.assertEqual(st["allUrl"], "https://www.ebi.ac.uk/pdbe/pdbe-kb/proteins/P10275")
        self.assertEqual(st["alphafoldUrl"], "https://alphafold.ebi.ac.uk/entry/P10275")

    def test_protein_with_only_a_prediction_has_no_pdb_entries(self):
        st = self.index.by_id["protein-esr1"]["structures"]
        self.assertEqual((st["entries"], st["allUrl"], st["alphafoldId"]), ([], None, "P03372"))

    def test_structure_sources_are_listed_as_trusted_sources(self):
        sources = {s["source"]: s for s in self.index.by_id["protein-ar"]["sources"]}
        self.assertEqual(sources["pdb"]["url"], "https://www.rcsb.org/structure/2AM9")
        self.assertEqual(sources["alphafold"]["url"], "https://alphafold.ebi.ac.uk/entry/P10275")
        self.assertIn("pdb", {s["id"] for s in pmos_data.get_sources(self.index)})

    def test_only_proteins_carry_structures(self):
        self.assertFalse([e for e in self.index.entities if e["type"] != "protein" and "structures" in e])

    def test_search_finds_a_protein_by_pdb_id(self):
        hits = pmos_data.search_entities(self.index, "2AM9")
        self.assertEqual(hits[0]["entity"]["id"], "protein-ar")

    def test_an_older_database_without_structure_columns_still_builds(self):
        conn = sqlite3.connect(":memory:")
        conn.row_factory = sqlite3.Row
        conn.execute("CREATE TABLE proteins (protein_id TEXT, name TEXT, function TEXT, gene_symbol TEXT, source TEXT,"
                     " source_accession TEXT, retrieved_on TEXT)")
        conn.execute("INSERT INTO proteins VALUES ('P1','n','f','G','UniProt','P1','2026-01-01')")
        entity = pmos_data.build_protein_entity(conn.execute("SELECT * FROM proteins").fetchone(), [], [])
        self.assertNotIn("structures", entity)


class RetrievalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.kb = FixtureKB()
        cls.index = cls.kb.index

    @classmethod
    def tearDownClass(cls):
        cls.kb.close()

    def test_structure_requests_are_link_requests_answered_from_the_database(self):
        for q in ["PDB link for the androgen receptor protein", "give me the 3D structure of the androgen receptor protein",
                  "alphafold link for the androgen receptor protein", "crystal structure of the androgen receptor protein"]:
            with self.subTest(q=q):
                r = rt.retrieve(self.index, q)
                self.assertEqual((r["intent"], r["status"], r["records"][0]["id"]), ("link", "ok", "protein-ar"))
                text = rt.compose_extractive(r)
                self.assertIn("https://www.rcsb.org/structure/2AM9", text)
                self.assertIn("https://alphafold.ebi.ac.uk/entry/P10275", text)
                self.assertIn("https://www.ebi.ac.uk/pdbe/pdbe-kb/proteins/P10275", text)

    def test_a_structure_request_lists_the_protein_before_its_gene(self):
        r = rt.retrieve(self.index, "AlphaFold structure of AR")
        self.assertEqual(r["intent"], "link")
        self.assertEqual([x["id"] for x in r["records"]][:2], ["protein-ar", "gene-ar"])

    def test_structure_links_name_each_entry_so_they_can_be_told_apart(self):
        text = rt.compose_extractive(rt.retrieve(self.index, "PDB link for the androgen receptor protein"))
        for entry in ("2AM9", "1GS4", "1E3G"):
            self.assertIn(f"[RCSB PDB {entry}](https://www.rcsb.org/structure/{entry})", text)
        self.assertIn("[AlphaFold DB P10275]", text)

    def test_a_pdb_id_names_its_protein(self):
        r = rt.retrieve(self.index, "tell me about 2AM9")
        self.assertEqual(r["records"][0]["id"], "protein-ar")

    def test_record_text_states_the_structures_so_answers_can_cite_them(self):
        text = rt.record_text(self.index.by_id["protein-ar"], self.index)
        self.assertIn("95 experimental structures in the Protein Data Bank", text)
        self.assertIn("2AM9 (X-ray, 1.64 Å)", text)
        self.assertIn("AlphaFold", text)

    def test_checker_rejects_an_invented_pdb_id_and_accepts_a_real_one(self):
        records = rt.retrieve(self.index, "tell me about the androgen receptor protein")["records"]
        ref = next(r["ref"] for r in records if r["id"] == "protein-ar")
        ok, reason, *_ = chat.check_answer(f"The androgen receptor has 95 experimental structures, best resolved 2AM9 [{ref}].", records)
        self.assertTrue(ok, reason)
        ok, reason, *_ = chat.check_answer(f"The androgen receptor has 95 experimental structures, best resolved 9ZZZ [{ref}].", records)
        self.assertFalse(ok)
        self.assertIn("9ZZZ", reason)


class FurtherReadingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.kb = FixtureKB()
        cls.index = cls.kb.index

    @classmethod
    def tearDownClass(cls):
        cls.kb.close()

    def items(self, q):
        return rt.further_reading(rt.retrieve(self.index, q))

    def test_a_drug_question_gets_a_pubmed_search_structures_and_source_records(self):
        items = self.items("what does flutamide do")
        kinds = [i["kind"] for i in items]
        self.assertIn("search", kinds)
        self.assertIn("structure", kinds)
        self.assertIn("database", kinds)
        search = next(i for i in items if i["kind"] == "search")
        self.assertIn("pubmed.ncbi.nlm.nih.gov/?term=", search["url"])
        self.assertIn("%22Flutamide%22", search["url"])
        self.assertIn("polycystic+ovary+syndrome", search["url"])
        self.assertEqual(search["label"], "Search PubMed: Flutamide and PCOS")

    def test_papers_in_the_knowledge_base_link_to_pubmed(self):
        items = self.items("papers about hyperandrogenism")
        paper = next(i for i in items if i["kind"] == "paper")
        self.assertEqual(paper["url"], "https://pubmed.ncbi.nlm.nih.gov/111/")
        self.assertTrue(paper["label"].startswith("Smith et al., 2009: Androgens and PCOS"))

    def test_links_are_https_unique_and_limited(self):
        for q in ["what does flutamide do", "papers about hyperandrogenism", "tell me about the androgen receptor"]:
            items = self.items(q)
            self.assertLessEqual(len(items), 9)
            self.assertEqual(len({i["url"] for i in items}), len(items))
            for i in items:
                self.assertTrue(i["url"].startswith("https://") or i["url"].startswith("/entity/"), i)

    def test_nothing_is_offered_when_there_is_no_answer(self):
        for q in ["what dose of flutamide should I take", "what is the capital of France", "hello",
                  "give me the link of androgen receptor"]:
            with self.subTest(q=q):
                self.assertEqual(self.items(q), [])

    def test_the_chat_response_carries_further_reading(self):
        chat.reset_state()
        out = chat.answer(self.index, "what does flutamide do", generate=lambda *a: chat.NO_ANSWER, api_key="x")
        self.assertTrue(out["furtherReading"])
        self.assertEqual(chat.answer(self.index, "what dose of flutamide should I take")["furtherReading"], [])


if __name__ == "__main__":
    unittest.main()
