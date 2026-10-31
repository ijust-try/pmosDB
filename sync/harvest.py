"""
Data-layer harvest for the PMOS knowledge base (stdlib-only port of notebook1.ipynb).

Every record comes from a public, globally trusted database: NCBI Gene / PubMed
(E-utilities), UniProt, Reactome, Gene Ontology (QuickGO), PubChem and Open Targets.
Nothing is inferred; each row carries source, source_accession and retrieved_on.

`fetch()` caches every API response under data/raw/ exactly like the notebook did
(same file names), so a run with `refresh=False` reproduces the notebook's output
offline. The weekly sync runs with `refresh=True`, which bypasses the cache and
overwrites the raw file with the fresh response.
"""
from __future__ import annotations

import csv
import datetime as dt
import hashlib
import json
import re
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
CLEAN = ROOT / "data" / "clean"
SEED_CSV = ROOT / "seed_entities.csv"

CONTACT_EMAIL = "saarikarajen@gmail.com"
TAXON = 9606
PCOS_EFO = "MONDO_0008487"
PUBS_PER_ENTITY = 3
SEED_COLUMNS = ["entity_type", "name", "lookup", "id_source", "notes"]

OT_URL = "https://api.platform.opentargets.org/api/v4/graphql"
EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"
REACTOME = "https://reactome.org/ContentService/"
QUICKGO = "https://www.ebi.ac.uk/QuickGO/services/"
PUG = "https://pubchem.ncbi.nlm.nih.gov/rest/"

unresolved: list[dict] = []
_state = {"refresh": False}


def log(msg: str) -> None:
    print(msg, flush=True)


def log_unresolved(entity_type: str, name: str, reason: str) -> None:
    unresolved.append({"entity_type": entity_type, "name": name, "reason": reason})
    log(f"  [unresolved] {entity_type}: {name} -> {reason}")


# --------------------------------------------------------------------------- HTTP

def _slug(s) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", str(s)).strip("_")[:50]


def http_json(url: str, params: dict | None = None, json_body: dict | None = None, timeout: int = 60):
    """GET (or POST with json_body). Returns parsed JSON, or None on 404. Retries transient errors."""
    if params:
        url = url + ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    data = json.dumps(json_body).encode() if json_body is not None else None
    headers = {"User-Agent": f"pmos-kb/0.1 ({CONTACT_EMAIL})", "Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, data=data, headers=headers)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                return None
            if attempt == 3 or exc.code not in (429, 500, 502, 503, 504):
                raise
        except (urllib.error.URLError, TimeoutError, ValueError):
            if attempt == 3:
                raise
        time.sleep(2 ** attempt)


def fetch(source, query, url, params=None, json_body=None, delay=0.4) -> dict:
    """Cached API call. Returns {source, query, url, params, retrieved_at, response}."""
    key = hashlib.sha1(json.dumps([url, params, json_body], sort_keys=True, default=str).encode()).hexdigest()[:10]
    path = RAW / f"{source}__{_slug(query)}__{key}.json"
    if path.exists() and not _state["refresh"]:
        return json.loads(path.read_text(encoding="utf-8"))
    resp = http_json(url, params, json_body)
    record = {
        "source": source, "query": str(query), "url": url, "params": params,
        "retrieved_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "response": resp,
    }
    RAW.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(record, indent=1, ensure_ascii=False), encoding="utf-8")
    time.sleep(delay)
    return record


def day(record: dict) -> str:
    return record["retrieved_at"][:10]


def set_refresh(value: bool) -> None:
    _state["refresh"] = value


# --------------------------------------------------------------------------- Open Targets (PCOS)

OT_QUERY = """
query pcos($efo: String!, $index: Int!, $size: Int!) {
  disease(efoId: $efo) {
    id name
    associatedTargets(page: {index: $index, size: $size}) {
      count
      rows { target { id approvedSymbol } score }
    }
  }
}"""


