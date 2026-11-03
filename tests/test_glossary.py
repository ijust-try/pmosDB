"""
The glossary: definitions and plain-language sections from MeSH and MedlinePlus, and the concept answers built on them.

Harvesting is tested with canned responses (no network); routing and answers run on the fixture knowledge base.
"""
import json
import unittest
from unittest import mock

import _paths  # noqa: F401
import chat
import glossary
import pmos_data
import retrieval as rt
from fixtures import FixtureKB

SUMMARY = """
<p>Intro paragraph that has no question heading.</p>
What is PCOS?
<p>PCOS is a hormonal disorder.</p>
What are the symptoms of PCOS?
<p>The symptoms may include:</p>
<ul><li>Irregular periods.</li><li>Oily skin.</li></ul>
What causes PCOS?
<p>The exact cause is unknown. Doctors treat it with medicines.</p>
How is PCOS diagnosed?
<p>There is no single test.</p>
What are the treatments for PCOS?
<p>Treatment depends on your goals.</p>
Can PCOS be prevented?
<p>No known way.</p>
"""


def mesh_fetch(source, query, url, params=None, json_body=None, delay=0.4, as_json=True):
    """Canned id.nlm.nih.gov / wsearch.nlm.nih.gov responses."""
    rec = {"source": source, "query": str(query), "url": url, "params": params, "retrieved_at": "2026-02-03T04:05:06+00:00"}
    if source == "mesh" and query.startswith("lookup_"):
        label = query[len("lookup_"):]
        hits = {"Hirsutism": [{"resource": "http://id.nlm.nih.gov/mesh/D006628", "label": "Hirsutism"}]}.get(label, [])
        return {**rec, "response": hits}
    if source == "mesh" and query == "D006628":
        return {**rec, "response": {"preferredConcept": "http://id.nlm.nih.gov/mesh/M0010199"}}
    if source == "mesh" and query == "M0010199":
        return {**rec, "response": {"scopeNote": {"@language": "en", "@value":
                "A condition seen in WOMEN with excess hair. It is treated with drugs. Not hypertrichosis."}}}
    if source == "medlineplus":
        title = query[len("topic_"):]
        docs = {
            "Polycystic Ovary Syndrome": ("Polycystic Ovary Syndrome", "https://medlineplus.gov/polycysticovarysyndrome.html"),
            "Hirsutism": ("Polycystic Ovary Syndrome", "https://medlineplus.gov/polycysticovarysyndrome.html"),  # fuzzy hit
        }
        if title not in docs:
            return {**rec, "response": ""}
        doc_title, doc_url = docs[title]
        xml = (f'<nlmSearchResult><list><document url="{doc_url}"><content name="title">{doc_title}</content>'
               f'<content name="altTitle">PMOS</content><content name="FullSummary">'
               f'{SUMMARY.replace("<", "&lt;").replace(">", "&gt;")}</content></document></list></nlmSearchResult>')
        return {**rec, "response": xml}
    raise AssertionError(f"unexpected fetch {source} {query}")


class MeshTextTests(unittest.TestCase):
    def test_capitalised_cross_references_become_ordinary_words_but_acronyms_stay(self):
        self.assertEqual(glossary.tidy_scope_note("seen in WOMEN and the OVARIES; high LH and FSH, PCOS"),
                         "seen in women and the ovaries; high LH and FSH, PCOS")

    def test_whitespace_is_collapsed(self):
        self.assertEqual(glossary.tidy_scope_note("a  b\n c"), "a b c")


class TreatmentFilterTests(unittest.TestCase):
    def test_sentences_about_treatment_are_removed_and_the_rest_is_untouched(self):
        text = "It is a hormonal disorder. It is treated with drugs. Prescribed medicines vary.\n- Oily skin.\n- Take a dose daily."
        self.assertEqual(glossary.without_treatment(text), "It is a hormonal disorder.\n- Oily skin.")

    def test_nothing_is_reworded(self):
        text = "Irregular or missed periods.\n- Too much hair."
        self.assertEqual(glossary.without_treatment(text), text)

    def test_all_treatment_text_gives_an_empty_string(self):
        self.assertEqual(glossary.without_treatment("Treatment depends on your goals."), "")


