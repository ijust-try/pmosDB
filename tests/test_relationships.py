import unittest

import _paths  # noqa: F401
import pmos_data
from fixtures import FixtureKB


class RelationshipTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.kb = FixtureKB()
        cls.index = cls.kb.index

    @classmethod
    def tearDownClass(cls):
        cls.kb.close()

    def edges(self, label):
        return {(r["source"], r["target"]) for r in self.index.relationships if r["label"] == label}

    def test_gene_encodes_protein(self):
        self.assertIn(("gene-ar", "protein-ar"), self.edges("encodes"))

    def test_protein_participates_in_pathway_by_reactome_id(self):
        self.assertIn(("protein-ar", "pathway-nuclear-receptor-transcription-pathway"), self.edges("participates in"))
        self.assertIn(("protein-ar", "pathway-androgen-biosynthesis"), self.edges("participates in"))

    def test_drug_targets_come_from_the_curated_table(self):
        self.assertEqual(self.edges("targets"), {("therapeutic-flutamide", "gene-ar")})
        rel = next(r for r in self.index.relationships if r["label"] == "targets")
        self.assertEqual(rel["status"], pmos_data.DOC)
        self.assertIn("CHEMBL806", rel["note"])

    def test_drug_without_curated_target_gets_no_target_edge(self):
        self.assertFalse(any(r["source"] == "therapeutic-inositol" for r in self.index.relationships if r["label"] == "targets"))

    def test_text_match_candidates_are_gone(self):
        conn = pmos_data.get_connection()
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        conn.close()
        self.assertNotIn("therapeutic_target_candidate", tables)

    def test_no_unvalidated_relationships(self):
        self.assertEqual({r["status"] for r in self.index.relationships}, {pmos_data.DOC})

    def test_pcos_association_only_for_genes_in_the_knowledge_base(self):
        assoc = self.edges("associated with")
        self.assertEqual({s for s, t in assoc if t == pmos_data.PROCESS_PCOS_ID}, {"gene-ar", "gene-esr1"})

    def test_gene_carries_structured_pcos_association(self):
        self.assertEqual(self.index.by_id["gene-esr1"]["pcosAssociation"], {"score": 0.6, "rank": 1, "total": 3, "evidenceTypes": [{"type": "literature", "score": 0.94}, {"type": "clinical", "score": 0.93}]})

    def test_pathway_evidence_summarises_member_genes(self):
        ev = self.index.by_id["pathway-nuclear-receptor-transcription-pathway"]["pcosEvidence"]
        self.assertEqual(ev, {"memberGenes": 2, "associatedGenes": 2, "topScore": 0.6, "topGene": "ESR1"})
        single = self.index.by_id["pathway-androgen-biosynthesis"]["pcosEvidence"]
        self.assertEqual((single["memberGenes"], single["topGene"]), (1, "AR"))

    def test_every_relationship_endpoint_exists(self):
        for r in self.index.relationships:
            self.assertIn(r["source"], self.index.by_id)
            self.assertIn(r["target"], self.index.by_id)

    def test_init_relationships_is_idempotent(self):
        conn = pmos_data.get_connection()
        before = conn.execute("SELECT COUNT(*) FROM protein_pathway_link").fetchone()[0]
        pmos_data.init_relationships(conn)
        after = conn.execute("SELECT COUNT(*) FROM protein_pathway_link").fetchone()[0]
        conn.close()
        self.assertEqual(before, after)

    def test_graph_neighbourhood_reaches_pathways_in_three_hops(self):
        graph = pmos_data.get_graph(self.index, "therapeutic-flutamide", 3)
        ids = {e["id"] for e in graph["entities"]}
        self.assertTrue({"gene-ar", "protein-ar", "pathway-androgen-biosynthesis"} <= ids)


if __name__ == "__main__":
    unittest.main()
