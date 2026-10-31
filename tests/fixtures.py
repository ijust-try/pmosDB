"""A tiny but complete knowledge base (2 genes, 1 drug, 2 pathways) for fast, offline tests."""
import csv
import shutil
import sqlite3
import tempfile
from pathlib import Path

import _paths  # noqa: F401
import harvest
import pmos_data

PROV = ("PubChem", "x", "2026-01-01")


def _write_csv(path: Path, header: list[str], rows: list[list]) -> None:
    with path.open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh, lineterminator="\n")
        w.writerow(header)
        w.writerows(rows)


class FixtureKB:
    """Builds the database and CSVs in a temp dir and points pmos_data at them. Call close() when done."""

    def __init__(self) -> None:
        self.dir = Path(tempfile.mkdtemp(prefix="pmos_test_"))
        self.db_path = self.dir / "kb.db"
        self.clean = self.dir / "clean"
        self.clean.mkdir()
        self._saved = (pmos_data.DB_PATH, pmos_data.CLEAN_DIR)
        self._build()
        pmos_data.DB_PATH, pmos_data.CLEAN_DIR = self.db_path, self.clean
        conn = pmos_data.get_connection()
        pmos_data.init_relationships(conn)
        self.index = pmos_data.build_index(conn)
        conn.close()

    def _build(self) -> None:
        conn = sqlite3.connect(self.db_path)
        conn.executescript(harvest.SCHEMA)
        ncbi = ("NCBI Gene",)
        conn.executemany(
            "INSERT INTO genes VALUES (?,?,?,?,?,?,?,?)",
            [
                ("AR", "androgen receptor", "367", "P10275", "Androgen receptor gene", *ncbi, "367", "2026-01-01"),
                ("ESR1", "estrogen receptor 1", "2099", "P03372", "Estrogen receptor gene", *ncbi, "2099", "2026-01-01"),
            ],
        )
        conn.executemany(
            "INSERT INTO proteins VALUES (?,?,?,?,?,?,?)",
            [
                ("P10275", "Androgen receptor", "Steroid hormone receptor", "AR", "UniProt", "P10275", "2026-01-01"),
                ("P03372", "Estrogen receptor", "Steroid hormone receptor", "ESR1", "UniProt", "P03372", "2026-01-01"),
            ],
        )
        conn.executemany(
            "INSERT INTO pathways VALUES (?,?,?,?,?,?)",
            [
                ("Nuclear Receptor transcription pathway", "R-HSA-383280", "NR signalling", "Reactome", "R-HSA-383280", "2026-01-01"),
                ("Androgen biosynthesis", "R-HSA-193048", "Androgen synthesis", "Reactome", "R-HSA-193048", "2026-01-01"),
            ],
        )
        conn.execute(
            "INSERT INTO therapeutics VALUES (?,?,?,?,?,?)",
            ("Flutamide", "Flutamide blocks androgen receptors.", "3397", *PROV[:1], "3397", "2026-01-01"),
        )
        conn.execute(
            "INSERT INTO therapeutics VALUES (?,?,?,?,?,?)",
            ("Inositol", "Mechanism not fully understood.", "892", "PubChem", "892", "2026-01-01"),
        )
        conn.execute(
            "INSERT INTO publications VALUES (?,?,?,?,?,?,?)",
            ("111", "Androgens and PCOS", 2009, "Curr Opin", "PubMed", "111", "2026-01-01"),
        )
        conn.execute(
            "INSERT INTO therapeutic_target VALUES (?,?,?,?,?,?,?,?,?)",
            ("Flutamide", "AR", "ENSG00000169083", "CHEMBL806", "ANTAGONIST", "Androgen Receptor antagonist",
             "Open Targets", "CHEMBL806", "2026-01-01"),
        )
        conn.commit()
        conn.close()

        _write_csv(self.clean / "protein_pathway_map.csv", ["protein_id", "gene_symbol", "reactome_id"], [
            ["P10275", "AR", "R-HSA-383280"], ["P03372", "ESR1", "R-HSA-383280"], ["P10275", "AR", "R-HSA-193048"],
        ])
        _write_csv(self.clean / "entity_publication_map.csv", ["entity_type", "entity_name", "pmid"], [["gene", "AR", "111"]])
        _write_csv(self.clean / "open_targets_pcos.csv", ["gene_symbol", "ensembl_id", "ot_score", "ot_rank", "datatypes", "retrieved_on"], [
            ["ESR1", "ENSG00000091831", "0.6", "1", "literature:0.94;clinical:0.93", "2026-01-01"],
            ["AR", "ENSG00000169083", "0.5", "2", "genetic_association:0.80", "2026-01-01"],
            ["NOTINKB", "ENSG0", "0.4", "3", "clinical:0.69", "2026-01-01"],
        ])

    def close(self) -> None:
        pmos_data.DB_PATH, pmos_data.CLEAN_DIR = self._saved
        shutil.rmtree(self.dir, ignore_errors=True)