def open_targets_pcos(max_pages: int = 5, size: int = 100) -> list[dict]:
    rows: dict[str, dict] = {}
    name, retrieved = None, None
    for page in range(max_pages):
        rec = fetch("opentargets", f"{PCOS_EFO}_p{page}", OT_URL,
                    json_body={"query": OT_QUERY, "variables": {"efo": PCOS_EFO, "index": page, "size": size}})
        d = ((rec["response"] or {}).get("data") or {}).get("disease")
        if not d:
            break
        name, retrieved = d["name"], day(rec)
        batch = d["associatedTargets"]["rows"]
        for r in batch:
            sym = r["target"]["approvedSymbol"].upper()
            rows.setdefault(sym, {"gene_symbol": sym, "ensembl_id": r["target"]["id"], "ot_score": r["score"]})
        if len(batch) < size:
            break
    assert name and "polycystic" in name.lower(), f"{PCOS_EFO} is not PCOS (got {name!r})"
    ordered = sorted(rows.values(), key=lambda r: -r["ot_score"])
    for rank, r in enumerate(ordered, 1):
        r["ot_rank"] = rank
        r["retrieved_on"] = retrieved
    return ordered


# --------------------------------------------------------------------------- NCBI Gene / PubMed

def eutils(endpoint, source, query, **params):
    params.update({"retmode": "json", "tool": "pmos-kb", "email": CONTACT_EMAIL})
    return fetch(source, query, EUTILS + endpoint, params, delay=0.4)


def ncbi_gene(symbol):
    s = eutils("esearch.fcgi", "ncbigene", symbol, db="gene", term=f"{symbol}[sym] AND {TAXON}[taxid]")
    ids = ((s["response"] or {}).get("esearchresult") or {}).get("idlist", [])
    if not ids:
        return None
    gid = ids[0]
    d = eutils("esummary.fcgi", "ncbigene", symbol, db="gene", id=gid)
    doc = ((d["response"] or {}).get("result") or {}).get(gid)
    if not doc:
        return None
    return {"gene_symbol": doc.get("name"), "name": doc.get("description"), "ncbi_gene_id": gid,
            "description": doc.get("summary") or doc.get("description"),
            "source": "NCBI Gene", "source_accession": gid, "retrieved_on": day(d)}


def pubmed_for(term, n=PUBS_PER_ENTITY):
    q = f"{term} AND polycystic ovary syndrome"
    s = eutils("esearch.fcgi", "pubmed_search", term, db="pubmed", term=q, retmax=n, sort="relevance")
    ids = ((s["response"] or {}).get("esearchresult") or {}).get("idlist", [])
    if not ids:
        return []
    d = eutils("esummary.fcgi", "pubmed_summary", term, db="pubmed", id=",".join(ids))
    result = (d["response"] or {}).get("result") or {}
    out = []
    for pmid in ids:
        doc = result.get(pmid)
        if not doc:
            continue
        m = re.search(r"\d{4}", doc.get("pubdate", "") or "")
        out.append({"pmid": pmid, "title": doc.get("title"), "year": m.group(0) if m else None,
                    "journal": doc.get("source"), "source": "PubMed", "source_accession": pmid,
                    "retrieved_on": day(d)})
    return out


# --------------------------------------------------------------------------- UniProt

def uniprot(symbol):
    rec = fetch("uniprot", symbol, "https://rest.uniprot.org/uniprotkb/search", {
        "query": f"(gene_exact:{symbol}) AND (organism_id:{TAXON}) AND (reviewed:true)",
        "format": "json", "size": 5,
        "fields": "accession,protein_name,gene_primary,cc_function,xref_geneid"})
    results = (rec["response"] or {}).get("results") or []
    if not results:
        return None
    r = next((x for x in results
              if (x.get("genes") or [{}])[0].get("geneName", {}).get("value", "").upper() == symbol.upper()),
             results[0])
    name = (((r.get("proteinDescription") or {}).get("recommendedName") or {}).get("fullName") or {}).get("value")
    func = next((t["value"] for c in r.get("comments", []) if c.get("commentType") == "FUNCTION"
                 for t in c.get("texts", [])), None)
    geneid = next((x["id"] for x in r.get("uniProtKBCrossReferences", []) if x.get("database") == "GeneID"), None)
    return {"protein_id": r["primaryAccession"], "name": name, "function": func,
            "gene_symbol": symbol.upper(), "uniprot_geneid": geneid,
            "source": "UniProt", "source_accession": r["primaryAccession"], "retrieved_on": day(rec)}


# --------------------------------------------------------------------------- Reactome

