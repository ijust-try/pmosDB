"""
Person B layer: foreign-key mapping, relational stitching, and multi-table search
for the PMOS knowledge base.

Contract with Person C (frontend, pmos-biograph/):
    The dicts returned by `build_entity_dict` / `build_relationship_dict` below are
    shaped to match `src/types/index.ts` in pmos-biograph exactly (Entity, Relationship,
    DataSource, DatasetSummary, ...). `server.py` serves them as JSON with no further
    transformation, so `src/services/normalisers.ts` (currently a pass-through cast)
    does not need to change.

Contract with Person A (data layer, notebook1.ipynb):
    Reads `pmos_knowledge_base.db` (genes, proteins, pathways, hormones, biomarkers,
    therapeutics, publications, go_annotations) and the relationship CSVs Person A
    already produced in data/clean/ (protein_pathway_map.csv, entity_publication_map.csv,
    open_targets_pcos.csv). Column names are untouched, per the contract in README.md.

What this module adds to the database (idempotent — safe to re-run):
    gene_protein_link, protein_pathway_link, entity_publication_link,
    gene_pcos_association, biomarker_protein_link, hormone_protein_link,
    therapeutic_target_candidate
    -- all with real FOREIGN KEY constraints back to Person A's tables.
"""
from __future__ import annotations

import csv
import re
import sqlite3
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "pmos_knowledge_base.db"
CLEAN_DIR = ROOT / "data" / "clean"

DOC = "project-document"  # Verification / RelationStatus: real, sourced data
DEMO_UNVALIDATED = "demo-unvalidated"  # RelationStatus: inferred, not curated

PROCESS_PCOS_ID = "process-pcos"

SOURCE_ID_MAP = {
    "NCBI Gene": "ncbi-gene",
    "UniProt": "uniprot",
    "Reactome": "reactome",
    "PubChem": "pubchem",
    "PubMed": "pubmed",
    "Gene Ontology (QuickGO)": "gene-ontology",
    "Open Targets": "open-targets",
}

SOURCE_URL_BUILDERS = {
    "ncbi-gene": lambda acc: f"https://www.ncbi.nlm.nih.gov/gene/{acc}",
    "uniprot": lambda acc: f"https://www.uniprot.org/uniprotkb/{acc}",
    "reactome": lambda acc: f"https://reactome.org/content/detail/{acc}",
    "pubchem": lambda acc: f"https://pubchem.ncbi.nlm.nih.gov/compound/{acc}",
    "pubmed": lambda acc: f"https://pubmed.ncbi.nlm.nih.gov/{acc}/",
    "gene-ontology": lambda acc: f"https://www.ebi.ac.uk/QuickGO/term/{acc}",
    "open-targets": lambda acc: f"https://platform.opentargets.org/target/{acc}",
}

SOURCE_META = {
    "ncbi-gene": ("NCBI Gene", "Gene identifiers, symbols and summaries", ["gene"]),
    "uniprot": ("UniProt", "Protein identifiers, function and cross-references", ["protein", "hormone", "biomarker"]),
    "reactome": ("Reactome", "Pathway membership for gene products", ["pathway"]),
    "gene-ontology": ("Gene Ontology (QuickGO)", "Functional annotations for proteins", ["protein"]),
    "pubchem": ("PubChem", "Small-molecule hormone and therapeutic identifiers", ["hormone", "therapeutic"]),
    "open-targets": ("Open Targets", "Gene-disease association evidence for PCOS", ["gene", "process"]),
    "pubmed": ("PubMed", "Supporting literature", ["publication"]),
}


# --------------------------------------------------------------------------- helpers

def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value)
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return value or "x"


def norm(value: str) -> str:
    value = unicodedata.normalize("NFD", value or "")
    value = "".join(c for c in value if unicodedata.category(c) != "Mn")
    return value.lower().strip()


def gene_id(symbol: str) -> str:
    return f"gene-{slugify(symbol)}"


def protein_id_for(gene_symbol: str | None, protein_id: str) -> str:
    return f"protein-{slugify(gene_symbol or protein_id)}"


def pathway_id(name: str) -> str:
    return f"pathway-{slugify(name)}"


def hormone_id(name: str) -> str:
    return f"hormone-{slugify(name)}"


def biomarker_id(name: str) -> str:
    return f"biomarker-{slugify(name)}"


def therapeutic_id(name: str) -> str:
    return f"therapeutic-{slugify(name)}"


def publication_id(pmid: str) -> str:
    return f"publication-{pmid}"


