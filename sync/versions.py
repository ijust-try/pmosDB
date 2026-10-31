"""
Cheap "has the source published something new?" checks, one per upstream database.

`gate=True` marks sources that publish numbered releases (UniProt, Reactome, Open Targets).
A change in any of those triggers a full re-harvest. NCBI Gene, PubMed and PubChem update
continuously (their timestamp changes daily), so they are recorded for display but never
trigger a sync on their own; they are refreshed whenever a sync runs.
"""
from __future__ import annotations

import datetime as dt
import json
import urllib.request

import harvest

UA = {"User-Agent": f"pmos-kb/0.1 ({harvest.CONTACT_EMAIL})"}


def _open(url: str, data: bytes | None = None, headers: dict | None = None):
    req = urllib.request.Request(url, data=data, headers={**UA, **(headers or {})})
    return urllib.request.urlopen(req, timeout=40)


def _json(url: str, data: bytes | None = None, headers: dict | None = None):
    with _open(url, data, headers) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _uniprot() -> str:
    with _open("https://rest.uniprot.org/uniprotkb/search?query=gene_exact:AR&size=1&fields=accession") as resp:
        return resp.headers["X-UniProt-Release"]


def _reactome() -> str:
    with _open(harvest.REACTOME + "data/database/version") as resp:
        return resp.read().decode().strip()


def _open_targets() -> str:
    body = json.dumps({"query": "{meta{dataVersion{year month iteration}}}"}).encode()
    v = _json(harvest.OT_URL, body, {"Content-Type": "application/json"})["data"]["meta"]["dataVersion"]
    version = f"{v['year']}.{v['month']}" + (f".{v['iteration']}" if v.get("iteration") else "")
    chembl = _json("https://www.ebi.ac.uk/chembl/api/data/status.json").get("chembl_db_version")
    return f"{version} (ChEMBL {chembl.replace('ChEMBL_', '')})" if chembl else version


def _eutils_lastupdate(db: str):
    def check() -> str:
        info = _json(f"{harvest.EUTILS}einfo.fcgi?db={db}&retmode=json&tool=pmos-kb")
        return info["einforesult"]["dbinfo"][0]["lastupdate"]
    return check


def _gene_ontology() -> str:
    return _json(harvest.QUICKGO + "ontology/go/about")["go"]["timestamp"]


# source id -> (check function, gate)
CHECKS = {
    "uniprot": (_uniprot, True),
    "reactome": (_reactome, True),
    "open-targets": (_open_targets, True),
    "gene-ontology": (_gene_ontology, False),
    "ncbi-gene": (_eutils_lastupdate("gene"), False),
    "pubchem": (_eutils_lastupdate("pccompound"), False),
    "pubmed": (_eutils_lastupdate("pubmed"), False),
}


def check_all() -> dict[str, dict]:
    """source id -> {version, gate, checkedAt}; version is None if the check itself failed."""
    now = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    out = {}
    for sid, (fn, gate) in CHECKS.items():
        try:
            version = fn()
        except Exception as exc:  # network/API hiccup must not abort the run
            harvest.log(f"  [version check failed] {sid}: {exc}")
            version = None
        out[sid] = {"version": version, "gate": gate, "checkedAt": now}
    return out