def _strip_html(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s or "")).strip() or None


def reactome_detail(st_id):
    rec = fetch("reactome", st_id, REACTOME + f"data/query/{st_id}")
    r = rec["response"] or {}
    summ = r.get("summation") or []
    return {"pathway_name": r.get("displayName"), "reactome_id": r.get("stId", st_id),
            "description": _strip_html(summ[0].get("text")) if summ else None,
            "source": "Reactome", "source_accession": r.get("stId", st_id), "retrieved_on": day(rec)}


def reactome_for_uniprot(acc):
    rec = fetch("reactome", f"map_{acc}", REACTOME + f"data/mapping/UniProt/{acc}/pathways", {"species": TAXON})
    return [p["stId"] for p in (rec["response"] or []) if isinstance(p, dict) and p.get("stId")]


def reactome_search(term):
    rec = fetch("reactome", f"search_{term}", REACTOME + "search/query",
                {"query": term, "species": "Homo sapiens", "types": "Pathway", "cluster": "true"})
    hits = []
    for grp in (rec["response"] or {}).get("results", []):
        hits += [e for e in grp.get("entries", []) if e.get("stId")]
    return hits


# --------------------------------------------------------------------------- Gene Ontology (QuickGO)

def quickgo(acc):
    rec = fetch("quickgo", acc, QUICKGO + "annotation/search", {"geneProductId": acc, "limit": 200})
    anns = (rec["response"] or {}).get("results") or []
    ids = sorted({a["goId"] for a in anns if a.get("goId")})
    names = {}
    for i in range(0, len(ids), 50):
        chunk = ids[i:i + 50]
        t = fetch("quickgo_terms", f"{acc}_{i}", QUICKGO + "ontology/go/terms/" + ",".join(chunk))
        for r in (t["response"] or {}).get("results", []):
            names[r["id"]] = (r.get("name"), r.get("aspect"))
    out = []
    for go_id in ids:
        nm, aspect = names.get(go_id, (None, None))
        if aspect in ("biological_process", "molecular_function"):
            out.append({"protein_id": acc, "go_id": go_id, "go_name": nm, "aspect": aspect,
                        "source": "Gene Ontology (QuickGO)", "source_accession": go_id, "retrieved_on": day(rec)})
    return out


# --------------------------------------------------------------------------- PubChem

def _strings(node):
    if isinstance(node, dict):
        if isinstance(node.get("String"), str):
            yield node["String"]
        for v in node.values():
            yield from _strings(v)
    elif isinstance(node, list):
        for v in node:
            yield from _strings(v)


def pubchem(name, want_mechanism=False):
    rec = fetch("pubchem", name, PUG + f"pug/compound/name/{urllib.parse.quote(name, safe='')}/cids/JSON")
    cids = ((rec["response"] or {}).get("IdentifierList") or {}).get("CID") or []
    if not cids:
        return None
    cid = str(cids[0])
    d = fetch("pubchem_desc", cid, PUG + f"pug/compound/cid/{cid}/description/JSON")
    infos = ((d["response"] or {}).get("InformationList") or {}).get("Information") or []
    desc = next((i["Description"] for i in infos if i.get("Description")), None)
    mech = None
    if want_mechanism:
        m = fetch("pubchem_mech", cid, PUG + f"pug_view/data/compound/{cid}/JSON", {"heading": "Mechanism of Action"})
        texts = list(dict.fromkeys(_strings(m["response"] or {})))
        mech = " ".join(texts[:2])[:1000] or None
    return {"pubchem_cid": cid, "description": desc, "mechanism": mech or desc,
            "source": "PubChem", "source_accession": cid, "retrieved_on": day(rec)}


# --------------------------------------------------------------------------- seeds

def read_seeds() -> list[dict]:
    with SEED_CSV.open(encoding="utf-8-sig", newline="") as fh:
        return [{k: (v or "").strip() for k, v in row.items()} for row in csv.DictReader(fh)]


def add_seed_genes(symbols: dict[str, str]) -> list[str]:
    """Append gene seeds (symbol -> note) that are not yet in seed_entities.csv. Returns those added."""
    have = {s["lookup"].upper() for s in read_seeds() if s["entity_type"] == "gene"}
    new = [(sym, note) for sym, note in sorted(symbols.items()) if sym.upper() not in have]
    if new:
        with SEED_CSV.open("a", encoding="utf-8", newline="") as fh:
            w = csv.writer(fh, lineterminator="\n")
            for sym, note in new:
                w.writerow(["gene", sym, sym, "", note])
    return [sym for sym, _ in new]


