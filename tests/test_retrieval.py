import json
import threading
import unittest
import urllib.parse
import urllib.request
from http.server import ThreadingHTTPServer

import _paths  # noqa: F401
import retrieval as rt
import server
from fixtures import FixtureKB


class TokenizerTests(unittest.TestCase):
    def test_stopwords_and_question_words_are_dropped(self):
        self.assertEqual(rt.tokenize("What is the mechanism of metformin?"), ["mechanism", "metformin"])

    def test_hyphenated_terms_match_either_spelling(self):
        toks = rt.tokenize("N-acetylcysteine")
        self.assertIn("nacetylcysteine", toks)
        self.assertIn("acetylcysteine", toks)

    def test_accents_are_folded_and_plurals_stemmed(self):
        self.assertEqual(rt.tokenize("Müllerian hormones"), ["mullerian", "hormone"])

    def test_identifiers_survive(self):
        self.assertIn("cyp17a1", rt.tokenize("CYP17A1"))
        self.assertIn("383280", rt.tokenize("R-HSA-383280"))

    def test_phrase_key(self):
        self.assertEqual(rt.phrase_key("R-HSA-383280"), "r hsa 383280")
        self.assertEqual(rt.phrase_key("Anti-Müllerian hormone"), "anti mullerian hormone")


class RefusalTests(unittest.TestCase):
    def test_dosing_personal_advice_and_efficacy_are_refused(self):
        for q, what in [
            ("What dose of metformin should I take?", "dosing"),
            ("how much metformin per day", "dosing"),
            ("take 500 mg twice daily?", "dosing"),
            ("Should I stop spironolactone", "personal medical advice"),
            ("can I take letrozole with food", "personal medical advice"),
            ("my doctor prescribed flutamide, is that ok", "personal medical advice"),
            ("is spironolactone effective for PCOS", "a treatment or efficacy claim"),
            ("what is the best treatment for PCOS", "a treatment or efficacy claim"),
            ("does metformin cure PCOS", "a treatment or efficacy claim"),
            ("side effects of metformin", "a treatment or efficacy claim"),
        ]:
            with self.subTest(q=q):
                self.assertEqual(rt.detect_refusal(q), what)

    def test_ordinary_questions_are_not_refused(self):
        for q in [
            "where can I read about the nuclear receptor transcription pathway",
            "where can I find the UniProt entry for AR",
            "Which drugs target CYP19A1?",
            "what is the mechanism of metformin",
            "what is the evidence for metformin in PCOS",
            "papers about hirsutism",
            "can you give me the link for estradiol",
        ]:
            with self.subTest(q=q):
                self.assertIsNone(rt.detect_refusal(q))


class FixtureRetrievalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.kb = FixtureKB()
        cls.index = cls.kb.index
        cls.corpus = rt.get_corpus(cls.index)

    @classmethod
    def tearDownClass(cls):
        cls.kb.close()

    def ask(self, q, **kw):
        return rt.retrieve(self.index, q, **kw)

    def ids(self, result):
        return [r["id"] for r in result["records"]]

    # -- naming entities
    def test_short_symbols_match_only_when_capitalised(self):
        self.assertTrue(self.corpus.find_mentions("What does AR do?"))
        self.assertEqual(self.corpus.find_mentions("what are the odds"), [])  # "ar" inside words never matches
        self.assertEqual(self.corpus.find_mentions("is ar interesting"), [])

    def test_longer_names_win_over_parts_of_them(self):
        mentions = self.corpus.find_mentions("androgen receptor")
        self.assertIn("protein-ar", mentions[0]["entityIds"])

    def test_identifiers_are_recognised(self):
        self.assertEqual(self.corpus.find_mentions("R-HSA-193048")[0]["entityIds"], ["pathway-androgen-biosynthesis"])

    # -- intents
    def test_greeting_gets_help_without_any_records(self):
        r = self.ask("hello")
        self.assertEqual((r["intent"], r["status"], r["records"]), ("help", "ok", []))
        self.assertIn("won't give medical advice", rt.compose_extractive(r))

    def test_refused_question_returns_no_records_but_offers_the_named_page(self):
        r = self.ask("what dose of flutamide should I take")
        self.assertEqual((r["status"], r["records"]), ("refused", []))
        self.assertEqual(r["suggestions"][0]["id"], "therapeutic-flutamide")

    def test_refusal_suggests_only_what_the_question_named(self):
        r = self.ask("what dose of flutamide should I take")
        self.assertEqual([s["id"] for s in r["suggestions"]], ["therapeutic-flutamide"])
        nothing = self.ask("how much should I take")
        self.assertEqual(nothing["status"], "refused")
        self.assertTrue(all(s["id"] is None for s in nothing["suggestions"]), "no named record: entry points only")

    def test_link_request_is_answered_from_the_database_alone(self):
        r = self.ask("give me the link of androgen receptor")
        self.assertEqual(r["intent"], "link")
        self.assertTrue({"gene-ar", "protein-ar"} <= set(self.ids(r)))
        self.assertNotIn("pathway-androgen-biosynthesis", self.ids(r), "a link request returns only what it named")
        text = rt.compose_extractive(r)
        self.assertIn("(/entity/protein-ar)", text)
        self.assertIn("https://www.uniprot.org/uniprotkb/P10275", text)
        self.assertIn("https://www.ncbi.nlm.nih.gov/gene/367", text)

    def test_identifier_request_reports_the_recorded_identifier(self):
        r = self.ask("What is the UniProt ID of the androgen receptor protein?")
        self.assertEqual(self.ids(r)[0], "protein-ar")
        self.assertIn("P10275", rt.compose_extractive(r))

    # -- evidence and graph expansion
    def test_drug_question_pulls_target_pathway_and_paper_through_the_graph(self):
        r = self.ask("what does flutamide do")
        by_id = {x["id"]: x for x in r["records"]}
        self.assertIn("gene-ar", by_id)
        self.assertEqual(by_id["gene-ar"]["via"], "curated target of Flutamide")
        self.assertIn("pathway-androgen-biosynthesis", by_id)
        self.assertIn("Flutamide", by_id["pathway-androgen-biosynthesis"]["via"])
        self.assertIn("Androgen Receptor antagonist", by_id["therapeutic-flutamide"]["text"])

    def test_records_carry_sequential_refs_pages_and_sources(self):
        r = self.ask("tell me about flutamide")
        self.assertEqual([x["ref"] for x in r["records"]], [f"R{i}" for i in range(1, len(r["records"]) + 1)])
        for x in r["records"]:
            self.assertEqual(x["url"], f"/entity/{x['id']}")
            self.assertTrue(x["text"])
            self.assertTrue(x["external"], f"{x['id']} has no source link")

    def test_aspects_the_knowledge_base_does_not_cover_are_reported(self):
        r = self.ask("tell me about flutamide hepatotoxicity")
        self.assertEqual(r["status"], "ok")
        self.assertEqual(r["unmatchedTerms"], ["hepatotoxicity"])
        self.assertIn("Not found in the knowledge base: hepatotoxicity", rt.compose_extractive(r))

    def test_kind_of_record_asked_for_comes_first(self):
        r = self.ask("which drugs target AR")
        self.assertEqual(r["records"][0]["type"], "therapeutic")

    def test_wording_only_matches_are_labelled_as_such(self):
        r = self.ask("flutamide hyperandrogenism")
        lexical = [x for x in r["records"] if x["via"] and "not linked" in x["via"]]
        for x in lexical:
            self.assertNotIn(x["id"], {"gene-ar", "therapeutic-flutamide"})

    def test_paper_found_by_a_word_in_its_abstract(self):
        r = self.ask("papers about hyperandrogenism")
        self.assertEqual(r["records"][0]["id"], "publication-111")
        self.assertEqual(r["records"][0]["citation"], "Smith et al., 2009")
        self.assertIn("hyperandrogenism", r["records"][0]["text"])

    # -- no evidence
    def test_off_topic_and_gibberish_get_no_evidence_and_no_records(self):
        for q in ["what is the capital of France", "zxqv blorptastic", "who won the cricket world cup", ""]:
            with self.subTest(q=q):
                r = self.ask(q)
                self.assertEqual((r["status"], r["records"]), ("no_evidence", []))
                self.assertTrue(r["suggestions"])
                self.assertIn("won't guess", rt.compose_extractive(r))

    def test_no_evidence_suggests_entry_points_not_unrelated_records(self):
        r = self.ask("who won the cricket world cup")
        self.assertTrue(all(s["id"] is None for s in r["suggestions"]))

    # -- invariants that must hold for any question
    def test_invariants_over_many_questions(self):
        questions = [
            "link for AR", "what does flutamide do", "which drugs target AR", "papers about hyperandrogenism",
            "R-HSA-383280", "hello", "what dose of flutamide", "capital of France", "androgen biosynthesis pathway",
            "inositol", "ESR1 and AR", "tell me about flutamide hepatotoxicity", "x" * 5000, "AR " * 200,
        ]
        for q in questions:
            with self.subTest(q=q[:40]):
                r = self.ask(q)
                self.assertLessEqual(len(r["query"]), rt.MAX_QUERY_CHARS)
                if r["status"] != "ok":
                    self.assertEqual(r["records"], [])
                self.assertLessEqual(len(r["records"]), rt.MAX_RECORDS)
                ids = [x["id"] for x in r["records"]]
                self.assertEqual(len(ids), len(set(ids)), "a record was returned twice")
                for x in r["records"]:
                    self.assertIn(x["id"], self.index.by_id, "a record that does not exist")
                    self.assertTrue(x["external"] or x["type"] == "process", f"{x['id']} cannot be traced to a source")
                    # a term reported as not found must not appear in any returned record
                    hay = set(rt.tokenize(" ".join(y["text"] + " " + y["name"] for y in r["records"])))
                    self.assertFalse(set(r["unmatchedTerms"]) & hay)
                rt.compose_extractive(r)  # never raises


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.kb = FixtureKB()
        server.INDEX = cls.kb.index
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.base = f"http://127.0.0.1:{cls.httpd.server_address[1]}/api"
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        server.INDEX = None
        cls.kb.close()

    def get(self, q, extra=""):
        url = f"{self.base}/retrieve?q={urllib.parse.quote(q)}{extra}"
        with urllib.request.urlopen(url, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def test_retrieve_endpoint(self):
        body = self.get("link for AR")
        self.assertEqual((body["intent"], body["status"]), ("link", "ok"))

    def test_limit_is_capped(self):
        self.assertLessEqual(len(self.get("what does flutamide do", "&limit=500")["records"]), 20)

    def test_missing_query_is_a_safe_empty_answer(self):
        self.assertEqual(self.get("")["status"], "no_evidence")


if __name__ == "__main__":
    unittest.main()
