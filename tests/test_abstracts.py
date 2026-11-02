import unittest
from unittest import mock

import _paths  # noqa: F401
import harvest
import pmos_data
from fixtures import FixtureKB

XML = """<?xml version="1.0"?>
<PubmedArticleSet>
  <PubmedArticle><MedlineCitation><PMID Version="1">111</PMID><Article>
    <AuthorList>
      <Author><LastName>Smith</LastName><ForeName>Jane</ForeName><Initials>J</Initials></Author>
      <Author><LastName>Lee</LastName><ForeName>Kim</ForeName><Initials>KH</Initials></Author>
      <Author><CollectiveName>PCOS Consortium</CollectiveName></Author>
      <Author><LastName>Madonna</LastName></Author>
    </AuthorList>
    <Abstract>
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
  <PubmedArticle><MedlineCitation><PMID Version="1">555</PMID><Article>
    <AuthorList><Author><LastName>Okafor</LastName><Initials>C</Initials></Author></AuthorList>
  </Article></MedlineCitation></PubmedArticle>
</PubmedArticleSet>"""


class ParseTests(unittest.TestCase):
    def setUp(self):
        self.parsed = harvest.parse_pubmed_records(XML)

    def test_structured_abstract_keeps_labels_and_flattens_markup(self):
        self.assertEqual(self.parsed["111"]["abstract"], "BACKGROUND: PCOS affects many women. RESULTS: Levels of H2O2 rose.")

    def test_copyright_notice_is_not_part_of_the_abstract(self):
        self.assertNotIn("publisher", self.parsed["111"]["abstract"])

    def test_plain_abstract(self):
        self.assertEqual(self.parsed["222"]["abstract"], "A plain, unstructured abstract.")

    def test_article_with_neither_abstract_nor_authors_is_omitted(self):
        self.assertNotIn("333", self.parsed)

    def test_unlabelled_heading_is_not_printed_as_a_label(self):
        self.assertEqual(self.parsed["444"]["abstract"], "Text under an unlabelled heading.")

    def test_authors_use_surname_and_initials_and_keep_consortia(self):
        self.assertEqual(self.parsed["111"]["authors"], ["Smith J", "Lee KH", "PCOS Consortium", "Madonna"])

    def test_authors_without_an_abstract_are_kept(self):
        self.assertEqual(self.parsed["555"], {"abstract": None, "authors": ["Okafor C"]})


class FetchTests(unittest.TestCase):
    def test_pmids_are_batched_and_deduplicated(self):
        calls = []

        def fake_fetch(source, query, url, params=None, json_body=None, delay=0.4, as_json=True):
            calls.append((params["id"].split(","), as_json))
            return {"response": XML}

        pmids = [str(n) for n in range(1, 121)] + ["5", "5"]
        with mock.patch.object(harvest, "fetch", fake_fetch):
            harvest.pubmed_details(pmids, chunk=50)
        self.assertEqual([len(ids) for ids, _ in calls], [50, 50, 20])
        self.assertTrue(all(as_json is False for _, as_json in calls), "efetch returns XML, not JSON")
        self.assertEqual(sum(len(ids) for ids, _ in calls), 120)

    def test_missing_response_is_tolerated(self):
        with mock.patch.object(harvest, "fetch", lambda *a, **k: {"response": None}):
            self.assertEqual(harvest.pubmed_details(["1"]), {})


class PipelineTests(unittest.TestCase):
    def test_abstract_and_authors_flow_through_cleaning_into_the_database(self):
        import pathlib
        import sqlite3
        import tempfile

        raw = {k: [] for k in ["genes", "proteins", "pathways", "protein_pathway", "go", "hormones",
                               "biomarkers", "therapeutics", "publications", "entity_pubs"]}
        pub = lambda pmid, abstract, authors: {
            "pmid": pmid, "title": "T", "year": "2020", "journal": "J", "abstract": abstract, "authors": authors,
            "source": "PubMed", "source_accession": pmid, "retrieved_on": "2026-01-01"}
        raw["publications"] = [pub("111", "  Some abstract.  ", "Smith J; Lee KH"), pub("111", "Some abstract.", "Smith J; Lee KH"),
                               pub("222", None, None)]
        clean = harvest.clean_all(raw)
        self.assertEqual([p["pmid"] for p in clean["publications"]], ["111", "222"])
        db = pathlib.Path(tempfile.mkdtemp()) / "t.db"
        harvest.build_database(db, clean, [])
        rows = {r[0]: r[1:] for r in sqlite3.connect(db).execute("SELECT pmid, abstract, authors FROM publications")}
        self.assertEqual(rows, {"111": ("Some abstract.", "Smith J; Lee KH"), "222": (None, None)})

    def test_author_list_is_capped(self):
        long = "; ".join(f"Name{i} A" for i in range(harvest.MAX_AUTHORS + 40))
        capped = "; ".join(long.split("; ")[:harvest.MAX_AUTHORS])
        self.assertEqual(len(capped.split("; ")), harvest.MAX_AUTHORS)


class SearchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.kb = FixtureKB()
        cls.index = cls.kb.index

    @classmethod
    def tearDownClass(cls):
        cls.kb.close()

    def test_publication_entity_exposes_its_abstract_and_authors(self):
        pub = self.index.by_id["publication-111"]
        self.assertIn("hyperandrogenism", pub["abstract"])
        self.assertEqual(pub["authors"], ["Smith J", "Lee KH"])

    def test_search_finds_a_paper_by_a_word_only_in_its_abstract(self):
        hits = pmos_data.search_entities(self.index, "hyperandrogenism", types=["publication"])
        self.assertEqual([h["entity"]["id"] for h in hits], ["publication-111"])
        self.assertEqual(hits[0]["matchedOn"], "description")

    def test_multi_word_query_can_span_title_and_abstract(self):
        hits = pmos_data.search_entities(self.index, "androgens hyperandrogenism", types=["publication"])
        self.assertEqual([h["entity"]["id"] for h in hits], ["publication-111"])

    def test_publication_without_abstract_or_authors_is_still_valid(self):
        pub = self.index.by_id["publication-222"]
        self.assertIsNone(pub["abstract"])
        self.assertIsNone(pub["authors"])

    def test_old_database_without_the_new_columns_still_builds(self):
        import sqlite3

        conn = sqlite3.connect(":memory:")
        conn.row_factory = sqlite3.Row
        conn.execute("CREATE TABLE publications (pmid TEXT, title TEXT, year INTEGER, journal TEXT, source TEXT,"
                     " source_accession TEXT, retrieved_on TEXT)")
        conn.execute("INSERT INTO publications VALUES ('9','T',2020,'J','PubMed','9','2026-01-01')")
        entity = pmos_data.build_publication_entity(conn.execute("SELECT * FROM publications").fetchone())
        self.assertIsNone(entity["abstract"])
        self.assertIsNone(entity["authors"])


if __name__ == "__main__":
    unittest.main()