# --------------------------------------------------------------------------- harvest

def harvest(seeds: list[dict], ot_score: dict[str, float]) -> dict[str, list]:
    raw: dict[str, list] = {k: [] for k in ["genes", "proteins", "pathways", "protein_pathway", "go", "hormones",
                                            "biomarkers", "therapeutics", "publications", "entity_pubs"]}
    pathway_ids_seen: set[str] = set()

    def add_pathway(st_id):
        if st_id not in pathway_ids_seen:
            pathway_ids_seen.add(st_id)
            raw["pathways"].append(reactome_detail(st_id))

    total = len(seeds)
    for i, row in enumerate(seeds):
        et, name, lookup, id_src = row["entity_type"], row["name"], row["lookup"], row["id_source"]
        log(f"[{i / total * 100:5.1f}%] {et}: {name}")

        if et == "gene":
            g = ncbi_gene(lookup)
            if not g:
                log_unresolved("gene", name, "not found in NCBI Gene (human)")
                continue
            if g["gene_symbol"].upper() != lookup.upper():
                log_unresolved("gene", name, f"NCBI returned symbol {g['gene_symbol']}")
            raw["genes"].append(g)
            p = uniprot(lookup)
            if not p:
                log_unresolved("gene", name, "no reviewed UniProt entry")
                continue
            raw["proteins"].append(p)
            for st_id in reactome_for_uniprot(p["protein_id"]):
                raw["protein_pathway"].append(
                    {"protein_id": p["protein_id"], "gene_symbol": lookup.upper(), "reactome_id": st_id})
                add_pathway(st_id)
            raw["go"] += quickgo(p["protein_id"])

        elif et in ("hormone", "biomarker"):
            if id_src == "pubchem":
                c = pubchem(lookup)
                if not c:
                    log_unresolved(et, name, "no PubChem compound")
                    continue
                entry = {"pubchem_cid": c["pubchem_cid"], "uniprot_accession": None,
                         "biological_role": c["description"], "description": c["description"],
                         "source": c["source"], "source_accession": c["source_accession"],
                         "retrieved_on": c["retrieved_on"]}
            else:
                p = uniprot(lookup)
                if not p:
                    log_unresolved(et, name, "no reviewed UniProt entry")
                    continue
                entry = {"pubchem_cid": None, "uniprot_accession": p["protein_id"],
                         "biological_role": p["function"], "description": p["function"],
                         "source": p["source"], "source_accession": p["source_accession"],
                         "retrieved_on": p["retrieved_on"]}
            if et == "hormone":
                raw["hormones"].append({"hormone_name": name, **entry})
            else:
                score = ot_score.get(lookup.upper())
                ev = f"Open Targets PCOS association score {score:.3f}" if score is not None else None
                if ev is None:
                    log_unresolved("biomarker", name, "no Open Targets PCOS association found (evidence left NULL)")
                raw["biomarkers"].append({"biomarker_name": name, "evidence": ev, **entry})

        elif et == "therapeutic":
            c = pubchem(lookup, want_mechanism=True)
            if not c:
                log_unresolved("therapeutic", name, "no PubChem compound")
                continue
            raw["therapeutics"].append({"drug_name": name, **{k: c[k] for k in (
                "mechanism", "pubchem_cid", "source", "source_accession", "retrieved_on")}})

        elif et == "pathway":
            hits = reactome_search(lookup)
            if not hits:
                log_unresolved("pathway", name, "no Reactome match")
                continue
            add_pathway(hits[0]["stId"])

        if et != "pathway":
            for pub in pubmed_for(lookup if et in ("gene", "therapeutic") else name):
                raw["publications"].append(pub)
                raw["entity_pubs"].append({"entity_type": et, "entity_name": name, "pmid": pub["pmid"]})

    log("Harvest counts: " + str({k: len(v) for k, v in raw.items()}))
    return raw


# --------------------------------------------------------------------------- cleaning