def source_ref(source_label: str, accession: str | None, _retrieved_on: str | None) -> dict:
    source_id = SOURCE_ID_MAP.get(source_label, slugify(source_label))
    ref: dict = {"source": source_id, "verification": DOC}
    if accession:
        ref["accession"] = accession
        builder = SOURCE_URL_BUILDERS.get(source_id)
        if builder:
            ref["url"] = builder(accession)
    return ref


def annotation(label: str, value: str) -> dict:
    return {"label": label, "value": value, "verification": DOC}


def natural_sort_key(value: str):
    return [(0, int(tok)) if tok.isdigit() else (1, tok) for tok in re.split(r"(\d+)", value or "")]


# --------------------------------------------------------------------------- connection

def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


# --------------------------------------------------------------------------- schema + FK stitching

_SCHEMA = """
CREATE TABLE IF NOT EXISTS gene_protein_link (
    gene_symbol TEXT NOT NULL REFERENCES genes(gene_symbol),
    protein_id  TEXT NOT NULL REFERENCES proteins(protein_id),
    PRIMARY KEY (gene_symbol, protein_id)
);
CREATE TABLE IF NOT EXISTS protein_pathway_link (
    protein_id  TEXT NOT NULL REFERENCES proteins(protein_id),
    reactome_id TEXT NOT NULL REFERENCES pathways(reactome_id),
    PRIMARY KEY (protein_id, reactome_id)
);
CREATE TABLE IF NOT EXISTS entity_publication_link (
    entity_type TEXT NOT NULL,
    entity_name TEXT NOT NULL,
    pmid        TEXT NOT NULL REFERENCES publications(pmid),
    PRIMARY KEY (entity_type, entity_name, pmid)
);
CREATE TABLE IF NOT EXISTS gene_pcos_association (
    gene_symbol TEXT NOT NULL REFERENCES genes(gene_symbol),
    ensembl_id  TEXT,
    ot_score    REAL,
    ot_rank     INTEGER,
    PRIMARY KEY (gene_symbol)
);
CREATE TABLE IF NOT EXISTS biomarker_protein_link (
    biomarker_name TEXT NOT NULL REFERENCES biomarkers(biomarker_name),
    protein_id     TEXT NOT NULL REFERENCES proteins(protein_id),
    PRIMARY KEY (biomarker_name, protein_id)
);
CREATE TABLE IF NOT EXISTS hormone_protein_link (
    hormone_name TEXT NOT NULL REFERENCES hormones(hormone_name),
    protein_id   TEXT NOT NULL REFERENCES proteins(protein_id),
    PRIMARY KEY (hormone_name, protein_id)
);
CREATE TABLE IF NOT EXISTS therapeutic_target_candidate (
    drug_name    TEXT NOT NULL REFERENCES therapeutics(drug_name),
    gene_symbol  TEXT NOT NULL REFERENCES genes(gene_symbol),
    matched_text TEXT,
    PRIMARY KEY (drug_name, gene_symbol)
);
"""


