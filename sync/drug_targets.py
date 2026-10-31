"""
Drug -> target genes from Open Targets (mechanisms of action curated by ChEMBL / EMBL-EBI).

Only records returned by the Open Targets Platform API are used; nothing is inferred
from free text. Two guards keep the data honest:
  * the drug must match by exact name (the platform's search ranks by relevance and a
    top hit can be a different compound);
  * a mechanism whose target is a multi-subunit complex (more than MAX_TARGETS_PER_MECHANISM
    genes, e.g. mitochondrial complex I = ~50 subunits) is not expanded into gene links.
"""
from __future__ import annotations

import harvest

SEARCH = """query($q: String!) { search(queryString: $q, entityNames: ["drug"], page: {index: 0, size: 10}) {
  hits { id name } } }"""
DRUG = """query($id: String!) { drug(chemblId: $id) { id name
  mechanismsOfAction { rows { mechanismOfAction actionType targets { id approvedSymbol } } } } }"""

MAX_TARGETS_PER_MECHANISM = 5


def _norm(s: str) -> str:
    return "".join(ch for ch in (s or "").lower() if ch.isalnum())


def _ot(kind: str, key: str, query: str, **variables) -> dict:
    return harvest.fetch("opentargets_drug", f"{kind}_{key}", harvest.OT_URL,
                         json_body={"query": query, "variables": variables})


def lookup_targets(drug_name: str, lookup: str) -> list[dict]:
    """Return target rows for one drug (possibly empty), shaped for the therapeutic_target table."""
    rec = _ot("search", lookup, SEARCH, q=lookup)
    hits = (((rec["response"] or {}).get("data") or {}).get("search") or {}).get("hits") or []
    wanted = {_norm(drug_name), _norm(lookup)}
    hit = next((h for h in hits if _norm(h["name"]) in wanted), None)
    if hit is None:
        harvest.log_unresolved("therapeutic", drug_name, "no exact-name match in Open Targets drug index")
        return []

    rec = _ot("drug", hit["id"], DRUG, id=hit["id"])
    drug = ((rec["response"] or {}).get("data") or {}).get("drug") or {}
    moa = (drug.get("mechanismsOfAction") or {}).get("rows") or []
    if not moa:
        harvest.log_unresolved("therapeutic", drug_name, f"{hit['id']}: no curated mechanism-of-action target")
        return []

    rows = []
    for m in moa:
        targets = m.get("targets") or []
        if len(targets) > MAX_TARGETS_PER_MECHANISM:
            harvest.log_unresolved(
                "therapeutic", drug_name,
                f"mechanism '{m['mechanismOfAction']}' targets a {len(targets)}-gene complex; not expanded")
            continue
        for t in targets:
            rows.append({
                "drug_name": drug_name, "gene_symbol": t["approvedSymbol"].upper(), "ensembl_id": t["id"],
                "chembl_id": hit["id"], "action_type": m.get("actionType"),
                "mechanism_of_action": m.get("mechanismOfAction"),
                "source": "Open Targets", "source_accession": hit["id"], "retrieved_on": harvest.day(rec),
            })
    return rows


def lookup_all(seeds: list[dict]) -> list[dict]:
    rows: list[dict] = []
    for s in seeds:
        if s["entity_type"] == "therapeutic":
            harvest.log(f"drug targets: {s['name']}")
            rows += lookup_targets(s["name"], s["lookup"])
    return rows