PROV = ["source", "source_accession", "retrieved_on"]
COLS = {
    "genes": ["gene_symbol", "name", "ncbi_gene_id", "uniprot_accession", "description"] + PROV,
    "proteins": ["protein_id", "name", "function", "gene_symbol"] + PROV,
    "hormones": ["hormone_name", "biological_role", "pubchem_cid", "uniprot_accession"] + PROV,
    "biomarkers": ["biomarker_name", "evidence", "description", "uniprot_accession"] + PROV,
    "pathways": ["pathway_name", "reactome_id", "description"] + PROV,
    "therapeutics": ["drug_name", "mechanism", "pubchem_cid"] + PROV,
    "publications": ["pmid", "title", "year", "journal"] + PROV,
    "go_annotations": ["protein_id", "go_id", "go_name", "aspect"] + PROV,
    "therapeutic_target": ["drug_name", "gene_symbol", "ensembl_id", "chembl_id", "action_type",
                           "mechanism_of_action"] + PROV,
}


def _tidy(rows: list[dict], cols: list[str]) -> list[dict]:
    out = []
    for r in rows:
        clean = {}
        for c in cols:
            v = r.get(c)
            if isinstance(v, str):
                v = v.strip() or None
            clean[c] = v
        out.append(clean)
    return out


def _dedupe(rows: list[dict], *keys: str) -> list[dict]:
    seen, out = set(), []
    for r in rows:
        k = tuple(r[key] for key in keys)
        if k not in seen:
            seen.add(k)
            out.append(r)
    return out


def _require(rows: list[dict], *keys: str) -> list[dict]:
    return [r for r in rows if all(r[k] is not None for k in keys)]


def clean_all(raw: dict[str, list]) -> dict[str, list[dict]]:
    genes = _tidy(raw["genes"], COLS["genes"])
    for g in genes:
        g["gene_symbol"] = g["gene_symbol"].upper() if g["gene_symbol"] else None
    genes = sorted(_dedupe(_require(genes, "gene_symbol"), "gene_symbol"), key=lambda r: r["gene_symbol"])

    proteins = _tidy(raw["proteins"], COLS["proteins"] + ["uniprot_geneid"])
    for p in proteins:
        p["gene_symbol"] = p["gene_symbol"].upper() if p["gene_symbol"] else None
    proteins = sorted(_dedupe(_require(proteins, "protein_id"), "protein_id"), key=lambda r: r["protein_id"])

    hormones = sorted(_dedupe(_require(_tidy(raw["hormones"], COLS["hormones"]), "hormone_name"), "hormone_name"),
                      key=lambda r: r["hormone_name"])
    biomarkers = sorted(_dedupe(_require(_tidy(raw["biomarkers"], COLS["biomarkers"]), "biomarker_name"),
                                "biomarker_name"), key=lambda r: r["biomarker_name"])
    pathways = _require(_tidy(raw["pathways"], COLS["pathways"]), "pathway_name", "reactome_id")
    pathways = sorted(_dedupe(_dedupe(pathways, "reactome_id"), "pathway_name"), key=lambda r: r["reactome_id"])
    therapeutics = sorted(_dedupe(_require(_tidy(raw["therapeutics"], COLS["therapeutics"]), "drug_name"),
                                  "drug_name"), key=lambda r: r["drug_name"])

    pubs = _tidy(raw["publications"], COLS["publications"])
    for p in pubs:
        p["pmid"] = str(p["pmid"]).strip() if p["pmid"] is not None else None
        p["year"] = int(p["year"]) if p["year"] and str(p["year"]).isdigit() else None
    pubs = sorted(_dedupe(_require(pubs, "pmid"), "pmid"), key=lambda r: r["pmid"])

    go = _tidy(raw["go"], COLS["go_annotations"])
    go = sorted(_dedupe(_require(go, "protein_id", "go_id"), "protein_id", "go_id"),
                key=lambda r: (r["protein_id"], r["go_id"]))

    # NCBI <-> UniProt cross-reference check; only verified/unverifiable accessions are attached to genes
    protein_by_gene = {p["gene_symbol"]: p for p in proteins}
    xref = []
    for g in genes:
        p = protein_by_gene.get(g["gene_symbol"])
        if p is None:
            status = "no_uniprot"
        elif p["uniprot_geneid"] is None:
            status = "unverified"
        else:
            status = "match" if str(p["uniprot_geneid"]) == str(g["ncbi_gene_id"]) else "MISMATCH"
        xref.append({"gene_symbol": g["gene_symbol"], "ncbi_gene_id": g["ncbi_gene_id"],
                     "uniprot_accession": p["protein_id"] if p else None,
                     "uniprot_geneid": p["uniprot_geneid"] if p else None, "check": status})
        if status in ("MISMATCH", "unverified", "no_uniprot"):
            log_unresolved("gene", g["gene_symbol"], f"cross-reference check = {status}")
        g["uniprot_accession"] = p["protein_id"] if p and status in ("match", "unverified") else None

    return {
        "genes": genes, "proteins": proteins, "hormones": hormones, "biomarkers": biomarkers,
        "pathways": pathways, "therapeutics": therapeutics, "publications": pubs, "go_annotations": go,
        "_xref": xref,
        "_protein_pathway": _dedupe(_tidy(raw["protein_pathway"], ["protein_id", "gene_symbol", "reactome_id"]),
                                    "protein_id", "gene_symbol", "reactome_id"),
        "_entity_pubs": _dedupe(_tidy(raw["entity_pubs"], ["entity_type", "entity_name", "pmid"]),
                                "entity_type", "entity_name", "pmid"),
    }