def _read_csv(name: str) -> list[dict]:
    path = CLEAN_DIR / name
    with path.open(encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def _populate_gene_protein_link(conn: sqlite3.Connection) -> None:
    rows = conn.execute(
        "SELECT gene_symbol, protein_id FROM proteins WHERE gene_symbol IS NOT NULL AND gene_symbol <> ''"
    ).fetchall()
    conn.execute("DELETE FROM gene_protein_link")
    conn.executemany(
        "INSERT OR IGNORE INTO gene_protein_link(gene_symbol, protein_id) VALUES (?, ?)",
        [(r["gene_symbol"], r["protein_id"]) for r in rows],
    )


def _populate_protein_pathway_link(conn: sqlite3.Connection) -> None:
    protein_ids = {r[0] for r in conn.execute("SELECT protein_id FROM proteins")}
    reactome_ids = {r[0] for r in conn.execute("SELECT reactome_id FROM pathways")}
    pairs = {
        (row["protein_id"], row["reactome_id"])
        for row in _read_csv("protein_pathway_map.csv")
        if row["protein_id"] in protein_ids and row["reactome_id"] in reactome_ids
    }
    conn.execute("DELETE FROM protein_pathway_link")
    conn.executemany(
        "INSERT OR IGNORE INTO protein_pathway_link(protein_id, reactome_id) VALUES (?, ?)", sorted(pairs)
    )


def _populate_entity_publication_link(conn: sqlite3.Connection) -> None:
    pmids = {r[0] for r in conn.execute("SELECT pmid FROM publications")}
    known_names = {
        "gene": {r[0] for r in conn.execute("SELECT gene_symbol FROM genes")},
        "hormone": {r[0] for r in conn.execute("SELECT hormone_name FROM hormones")},
        "biomarker": {r[0] for r in conn.execute("SELECT biomarker_name FROM biomarkers")},
        "therapeutic": {r[0] for r in conn.execute("SELECT drug_name FROM therapeutics")},
    }
    rows = {
        (row["entity_type"], row["entity_name"], row["pmid"])
        for row in _read_csv("entity_publication_map.csv")
        if row["pmid"] in pmids and row["entity_name"] in known_names.get(row["entity_type"], set())
    }
    conn.execute("DELETE FROM entity_publication_link")
    conn.executemany(
        "INSERT OR IGNORE INTO entity_publication_link(entity_type, entity_name, pmid) VALUES (?, ?, ?)",
        sorted(rows),
    )


def _populate_gene_pcos_association(conn: sqlite3.Connection) -> None:
    gene_symbols = {r[0] for r in conn.execute("SELECT gene_symbol FROM genes")}
    rows = [
        (row["gene_symbol"], row["ensembl_id"], float(row["ot_score"]), int(row["ot_rank"]))
        for row in _read_csv("open_targets_pcos.csv")
        if row["gene_symbol"] in gene_symbols
    ]
    conn.execute("DELETE FROM gene_pcos_association")
    conn.executemany(
        "INSERT OR IGNORE INTO gene_pcos_association(gene_symbol, ensembl_id, ot_score, ot_rank) "
        "VALUES (?, ?, ?, ?)",
        rows,
    )


def _populate_biomarker_protein_link(conn: sqlite3.Connection) -> None:
    protein_ids = {r[0] for r in conn.execute("SELECT protein_id FROM proteins")}
    rows = conn.execute(
        "SELECT biomarker_name, uniprot_accession FROM biomarkers WHERE uniprot_accession IS NOT NULL"
    ).fetchall()
    conn.execute("DELETE FROM biomarker_protein_link")
    conn.executemany(
        "INSERT OR IGNORE INTO biomarker_protein_link(biomarker_name, protein_id) VALUES (?, ?)",
        [(r["biomarker_name"], r["uniprot_accession"]) for r in rows if r["uniprot_accession"] in protein_ids],
    )


def _populate_hormone_protein_link(conn: sqlite3.Connection) -> None:
    protein_ids = {r[0] for r in conn.execute("SELECT protein_id FROM proteins")}
    rows = conn.execute(
        "SELECT hormone_name, uniprot_accession FROM hormones WHERE uniprot_accession IS NOT NULL"
    ).fetchall()
    conn.execute("DELETE FROM hormone_protein_link")
    conn.executemany(
        "INSERT OR IGNORE INTO hormone_protein_link(hormone_name, protein_id) VALUES (?, ?)",
        [(r["hormone_name"], r["uniprot_accession"]) for r in rows if r["uniprot_accession"] in protein_ids],
    )


def _populate_therapeutic_target_candidates(conn: sqlite3.Connection) -> None:
    """Text-derived candidate gene targets for drugs, from Person A's mechanism text.

    These are NOT a curated source — they are a regex match against the mechanism
    description. Marked RelationStatus = 'demo-unvalidated' downstream so the UI shows
    them as unverified, matching the project's "never infer biology silently" rule.
    """
    genes = conn.execute("SELECT gene_symbol, name FROM genes").fetchall()
    drugs = conn.execute("SELECT drug_name, mechanism FROM therapeutics").fetchall()
    candidates: list[tuple[str, str, str]] = []
    for drug in drugs:
        mechanism = drug["mechanism"] or ""
        for gene in genes:
            symbol_hit = re.search(rf"\b{re.escape(gene['gene_symbol'])}\b", mechanism)
            name_hit = None
            if gene["name"] and len(gene["name"]) >= 12:
                name_hit = re.search(re.escape(gene["name"]), mechanism, re.IGNORECASE)
            match = symbol_hit or name_hit
            if match:
                start = max(0, match.start() - 40)
                end = min(len(mechanism), match.end() + 40)
                snippet = mechanism[start:end].strip()
                candidates.append((drug["drug_name"], gene["gene_symbol"], snippet))
    conn.execute("DELETE FROM therapeutic_target_candidate")
    conn.executemany(
        "INSERT OR IGNORE INTO therapeutic_target_candidate(drug_name, gene_symbol, matched_text) "
        "VALUES (?, ?, ?)",
        candidates,
    )


def init_relationships(conn: sqlite3.Connection) -> None:
    """Create (if needed) and (re)populate all FK-stitched relationship tables."""
    conn.executescript(_SCHEMA)
    _populate_gene_protein_link(conn)
    _populate_protein_pathway_link(conn)
    _populate_entity_publication_link(conn)
    _populate_gene_pcos_association(conn)
    _populate_biomarker_protein_link(conn)
    _populate_hormone_protein_link(conn)
    _populate_therapeutic_target_candidates(conn)
    conn.commit()


# --------------------------------------------------------------------------- raw multi-table SQL search

def sql_search(conn: sqlite3.Connection, term: str, limit: int = 50) -> list[sqlite3.Row]:
    """Literal multi-table SQL search across every entity table (UNION ALL + LIKE).

    Returned rows: (entity_type, name, primary_id, snippet). Used for ad-hoc querying
    straight against the database (e.g. from a notebook), independent of the ranked
    Python search used by the API (`search_entities` below), which exists to reproduce
    the frontend's scoring so mock and real backends feel identical.
    """
    like = f"%{term}%"
    query = """
        SELECT 'gene' AS entity_type, gene_symbol AS name, ncbi_gene_id AS primary_id, description AS snippet
          FROM genes WHERE gene_symbol LIKE ? OR name LIKE ? OR description LIKE ?
        UNION ALL
        SELECT 'protein', name, protein_id, function FROM proteins
          WHERE name LIKE ? OR gene_symbol LIKE ? OR function LIKE ?
        UNION ALL
        SELECT 'pathway', pathway_name, reactome_id, description FROM pathways
          WHERE pathway_name LIKE ? OR description LIKE ?
        UNION ALL
        SELECT 'hormone', hormone_name, pubchem_cid, biological_role FROM hormones
          WHERE hormone_name LIKE ? OR biological_role LIKE ?
        UNION ALL
        SELECT 'biomarker', biomarker_name, uniprot_accession, description FROM biomarkers
          WHERE biomarker_name LIKE ? OR description LIKE ?
        UNION ALL
        SELECT 'therapeutic', drug_name, pubchem_cid, mechanism FROM therapeutics
          WHERE drug_name LIKE ? OR mechanism LIKE ?
        UNION ALL
        SELECT 'publication', title, pmid, journal FROM publications
          WHERE title LIKE ? OR journal LIKE ?
        LIMIT ?
    """
    params = (
        [like, like, like]
        + [like, like, like]
        + [like, like]
        + [like, like]
        + [like, like]
        + [like, like]
        + [like, like]
        + [limit]
    )
    return conn.execute(query, params).fetchall()


# --------------------------------------------------------------------------- entity builders

def build_gene_entity(row: sqlite3.Row) -> dict:
    symbol = row["gene_symbol"]
    aliases = [row["name"]] if row["name"] and row["name"].lower() != symbol.lower() else []
    annotations = []
    if row["uniprot_accession"]:
        annotations.append(annotation("UniProt accession", row["uniprot_accession"]))
    return {
        "id": gene_id(symbol),
        "type": "gene",
        "name": symbol,
        "symbol": symbol,
        "organism": "Homo sapiens",
        "primaryId": row["ncbi_gene_id"] or symbol,
        "idLabel": "NCBI Gene ID" if row["ncbi_gene_id"] else "Gene symbol",
        "aliases": aliases,
        "description": row["description"] or "",
        "sources": [source_ref(row["source"], row["source_accession"], row["retrieved_on"])],
        "annotations": annotations,
        "verification": DOC,
    }


def build_protein_entity(row: sqlite3.Row, go_rows: Iterable[sqlite3.Row]) -> dict:
    gene_symbol = row["gene_symbol"] or None
    annotations = [annotation(f"GO ({go['aspect']})", go["go_name"]) for go in go_rows]
    return {
        "id": protein_id_for(gene_symbol, row["protein_id"]),
        "type": "protein",
        "name": row["name"],
        "geneSymbol": gene_symbol,
        "primaryId": row["protein_id"],
        "idLabel": "UniProt accession",
        "aliases": [gene_symbol] if gene_symbol else [],
        "description": row["function"] or "",
        "sources": [source_ref(row["source"], row["source_accession"], row["retrieved_on"])],
        "annotations": annotations,
        "verification": DOC,
    }


def build_pathway_entity(row: sqlite3.Row) -> dict:
    return {
        "id": pathway_id(row["pathway_name"]),
        "type": "pathway",
        "name": row["pathway_name"],
        "organism": "Homo sapiens",
        "primaryId": row["reactome_id"],
        "idLabel": "Reactome ID",
        "aliases": [],
        "description": row["description"] or "",
        "sources": [source_ref(row["source"], row["source_accession"], row["retrieved_on"])],
        "annotations": [],
        "verification": DOC,
    }


def build_hormone_entity(row: sqlite3.Row) -> dict:
    cid, acc = row["pubchem_cid"], row["uniprot_accession"]
    if cid:
        primary_id, id_label = cid, "PubChem CID"
    elif acc:
        primary_id, id_label = acc, "UniProt accession"
    else:
        primary_id, id_label = row["hormone_name"], "Name"
    entity = {
        "id": hormone_id(row["hormone_name"]),
        "type": "hormone",
        "name": row["hormone_name"],
        "primaryId": primary_id,
        "idLabel": id_label,
        "aliases": [],
        "description": row["biological_role"] or "",
        "sources": [source_ref(row["source"], row["source_accession"], row["retrieved_on"])],
        "annotations": [],
        "verification": DOC,
    }
    if cid:
        entity["chemical"] = {"pubchemCid": cid}
    return entity


def build_biomarker_entity(row: sqlite3.Row) -> dict:
    acc = row["uniprot_accession"]
    primary_id = acc or row["biomarker_name"]
    id_label = "UniProt accession" if acc else "Name"
    annotations = [annotation("Evidence", row["evidence"])] if row["evidence"] else []
    return {
        "id": biomarker_id(row["biomarker_name"]),
        "type": "biomarker",
        "name": row["biomarker_name"],
        "primaryId": primary_id,
        "idLabel": id_label,
        "aliases": [],
        "description": row["description"] or "",
        "sources": [source_ref(row["source"], row["source_accession"], row["retrieved_on"])],
        "annotations": annotations,
        "verification": DOC,
    }


def build_therapeutic_entity(row: sqlite3.Row) -> dict:
    cid = row["pubchem_cid"]
    entity = {
        "id": therapeutic_id(row["drug_name"]),
        "type": "therapeutic",
        "name": row["drug_name"],
        "mechanism": row["mechanism"] or None,
        "primaryId": cid or row["drug_name"],
        "idLabel": "PubChem CID" if cid else "Name",
        "aliases": [],
        "description": row["mechanism"] or "",
        "sources": [source_ref(row["source"], row["source_accession"], row["retrieved_on"])],
        "annotations": [],
        "verification": DOC,
    }
    if cid:
        entity["chemical"] = {"pubchemCid": cid}
    return entity


def build_publication_entity(row: sqlite3.Row) -> dict:
    return {
        "id": publication_id(row["pmid"]),
        "type": "publication",
        "name": row["title"] or row["pmid"],
        "authors": None,
        "year": row["year"],
        "journal": row["journal"],
        "pmid": row["pmid"],
        "evidenceCategory": "literature-reference",
        "primaryId": row["pmid"],
        "idLabel": "PubMed ID",
        "aliases": [],
        "description": row["title"] or "",
        "sources": [source_ref(row["source"], row["source_accession"], row["retrieved_on"])],
        "annotations": [],
        "verification": DOC,
    }


def build_process_entity() -> dict:
    return {
        "id": PROCESS_PCOS_ID,
        "type": "process",
        "name": "Polycystic Ovary Syndrome",
        "primaryId": "PCOS",
        "idLabel": "Condition",
        "aliases": ["PMOS", "Poly Endocrine Metabolic Ovarian Syndrome"],
        "description": (
            "Endocrine-metabolic-ovarian condition this knowledge base integrates evidence around. "
            "Gene links are Open Targets association scores for PCOS."
        ),
        "sources": [
            {
                "source": "open-targets",
                "url": "https://platform.opentargets.org/disease/EFO_0004705",
                "verification": DOC,
            }
        ],
        "annotations": [],
        "verification": DOC,
    }


def relationship(rel_id: str, source: str, target: str, label: str, status: str, note: str | None = None) -> dict:
    rel = {"id": rel_id, "source": source, "target": target, "label": label, "status": status}
    if note:
        rel["note"] = note
    return rel


# --------------------------------------------------------------------------- index

@dataclass
class Index:
    entities: list[dict] = field(default_factory=list)
    by_id: dict[str, dict] = field(default_factory=dict)
    relationships: list[dict] = field(default_factory=list)
    adjacency: dict[str, list[tuple[dict, str]]] = field(default_factory=dict)
    sources_meta: dict[str, dict] = field(default_factory=dict)

    def add_entity(self, entity: dict) -> None:
        self.entities.append(entity)
        self.by_id[entity["id"]] = entity

    def add_relationship(self, rel: dict) -> None:
        self.relationships.append(rel)
        self.adjacency.setdefault(rel["source"], []).append((rel, "out"))
        self.adjacency.setdefault(rel["target"], []).append((rel, "in"))


def build_index(conn: sqlite3.Connection) -> Index:
    index = Index()

    for row in conn.execute("SELECT * FROM genes ORDER BY gene_symbol"):
        index.add_entity(build_gene_entity(row))

    go_by_protein: dict[str, list[sqlite3.Row]] = {}
    for row in conn.execute("SELECT * FROM go_annotations"):
        go_by_protein.setdefault(row["protein_id"], []).append(row)
    for row in conn.execute("SELECT * FROM proteins ORDER BY protein_id"):
        index.add_entity(build_protein_entity(row, go_by_protein.get(row["protein_id"], [])))

    for row in conn.execute("SELECT * FROM pathways ORDER BY pathway_name"):
        index.add_entity(build_pathway_entity(row))
    for row in conn.execute("SELECT * FROM hormones ORDER BY hormone_name"):
        index.add_entity(build_hormone_entity(row))
    for row in conn.execute("SELECT * FROM biomarkers ORDER BY biomarker_name"):
        index.add_entity(build_biomarker_entity(row))
    for row in conn.execute("SELECT * FROM therapeutics ORDER BY drug_name"):
        index.add_entity(build_therapeutic_entity(row))
    for row in conn.execute("SELECT * FROM publications ORDER BY pmid"):
        index.add_entity(build_publication_entity(row))
    index.add_entity(build_process_entity())

    # gene --encodes--> protein
    for row in conn.execute("SELECT gene_symbol, protein_id FROM gene_protein_link"):
        gid, pid = gene_id(row["gene_symbol"]), None
        prot = next((e for e in index.entities if e["type"] == "protein" and e["primaryId"] == row["protein_id"]), None)
        if prot:
            pid = prot["id"]
        if gid in index.by_id and pid in index.by_id:
            index.add_relationship(
                relationship(f"{gid}->{pid}:encodes", gid, pid, "encodes", DOC)
            )

    # protein --participates in--> pathway
    pathway_by_reactome = {e["primaryId"]: e["id"] for e in index.entities if e["type"] == "pathway"}
    protein_by_accession = {e["primaryId"]: e["id"] for e in index.entities if e["type"] == "protein"}
    for row in conn.execute("SELECT protein_id, reactome_id FROM protein_pathway_link"):
        pid = protein_by_accession.get(row["protein_id"])
        pwid = pathway_by_reactome.get(row["reactome_id"])
        if pid and pwid:
            index.add_relationship(
                relationship(f"{pid}->{pwid}:participates", pid, pwid, "participates in", DOC)
            )

    # entity --supported by--> publication
    entity_id_by_type_name = {}
    for e in index.entities:
        if e["type"] == "gene":
            entity_id_by_type_name[("gene", e["symbol"])] = e["id"]
        elif e["type"] in ("hormone", "biomarker", "therapeutic"):
            entity_id_by_type_name[(e["type"], e["name"])] = e["id"]
    for row in conn.execute("SELECT entity_type, entity_name, pmid FROM entity_publication_link"):
        eid = entity_id_by_type_name.get((row["entity_type"], row["entity_name"]))
        pubid = publication_id(row["pmid"])
        if eid and pubid in index.by_id:
            index.add_relationship(
                relationship(f"{eid}->{pubid}:supported", eid, pubid, "supported by", DOC)
            )

    # gene --associated with--> process (PCOS), via Open Targets score
    for row in conn.execute("SELECT gene_symbol, ot_score, ot_rank FROM gene_pcos_association"):
        gid = gene_id(row["gene_symbol"])
        if gid in index.by_id:
            note = f"Open Targets PCOS association score {row['ot_score']:.3f} (rank {row['ot_rank']})"
            index.add_relationship(
                relationship(f"{gid}->{PROCESS_PCOS_ID}:assoc", gid, PROCESS_PCOS_ID, "associated with", DOC, note)
            )

    # biomarker / hormone --associated with--> protein
    for row in conn.execute("SELECT biomarker_name, protein_id FROM biomarker_protein_link"):
        bid = biomarker_id(row["biomarker_name"])
        pid = protein_by_accession.get(row["protein_id"])
        if bid in index.by_id and pid:
            index.add_relationship(relationship(f"{bid}->{pid}:assoc", bid, pid, "associated with", DOC))
    for row in conn.execute("SELECT hormone_name, protein_id FROM hormone_protein_link"):
        hid = hormone_id(row["hormone_name"])
        pid = protein_by_accession.get(row["protein_id"])
        if hid in index.by_id and pid:
            index.add_relationship(relationship(f"{hid}->{pid}:assoc", hid, pid, "associated with", DOC))

    # therapeutic --targets--> gene (text-derived candidate, unvalidated)
    for row in conn.execute("SELECT drug_name, gene_symbol, matched_text FROM therapeutic_target_candidate"):
        tid = therapeutic_id(row["drug_name"])
        gid = gene_id(row["gene_symbol"])
        if tid in index.by_id and gid in index.by_id:
            note = f'Text match in mechanism: "...{row["matched_text"]}..."'
            index.add_relationship(
                relationship(f"{tid}->{gid}:targets", tid, gid, "targets", DEMO_UNVALIDATED, note)
            )

    index.sources_meta = _build_sources_meta(conn, index)
    return index


def _build_sources_meta(conn: sqlite3.Connection, index: Index) -> dict[str, dict]:
    last_sync_by_source: dict[str, str] = {}
    record_count_by_source: dict[str, int] = {}
    for table in ("genes", "proteins", "pathways", "hormones", "biomarkers", "therapeutics", "publications", "go_annotations"):
        for row in conn.execute(f"SELECT source, retrieved_on FROM {table}"):
            sid = SOURCE_ID_MAP.get(row["source"], slugify(row["source"]))
            record_count_by_source[sid] = record_count_by_source.get(sid, 0) + 1
            if row["retrieved_on"] and row["retrieved_on"] > last_sync_by_source.get(sid, ""):
                last_sync_by_source[sid] = row["retrieved_on"]
    ot_count = conn.execute("SELECT COUNT(*) FROM gene_pcos_association").fetchone()[0]
    record_count_by_source["open-targets"] = ot_count
    meta = {}
    for sid, (name, contributes, entity_types) in SOURCE_META.items():
        meta[sid] = {
            "id": sid,
            "name": name,
            "contributes": contributes,
            "entityTypes": entity_types,
            "status": "connected",
            "url": {
                "ncbi-gene": "https://www.ncbi.nlm.nih.gov/gene/",
                "uniprot": "https://www.uniprot.org/",
                "reactome": "https://reactome.org/",
                "gene-ontology": "https://www.ebi.ac.uk/QuickGO/",
                "pubchem": "https://pubchem.ncbi.nlm.nih.gov/",
                "open-targets": "https://platform.opentargets.org/",
                "pubmed": "https://pubmed.ncbi.nlm.nih.gov/",
            }[sid],
            "lastSync": last_sync_by_source.get(sid),
            "validationNote": f"{record_count_by_source.get(sid, 0)} records ingested and cross-referenced during FK stitching.",
        }
    return meta


# --------------------------------------------------------------------------- query API (mirrors Backend interface)

def score_entity(entity: dict, q: str):
    def identifiers_of(e: dict) -> list[str]:
        return [e["primaryId"]] + [s.get("accession") for s in e["sources"] if s.get("accession")]

    best = None

    def consider(score: float, matched_on: str) -> None:
        nonlocal best
        if best is None or score > best["score"]:
            best = {"entity": entity, "score": score, "matchedOn": matched_on}

    name = norm(entity["name"])
    if name == q:
        consider(100, "name")
    elif name.startswith(q):
        consider(82, "name")
    elif q in name:
        consider(62, "name")

    for alias in entity["aliases"]:
        a = norm(alias)
        if a == q:
            consider(92, "alias")
        elif a.startswith(q):
            consider(72, "alias")
        elif q in a:
            consider(52, "alias")

    for ident in identifiers_of(entity):
        i = norm(ident)
        if i == q:
            consider(96, "identifier")
        elif q in i and len(q) >= 2:
            consider(55, "identifier")

    if q in norm(entity["description"]):
        consider(22, "description")

    if best is None:
        tokens = [t for t in q.split() if t]
        if len(tokens) > 1:
            hay = norm(" ".join([entity["name"], *entity["aliases"], *identifiers_of(entity), entity["description"]]))
            if all(t in hay for t in tokens):
                consider(30, "description")
    return best


def search_entities(index: Index, query: str, types=None, sources=None, limit=50) -> list[dict]:
    q = norm(query)
    if not q:
        return []
    hits = []
    for entity in index.entities:
        if types and entity["type"] not in types:
            continue
        if sources and not any(s["source"] in sources for s in entity["sources"]):
            continue
        hit = score_entity(entity, q)
        if hit:
            hits.append(hit)
    hits.sort(key=lambda h: (-h["score"], h["entity"]["name"]))
    return hits[:limit]


def relationship_count(index: Index, entity_id: str) -> int:
    return len(index.adjacency.get(entity_id, []))


def list_entities(index: Index, query: dict) -> dict:
    types = query.get("types")
    sources = query.get("sources")
    sort_by = query.get("sortBy", "name")
    sort_dir = query.get("sortDir", "asc")
    page = int(query.get("page", 1) or 1)
    page_size = int(query.get("pageSize", 10) or 10)
    q = norm(query.get("query") or "")

    items = []
    for entity in index.entities:
        if types and entity["type"] not in types:
            continue
        if sources and not any(s["source"] in sources for s in entity["sources"]):
            continue
        if q and score_entity(entity, q) is None:
            continue
        items.append({"entity": entity, "relationshipCount": relationship_count(index, entity["id"])})

    reverse = sort_dir == "desc"
    if sort_by == "type":
        items.sort(key=lambda x: (x["entity"]["type"], x["entity"]["name"]), reverse=reverse)
    elif sort_by == "primaryId":
        items.sort(key=lambda x: natural_sort_key(x["entity"]["primaryId"]), reverse=reverse)
    elif sort_by == "relationships":
        items.sort(key=lambda x: (x["relationshipCount"], x["entity"]["name"]), reverse=reverse)
    else:
        items.sort(key=lambda x: x["entity"]["name"], reverse=reverse)

    total = len(items)
    start = (page - 1) * page_size
    return {"items": items[start : start + page_size], "total": total, "page": page, "pageSize": page_size}


def get_neighbours(index: Index, entity_id: str) -> list[dict]:
    out = []
    for rel, direction in index.adjacency.get(entity_id, []):
        other_id = rel["target"] if direction == "out" else rel["source"]
        entity = index.by_id.get(other_id)
        if entity:
            out.append({"entity": entity, "relationship": rel, "direction": direction})
    return out


def get_graph(index: Index, focus_id: str, depth: int) -> dict:
    seen = {focus_id}
    frontier = [focus_id]
    for _ in range(depth):
        nxt = []
        for eid in frontier:
            for neighbour in get_neighbours(index, eid):
                nid = neighbour["entity"]["id"]
                if nid not in seen:
                    seen.add(nid)
                    nxt.append(nid)
        frontier = nxt
    return {
        "entities": [e for e in index.entities if e["id"] in seen],
        "relationships": [r for r in index.relationships if r["source"] in seen and r["target"] in seen],
    }


def get_publications(index: Index, query: dict) -> list[dict]:
    q = norm(query.get("query") or "")
    year = query.get("year")
    category = query.get("category")
    entity_id = query.get("entityId")
    items = []
    for entity in index.entities:
        if entity["type"] != "publication":
            continue
        if q and score_entity(entity, q) is None:
            continue
        if year is not None:
            if year == "unknown" and entity["year"] is not None:
                continue
            if year != "unknown" and entity["year"] != year:
                continue
        if category and entity["evidenceCategory"] != category:
            continue
        related = [n["entity"] for n in get_neighbours(index, entity["id"])]
        if entity_id and not any(e["id"] == entity_id for e in related):
            continue
        items.append({"publication": entity, "entities": related})
    return items


def get_summary(index: Index) -> dict:
    types = ["gene", "protein", "hormone", "biomarker", "pathway", "therapeutic", "publication", "process"]
    entity_counts = {t: sum(1 for e in index.entities if e["type"] == t) for t in types}
    validated = sum(1 for r in index.relationships if r["status"] == DOC)
    return {
        "entityCounts": entity_counts,
        "relationshipCount": len(index.relationships),
        "validatedRelationshipCount": validated,
        "unvalidatedRelationshipCount": len(index.relationships) - validated,
        "unverifiedIdentifierCount": sum(1 for e in index.entities if e["verification"] == "unverified-demo"),
    }


def get_sources(index: Index) -> list[dict]:
    return list(index.sources_meta.values())
