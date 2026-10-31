import unittest

import _paths  # noqa: F401
import pmos_data
from fixtures import FixtureKB


class IdSchemeTests(unittest.TestCase):
    """IDs are shared with the frontend's hardcoded IDs, so their shape must not drift."""

    def test_slug_scheme(self):
        self.assertEqual(pmos_data.gene_id("CYP17A1"), "gene-cyp17a1")
        self.assertEqual(pmos_data.pathway_id("Nuclear Receptor transcription pathway"), "pathway-nuclear-receptor-transcription-pathway")
        self.assertEqual(pmos_data.therapeutic_id("N-Acetylcysteine"), "therapeutic-n-acetylcysteine")
        self.assertEqual(pmos_data.biomarker_id("Anti-Mullerian hormone"), "biomarker-anti-mullerian-hormone")
        self.assertEqual(pmos_data.publication_id("123"), "publication-123")

    def test_slugify_strips_accents_and_symbols(self):
        self.assertEqual(pmos_data.slugify("  Müllerian / hormone! "), "mullerian-hormone")
        self.assertEqual(pmos_data.slugify("***"), "x")

    def test_protein_id_falls_back_to_accession(self):
        self.assertEqual(pmos_data.protein_id_for("AR", "P10275"), "protein-ar")
        self.assertEqual(pmos_data.protein_id_for(None, "P10275"), "protein-p10275")


class SearchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.kb = FixtureKB()
        cls.index = cls.kb.index

    @classmethod
    def tearDownClass(cls):
        cls.kb.close()

    def test_exact_name_ranks_first(self):
        hits = pmos_data.search_entities(self.index, "AR")
        self.assertEqual(hits[0]["entity"]["id"], "gene-ar")
        self.assertEqual(hits[0]["matchedOn"], "name")

    def test_identifier_match(self):
        hits = pmos_data.search_entities(self.index, "R-HSA-193048")
        self.assertEqual(hits[0]["entity"]["id"], "pathway-androgen-biosynthesis")

    def test_search_ignores_accents_and_case(self):
        self.assertTrue(pmos_data.search_entities(self.index, "FLUTAMIDE"))

    def test_type_filter(self):
        hits = pmos_data.search_entities(self.index, "androgen", types=["pathway"])
        self.assertTrue(hits)
        self.assertTrue(all(h["entity"]["type"] == "pathway" for h in hits))

    def test_empty_query_returns_nothing(self):
        self.assertEqual(pmos_data.search_entities(self.index, "   "), [])

    def test_list_entities_paginates_and_sorts(self):
        page = pmos_data.list_entities(self.index, {"types": ["gene"], "pageSize": 1, "page": 2})
        self.assertEqual(page["total"], 2)
        self.assertEqual(page["items"][0]["entity"]["name"], "ESR1")


if __name__ == "__main__":
    unittest.main()
