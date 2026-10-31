import json
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

import _paths  # noqa: F401
import harvest
import server
from fixtures import FixtureKB

EMPTY_RAW = {k: [] for k in ["genes", "proteins", "pathways", "protein_pathway", "go", "hormones",
                             "biomarkers", "therapeutics", "publications", "entity_pubs"]}


def gene(symbol, ncbi="1"):
    return {"gene_symbol": symbol, "name": symbol, "ncbi_gene_id": ncbi, "description": "d",
            "source": "NCBI Gene", "source_accession": ncbi, "retrieved_on": "2026-01-01"}


def protein(acc, symbol, geneid):
    return {"protein_id": acc, "name": "p", "function": "f", "gene_symbol": symbol, "uniprot_geneid": geneid,
            "source": "UniProt", "source_accession": acc, "retrieved_on": "2026-01-01"}


class CleaningTests(unittest.TestCase):
    def setUp(self):
        harvest.unresolved.clear()

    def clean(self, **raw):
        return harvest.clean_all({**EMPTY_RAW, **raw})

    def test_gene_symbols_are_uppercased_and_deduplicated(self):
        out = self.clean(genes=[gene("ar", "367"), gene("AR", "367"), gene("ESR1", "2099")])
        self.assertEqual([g["gene_symbol"] for g in out["genes"]], ["AR", "ESR1"])

    def test_blank_strings_become_null(self):
        out = self.clean(genes=[{**gene("AR"), "description": "   "}])
        self.assertIsNone(out["genes"][0]["description"])

    def test_matching_cross_reference_attaches_uniprot_accession(self):
        out = self.clean(genes=[gene("AR", "367")], proteins=[protein("P10275", "AR", "367")])
        self.assertEqual(out["genes"][0]["uniprot_accession"], "P10275")

    def test_mismatched_cross_reference_is_not_attached(self):
        out = self.clean(genes=[gene("AR", "367")], proteins=[protein("P10275", "AR", "999")])
        self.assertIsNone(out["genes"][0]["uniprot_accession"])
        self.assertEqual(out["_xref"][0]["check"], "MISMATCH")
        self.assertTrue(any(u["name"] == "AR" for u in harvest.unresolved))

    def test_pathways_deduplicated_by_id_and_name(self):
        p = lambda name, rid: {"pathway_name": name, "reactome_id": rid, "description": "d",
                               "source": "Reactome", "source_accession": rid, "retrieved_on": "2026-01-01"}
        out = self.clean(pathways=[p("A", "R-HSA-1"), p("A", "R-HSA-2"), p("B", "R-HSA-1"), p("C", "R-HSA-3")])
        self.assertEqual([x["reactome_id"] for x in out["pathways"]], ["R-HSA-1", "R-HSA-3"])

    def test_publication_year_parsing(self):
        pub = lambda pmid, year: {"pmid": pmid, "title": "t", "year": year, "journal": "j",
                                  "source": "PubMed", "source_accession": pmid, "retrieved_on": "2026-01-01"}
        out = self.clean(publications=[pub("1", "2019"), pub("2", None), pub("3", "n.d.")])
        self.assertEqual([p["year"] for p in out["publications"]], [2019, None, None])


class DatabaseBuildTests(unittest.TestCase):
    def test_drug_targets_for_unknown_genes_are_dropped_not_fatal(self):
        import pathlib, tempfile

        db = pathlib.Path(tempfile.mkdtemp()) / "t.db"
        clean = harvest.clean_all({**EMPTY_RAW, "genes": [gene("AR", "367")],
                                   "therapeutics": [{"drug_name": "Flutamide", "mechanism": "m", "pubchem_cid": "1",
                                                     "source": "PubChem", "source_accession": "1", "retrieved_on": "2026-01-01"}]})
        target = lambda sym: {"drug_name": "Flutamide", "gene_symbol": sym, "ensembl_id": "E", "chembl_id": "C",
                              "action_type": "A", "mechanism_of_action": "M", "source": "Open Targets",
                              "source_accession": "C", "retrieved_on": "2026-01-01"}
        counts = harvest.build_database(db, clean, [target("AR"), target("NOTINDB")])
        self.assertEqual(counts["therapeutic_target"], 1)


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

    def get(self, path):
        with urllib.request.urlopen(self.base + path, timeout=10) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8")), resp.headers

    def test_health(self):
        status, body, _ = self.get("/health")
        self.assertEqual((status, body["status"]), (200, "ok"))

    def test_entity_lookup_and_cors(self):
        status, body, headers = self.get("/entities/gene-ar")
        self.assertEqual(body["pcosAssociation"]["rank"], 2)
        self.assertEqual(headers["Access-Control-Allow-Origin"], "*")

    def test_unknown_entity_is_404(self):
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.get("/entities/gene-nope")
        self.assertEqual(ctx.exception.code, 404)

    def test_neighbours_of_drug_include_its_target(self):
        _, body, _ = self.get("/entities/therapeutic-flutamide/relationships")
        self.assertIn(("gene-ar", "targets"), {(n["entity"]["id"], n["relationship"]["label"]) for n in body})

    def test_graph_endpoint(self):
        _, body, _ = self.get("/graph?focus=therapeutic-flutamide&depth=3")
        self.assertIn("pathway-androgen-biosynthesis", {e["id"] for e in body["entities"]})

    def test_search_endpoint(self):
        _, body, _ = self.get("/search?q=flutamide&types=therapeutic")
        self.assertEqual(body[0]["entity"]["id"], "therapeutic-flutamide")

    def test_sources_endpoint_lists_every_source_once(self):
        _, body, _ = self.get("/sources")
        self.assertEqual(len({s["id"] for s in body}), len(body))
        self.assertIn("open-targets", {s["id"] for s in body})

    def test_sync_endpoint_responds(self):
        status, _, _ = self.get("/sync")
        self.assertEqual(status, 200)


if __name__ == "__main__":
    unittest.main()