class MedlinePlusSectionTests(unittest.TestCase):
    def setUp(self):
        self.sections = glossary.parse_medlineplus_sections(
            SUMMARY.replace("&lt;", "<"))

    def test_explanatory_sections_are_kept_under_the_right_names(self):
        self.assertEqual(set(self.sections), {"overview", "symptoms", "causes", "diagnosis"})

    def test_symptoms_are_not_mistaken_for_the_overview(self):
        self.assertIn("Irregular periods.", self.sections["symptoms"])
        self.assertNotIn("hormonal disorder", self.sections["symptoms"])
        self.assertIn("hormonal disorder", self.sections["overview"])

    def test_list_items_keep_their_bullets(self):
        self.assertEqual(self.sections["symptoms"], "The symptoms may include:\n- Irregular periods.\n- Oily skin.")

    def test_treatment_and_prevention_sections_are_never_stored(self):
        joined = " ".join(self.sections.values()).lower()
        for word in ("treatment depends", "no known way"):
            self.assertNotIn(word, joined)

    def test_treatment_sentences_inside_a_kept_section_are_dropped(self):
        self.assertEqual(self.sections["causes"], "The exact cause is unknown.")


class HarvestTests(unittest.TestCase):
    def setUp(self):
        patcher = mock.patch.object(glossary.harvest, "fetch", side_effect=mesh_fetch)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.log = mock.patch.object(glossary.harvest, "log").start()
        self.unresolved = mock.patch.object(glossary.harvest, "log_unresolved").start()
        self.addCleanup(mock.patch.stopall)

    def test_a_mesh_definition_is_the_scope_note_without_treatment_or_shouting(self):
        entry = glossary.mesh_entry("Hirsutism")
        self.assertEqual(entry["id"], "D006628")
        self.assertEqual(entry["definition"], "A condition seen in women with excess hair. Not hypertrichosis.")
        self.assertEqual(entry["retrieved_on"], "2026-02-03")

    def test_an_unknown_mesh_heading_is_none(self):
        self.assertIsNone(glossary.mesh_entry("Nonexistent heading"))

    def test_medlineplus_topic_must_have_exactly_the_title_asked_for(self):
        self.assertIsNone(glossary.medlineplus_topic("Hirsutism"), "a fuzzy search hit is not the Hirsutism topic")
        topic = glossary.medlineplus_topic("Polycystic Ovary Syndrome")
        self.assertEqual(topic["slug"], "polycysticovarysyndrome")
        self.assertEqual(topic["aliases"], ["PMOS"])
        self.assertIn("symptoms", topic["sections"])

    def test_harvest_builds_provenance_for_every_row(self):
        terms, sections = glossary.harvest_glossary([
            {"term": "Hirsutism", "mesh_label": "Hirsutism", "medlineplus_title": "Hirsutism", "aliases": "excess hair"},
            {"term": "Polycystic Ovary Syndrome", "mesh_label": "", "medlineplus_title": "Polycystic Ovary Syndrome",
             "aliases": "PCOS"},
        ])
        by_term = {t["term"]: t for t in terms}
        self.assertEqual(by_term["Hirsutism"]["source"], "MeSH")
        self.assertEqual(by_term["Hirsutism"]["source_accession"], "D006628")
        self.assertIsNone(by_term["Hirsutism"]["medlineplus_slug"])
        self.assertEqual(by_term["Polycystic Ovary Syndrome"]["aliases"], "PCOS; PMOS")
        for s in sections:
            self.assertTrue(s["source"] and s["source_accession"] and s["retrieved_on"], s)
        self.assertEqual({(s["term"], s["section"], s["source"]) for s in sections if s["term"] == "Hirsutism"},
                         {("Hirsutism", "definition", "MeSH")})

    def test_a_term_that_neither_source_has_is_reported_and_skipped(self):
        terms, sections = glossary.harvest_glossary(
            [{"term": "Nothing", "mesh_label": "Nothing", "medlineplus_title": "Nothing", "aliases": ""}])
        self.assertEqual((terms, sections), ([], []))
        self.assertEqual(self.unresolved.call_count, 2)