def write_csv(path: Path, rows: list[dict], cols: list[str]) -> None:
    with path.open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols, extrasaction="ignore", lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow({c: ("" if r.get(c) is None else r[c]) for c in cols})


def write_clean(clean: dict[str, list[dict]], ot_rows: list[dict], targets: list[dict], out_dir: Path) -> None:
    """Write the cleaned CSVs into out_dir (a staging dir; promote_clean() moves them into data/clean)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, cols in COLS.items():
        if name == "therapeutic_target":
            continue
        write_csv(out_dir / f"{name}.csv", clean[name], cols + (["uniprot_geneid"] if name == "proteins" else []))
    write_csv(out_dir / "protein_pathway_map.csv", clean["_protein_pathway"], ["protein_id", "gene_symbol", "reactome_id"])
    write_csv(out_dir / "entity_publication_map.csv", clean["_entity_pubs"], ["entity_type", "entity_name", "pmid"])
    write_csv(out_dir / "gene_xref.csv", clean["_xref"],
              ["gene_symbol", "ncbi_gene_id", "uniprot_accession", "uniprot_geneid", "check"])
    write_csv(out_dir / "open_targets_pcos.csv", ot_rows, ["gene_symbol", "ensembl_id", "ot_score", "ot_rank", "retrieved_on"])
    write_csv(out_dir / "therapeutic_targets.csv", targets, COLS["therapeutic_target"])
    write_csv(out_dir / "unresolved_mappings.csv", unresolved, ["entity_type", "name", "reason"])


def promote_clean(staging: Path) -> None:
    """Move validated staged CSVs into place (unresolved_mappings.csv lives at the repo root)."""
    CLEAN.mkdir(parents=True, exist_ok=True)
    for f in staging.iterdir():
        target = (ROOT if f.name == "unresolved_mappings.csv" else CLEAN) / f.name
        f.replace(target)
    staging.rmdir()


# --------------------------------------------------------------------------- database

SCHEMA = """
CREATE TABLE genes (
  gene_symbol TEXT PRIMARY KEY, name TEXT, ncbi_gene_id TEXT, uniprot_accession TEXT, description TEXT,
  source TEXT, source_accession TEXT, retrieved_on TEXT);

CREATE TABLE proteins (
  protein_id TEXT PRIMARY KEY, name TEXT, function TEXT, gene_symbol TEXT,
  source TEXT, source_accession TEXT, retrieved_on TEXT,
  FOREIGN KEY(gene_symbol) REFERENCES genes(gene_symbol));

CREATE TABLE hormones (
  hormone_name TEXT PRIMARY KEY, biological_role TEXT, pubchem_cid TEXT, uniprot_accession TEXT,
  source TEXT, source_accession TEXT, retrieved_on TEXT);

