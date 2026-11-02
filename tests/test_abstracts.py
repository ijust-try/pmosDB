import unittest
from unittest import mock

import _paths  # noqa: F401
import harvest
import pmos_data
from fixtures import FixtureKB

XML = """<?xml version="1.0"?>
<PubmedArticleSet>
  <PubmedArticle><MedlineCitation><PMID Version="1">111</PMID><Article><Abstract>
    <AbstractText Label="BACKGROUND">PCOS affects <i>many</i>   women.</AbstractText>
    <AbstractText Label="RESULTS">Levels of H<sub>2</sub>O2 rose.</AbstractText>
    <CopyrightInformation>(c) publisher</CopyrightInformation>
  </Abstract></Article></MedlineCitation></PubmedArticle>
  <PubmedArticle><MedlineCitation><PMID Version="1">222</PMID><Article><Abstract>
    <AbstractText>A plain, unstructured abstract.</AbstractText>
  </Abstract></Article></MedlineCitation></PubmedArticle>
  <PubmedArticle><MedlineCitation><PMID Version="1">333</PMID><Article>
    <ArticleTitle>An editorial with no abstract</ArticleTitle>
  </Article></MedlineCitation></PubmedArticle>
  <PubmedArticle><MedlineCitation><PMID Version="1">444</PMID><Article><Abstract>
    <AbstractText Label="UNLABELLED">Text under an unlabelled heading.</AbstractText>
  </Abstract></Article></MedlineCitation></PubmedArticle>
</PubmedArticleSet>"""


class ParseTests(unittest.TestCase):
    def setUp(self):
        self.parsed = harvest.parse_pubmed_abstracts(XML)

    def test_structured_abstract_keeps_labels_and_flattens_markup(self):
        self.assertEqual(self.parsed["111"], "BACKGROUND: PCOS affects many women. RESULTS: Levels of H2O2 rose.")

    def test_copyright_notice_is_not_part_of_the_abstract(self):
        self.assertNotIn("publisher", self.parsed["111"])

    def test_plain_abstract(self):
        self.assertEqual(self.parsed["222"], "A plain, unstructured abstract.")

    def test_article_without_abstract_is_omitted(self):
        self.assertNotIn("333", self.parsed)

    def test_unlabelled_heading_is_not_printed_as_a_label(self):
        self.assertEqual(self.parsed["444"], "Text under an unlabelled heading.")


class FetchTests(unittest.TestCase):
    def test_pmids_are_batched_and_deduplicated(self):
        calls = []

        def fake_fetch(source, query, url, params=None, json_body=None, delay=0.4, as_json=True):
            calls.append((params["id"].split(","), as_json))
            return {"response": XML}

        pmids = [str(n) for n in range(1, 121)] + ["5", "5"]
        with mock.patch.object(harvest, "fetch", fake_fetch):
            harvest.pubmed_abstracts(pmids, chunk=50)
        self.assertEqual([len(ids) for ids, _ in calls], [50, 50, 20])
        self.assertTrue(all(as_json is False for _, as_json in calls), "efetch returns XML, not JSON")
        self.assertEqual(sum(len(ids) for ids, _ in calls), 120)

    def test_missing_response_is_tolerated(self):
        with mock.patch.object(harvest, "fetch", lambda *a, **k: {"response": None}):
            self.assertEqual(harvest.pubmed_abstracts(["1"]), {})


class PipelineTests(unittest.TestCase):
    def test_abstract_flows_through_cleaning_into_the_database(self):
        import pathlib
        import sqlite3
        import tempfile

        raw = {k: [] for k in ["genes", "proteins", "pathways", "protein_pathway", "go", "hormones",
                               "biomarkers", "therapeutics", "publications", "entity_pubs"]}
        raw["publications"] = [
            {"pmid": "111", "title": "T", "year": "2020", "journal": "J", "abstract": "  Some abstract.  ",
             "source": "PubMed", "source_accession": "111", "retrieved_on": "2026-01-01"},
            {"pmid": "111", "title": "T", "year": "2020", "journal": "J", "abstract": "Some abstract.",
             "source": "PubMed", "source_accession": "111", "retrieved_on": "2026-01-01"},
            {"pmid": "222", "title": "U", "year": "2021", "journal": "J", "abstract": None,
             "source": "PubMed", "source_accession": "222", "retrieved_on": "2026-01-01"},
        ]
        clean = harvest.clean_all(raw)
        self.assertEqual([p["pmid"] for p in clean["publications"]], ["111", "222"])
        db = pathlib.Path(tempfile.mkdtemp()) / "t.db"
        harvest.build_database(db, clean, [])
        rows = dict(sqlite3.connect(db).execute("SELECT pmid, abstract FROM publications"))
        self.assertEqual(rows, {"111": "Some abstract.", "222": None})


class SearchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.kb = FixtureKB()
        cls.index = cls.kb.index

    @classmethod
    def tearDownClass(cls):
        cls.kb.close()

    def test_publication_entity_exposes_its_abstract(self):
        self.assertIn("hyperandrogenism", self.index.by_id["publication-111"]["abstract"])

    def test_search_finds_a_paper_by_a_word_only_in_its_abstract(self):
        hits = pmos_data.search_entities(self.index, "hyperandrogenism", types=["publication"])
        self.assertEqual([h["entity"]["id"] for h in hits], ["publication-111"])
        self.assertEqual(hits[0]["matchedOn"], "description")

    def test_multi_word_query_can_span_title_and_abstract(self):
        hits = pmos_data.search_entities(self.index, "androgens hyperandrogenism", types=["publication"])
        self.assertEqual([h["entity"]["id"] for h in hits], ["publication-111"])

    def test_publication_without_abstract_is_still_valid(self):
        self.assertIsNone(self.index.by_id["publication-222"]["abstract"])

    def test_old_database_without_the_column_still_builds(self):
        import sqlite3

        conn = sqlite3.connect(":memory:")
        conn.row_factory = sqlite3.Row
        conn.execute("CREATE TABLE publications (pmid TEXT, title TEXT, year INTEGER, journal TEXT, source TEXT,"
                     " source_accession TEXT, retrieved_on TEXT)")
        conn.execute("INSERT INTO publications VALUES ('9','T',2020,'J','PubMed','9','2026-01-01')")
        entity = pmos_data.build_publication_entity(conn.execute("SELECT * FROM publications").fetchone())
        self.assertIsNone(entity["abstract"])


if __name__ == "__main__":
    unittest.main()