class GlossaryFileTests(unittest.TestCase):
    def test_every_term_has_a_name_and_at_least_one_lookup_and_names_are_unique(self):
        terms = glossary.read_terms()
        self.assertGreaterEqual(len(terms), 40)
        for t in terms:
            self.assertTrue(t["term"], t)
            self.assertTrue(t["mesh_label"] or t["medlineplus_title"], t)
        names = [t["term"].lower() for t in terms]
        self.assertEqual(len(names), len(set(names)))


class ConceptBase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.kb = FixtureKB()
        cls.index = cls.kb.index

    @classmethod
    def tearDownClass(cls):
        cls.kb.close()

    def ask(self, q):
        return rt.retrieve(self.index, q)

    def answer(self, q):
        return rt.compose_extractive(self.ask(q), suggestions=False)


class ConceptIndexTests(ConceptBase):
    def test_concepts_are_built_from_the_glossary_tables(self):
        self.assertEqual({c["name"] for c in self.index.concepts}, {"Polycystic Ovary Syndrome", "Hirsutism", "Insulin Resistance"})
        pcos = next(c for c in self.index.concepts if c["name"] == "Polycystic Ovary Syndrome")
        self.assertEqual(pcos["id"], "concept-polycystic-ovary-syndrome")
        self.assertIn("PCOS", pcos["aliases"])
        self.assertEqual(set(pcos["sections"]), {"definition", "overview", "symptoms", "causes", "diagnosis"})
        self.assertEqual([s["source"] for s in pcos["sources"]], ["mesh", "medlineplus"])

    def test_concepts_are_not_entities_so_they_do_not_appear_in_the_api(self):
        self.assertFalse([e for e in self.index.entities if e["type"] == "concept"])
        self.assertNotIn("concept-hirsutism", self.index.by_id)
        self.assertEqual(pmos_data.search_entities(self.index, "hirsutism"), [])

    def test_a_name_that_is_another_terms_own_heading_is_not_its_alias(self):
        glossary_rows = [("Metabolic Syndrome", "insulin resistance; syndrome x"), ("Insulin Resistance", "")]
        kb = FixtureKB()
        try:
            conn = pmos_data.get_connection()
            conn.execute("DELETE FROM glossary_section")
            conn.execute("DELETE FROM glossary_term")
            conn.executemany("INSERT INTO glossary_term (term, aliases, source, source_accession, retrieved_on) "
                             "VALUES (?,?,?,?,?)", [(t, a, "MeSH", "D1", "2026-01-01") for t, a in glossary_rows])
            concepts = pmos_data.build_concepts(conn)
        finally:
            kb.close()
        self.assertEqual(next(c for c in concepts if c["name"] == "Metabolic Syndrome")["aliases"], ["syndrome x"])