CREATE TABLE biomarkers (
  biomarker_name TEXT PRIMARY KEY, evidence TEXT, description TEXT, uniprot_accession TEXT,
  source TEXT, source_accession TEXT, retrieved_on TEXT);

CREATE TABLE pathways (
  pathway_name TEXT PRIMARY KEY, reactome_id TEXT UNIQUE, description TEXT,
  source TEXT, source_accession TEXT, retrieved_on TEXT);

CREATE TABLE therapeutics (
  drug_name TEXT PRIMARY KEY, mechanism TEXT, pubchem_cid TEXT,
  source TEXT, source_accession TEXT, retrieved_on TEXT);

CREATE TABLE publications (
  pmid TEXT PRIMARY KEY, title TEXT, year INTEGER, journal TEXT,
  source TEXT, source_accession TEXT, retrieved_on TEXT);

CREATE TABLE go_annotations (
  protein_id TEXT, go_id TEXT, go_name TEXT, aspect TEXT,
  source TEXT, source_accession TEXT, retrieved_on TEXT,
  PRIMARY KEY (protein_id, go_id),
  FOREIGN KEY(protein_id) REFERENCES proteins(protein_id));

-- Curated drug -> target records from Open Targets (mechanisms of action curated by ChEMBL).
CREATE TABLE therapeutic_target (
  drug_name TEXT NOT NULL, gene_symbol TEXT NOT NULL, ensembl_id TEXT, chembl_id TEXT,
  action_type TEXT, mechanism_of_action TEXT,
  source TEXT, source_accession TEXT, retrieved_on TEXT,
  PRIMARY KEY (drug_name, gene_symbol),
  FOREIGN KEY(drug_name) REFERENCES therapeutics(drug_name),
  FOREIGN KEY(gene_symbol) REFERENCES genes(gene_symbol));
"""

INGEST_ORDER = ["genes", "proteins", "pathways", "hormones", "biomarkers", "therapeutics", "publications",
                "go_annotations", "therapeutic_target"]


def build_database(db_path: Path, clean: dict[str, list[dict]], targets: list[dict]) -> dict[str, int]:
    """Create a fresh database at db_path and load every harvested table in one transaction."""
    if db_path.exists():
        db_path.unlink()
    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA)
    conn.execute("PRAGMA foreign_keys = ON")
    gene_symbols = {g["gene_symbol"] for g in clean["genes"]}
    drug_names = {t["drug_name"] for t in clean["therapeutics"]}
    tables = dict(clean)
    tables["therapeutic_target"] = _tidy(
        [t for t in targets if t["gene_symbol"] in gene_symbols and t["drug_name"] in drug_names],
        COLS["therapeutic_target"])
    counts = {}
    with conn:
        for table in INGEST_ORDER:
            cols = COLS[table]
            rows = [tuple(r.get(c) for c in cols) for r in tables[table]]
            conn.executemany(f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})", rows)
            counts[table] = len(rows)
    conn.close()
    return counts


def validate_database(db_path: Path) -> list[str]:
    """Subset of the notebook's checks. Returns a list of failure messages (empty = pass)."""
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    failures = []
    keys = {"genes": "gene_symbol", "proteins": "protein_id", "hormones": "hormone_name",
            "biomarkers": "biomarker_name", "pathways": "pathway_name", "therapeutics": "drug_name",
            "publications": "pmid"}
    for t, k in keys.items():
        if conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] == 0:
            failures.append(f"{t} is empty")
        if conn.execute(f"SELECT COUNT(*) FROM {t} WHERE {k} IS NULL OR TRIM({k})=''").fetchone()[0]:
            failures.append(f"{t}.{k} has NULL/blank keys")
    for t in INGEST_ORDER:
        n = conn.execute(f"SELECT COUNT(*) FROM {t} WHERE source IS NULL OR retrieved_on IS NULL "
                         "OR source_accession IS NULL").fetchone()[0]
        if n:
            failures.append(f"{t}: {n} rows missing provenance")
    if conn.execute("PRAGMA foreign_key_check").fetchall():
        failures.append("PRAGMA foreign_key_check reported violations")
    if conn.execute("SELECT ncbi_gene_id FROM genes WHERE gene_symbol='CYP17A1'").fetchone() != ("1586",):
        failures.append("CYP17A1 is not NCBI Gene 1586")
    conn.close()
    return failures