class ConceptRoutingTests(ConceptBase):
    def test_definition_questions_are_answered_from_the_glossary_without_ranking(self):
        for q in ["What is hirsutism", "what is hirsutism?", "define hirsutism", "tell me about hirsutism", "hirsutism"]:
            with self.subTest(q=q):
                r = self.ask(q)
                self.assertEqual((r["intent"], r["status"]), ("concept", "ok"))
                self.assertEqual(r["records"][-1]["id"], "concept-hirsutism")

    def test_aliases_find_the_same_concept(self):
        for q in ["what is PCOS", "what is Stein-Leventhal syndrome"]:
            with self.subTest(q=q):
                self.assertEqual(self.ask(q)["records"][-1]["id"], "concept-polycystic-ovary-syndrome")

    def test_the_answer_is_the_sources_own_text_with_links(self):
        text = self.answer("what is hirsutism")
        self.assertIn("A condition with excess coarse body hair of an adult male distribution pattern.", text)
        self.assertIn("https://meshb.nlm.nih.gov/record/ui?ui=D006628", text)
        self.assertIn("not medical advice", text)

    def test_the_condition_definition_leads_with_the_naming_sentence_then_both_sources(self):
        text = self.answer("what is PMOS")
        self.assertTrue(text.startswith("Polyendocrine metabolic ovarian syndrome (PMOS), previously named"), text)
        self.assertIn("(definition from MeSH)", text)
        self.assertIn("In plain language (MedlinePlus)", text)
        self.assertIn("https://medlineplus.gov/polycysticovarysyndrome.html", text)

    def test_section_questions_return_that_section(self):
        cases = {
            "what are the symptoms of PCOS": "Irregular or missed menstrual periods",
            "what causes PCOS": "The exact cause of PCOS is unknown",
            "how is PCOS diagnosed": "There is no single test for PCOS",
        }
        for q, phrase in cases.items():
            with self.subTest(q=q):
                r = self.ask(q)
                self.assertEqual(r["intent"], "concept")
                self.assertIn(phrase, rt.compose_extractive(r))

    def test_a_section_the_sources_lack_is_said_so_and_the_definition_is_given(self):
        r = self.ask("what are the symptoms of hirsutism")
        self.assertEqual((r["intent"], r["concept"]["missing"]), ("concept", ["symptoms"]))
        text = rt.compose_extractive(r)
        self.assertIn("have no symptoms information for Hirsutism", text)
        self.assertIn("excess coarse body hair", text)

    def test_concept_answers_offer_further_reading_from_the_sources_and_pubmed(self):
        items = rt.further_reading(self.ask("what is hirsutism"))
        self.assertEqual([i["label"] for i in items], ["MeSH: Hirsutism", "Search PubMed: Hirsutism and PCOS"])
        self.assertTrue(all(i["url"].startswith("https://") for i in items))
        self.assertIn("Hirsutism%22+AND+%22polycystic+ovary+syndrome", items[1]["url"])
        condition = rt.further_reading(self.ask("what are the symptoms of PCOS"))
        self.assertEqual([i["label"] for i in condition],
                         ["MeSH: Polycystic Ovary Syndrome", "MedlinePlus: Polycystic Ovary Syndrome", "Search PubMed: PCOS"])

    def test_a_concept_without_any_definition_text_is_left_to_the_normal_path(self):
        conn = pmos_data.get_connection()
        try:
            conn.execute("DELETE FROM glossary_section WHERE term = 'Hirsutism'")
            index = pmos_data.build_index(conn)
        finally:
            conn.close()
        self.assertNotEqual(rt.retrieve(index, "what is hirsutism")["intent"], "concept")

    def test_comparisons_and_relations_are_not_definitions(self):
        for q in ["what is the difference between PCOS and hirsutism", "how does PCOS differ from insulin resistance",
                  "what is the link between hirsutism and insulin resistance", "how does the androgen receptor relate to hirsutism"]:
            with self.subTest(q=q):
                self.assertNotEqual(self.ask(q)["intent"], "concept")

    def test_two_concepts_in_one_question_are_not_answered_as_one(self):
        self.assertNotEqual(self.ask("what is hirsutism and insulin resistance")["intent"], "concept")

    def test_concept_text_never_raises_the_evidence_gate_for_unrelated_questions(self):
        r = self.ask("what is the capital of France")
        self.assertEqual(r["status"], "no_evidence")

    def test_treatment_questions_are_refused_even_when_a_concept_matches(self):
        for q in ["what is the treatment for PCOS", "how is hirsutism treated", "which medication is used for insulin resistance"]:
            with self.subTest(q=q):
                r = self.ask(q)
                self.assertEqual((r["intent"], r["reason"]), ("refuse", "treatment information"))
                self.assertEqual(r["records"], [])


class ConceptChatTests(ConceptBase):
    def setUp(self):
        chat.reset_state()

    def test_concept_answers_never_call_the_model(self):
        calls = []

        def generate(system, prompt, api_key, model):
            calls.append(prompt)
            return "invented"

        out = chat.answer(self.index, "what are the symptoms of PCOS", None, "v1", generate=generate, api_key="k", now=1.0)
        self.assertEqual(calls, [])
        self.assertEqual(out["mode"], "database")
        self.assertIn("Irregular or missed menstrual periods", out["answer"])
        self.assertNotIn("invented", out["answer"])

    def test_concept_answers_carry_the_nih_sources(self):
        out = chat.answer(self.index, "what is hirsutism", None, "v1", generate=None, api_key=None, now=1.0)
        self.assertIn("meshb.nlm.nih.gov", json.dumps(out))


if __name__ == "__main__":
    unittest.main()
