"""
Retrieval for the PMOS chatbot: decide what the knowledge base can support, and gather the evidence.

The chatbot may only say what the records returned here say. Nothing in this module calls an AI model or
the network, so it is deterministic, free and testable. The order of decisions is the anti-hallucination design:

  1. refuse   Questions asking for dosing, personal medical advice or treatment/efficacy claims are refused
              (the site states it makes none), whatever the data holds.
  2. link     Requests for a link, page or identifier are answered straight from the database
              (`compose_extractive`), with no model involved.
  3. qa       Everything else: BM25 over the records plus graph expansion (drug -> target gene -> protein ->
              pathway -> papers), then an evidence gate. If the records do not cover the question the result is
              `no_evidence` and no answer is generated at all.

Every returned record carries a citation ref (R1, R2, ...), the page on this site, and the external source
URLs (UniProt, NCBI Gene, Reactome, PubChem, PubMed), so each statement can be traced.
"""
from __future__ import annotations

import math
import re
import unicodedata
import urllib.parse
from collections import Counter, defaultdict

import pmos_data

# --------------------------------------------------------------------------- tuning

MAX_RECORDS = 16
LISTING_CAP = 12  # when the question asks for a kind of record ("pathways involving X"), list more of them
MAX_SEEDS = 5
MAX_QUERY_CHARS = 300
FIELD_WEIGHTS = {"name": 6.0, "ids": 6.0, "alias": 4.0, "body": 1.0, "context": 0.6}
K1, B = 1.2, 0.75
TYPE_HINT_BOOST = 1.6
MIN_COVERAGE = 0.6   # share of the question's informative words found in the best records
INFORMATIVE_IDF = 2.0  # words appearing in more than ~12% of records ("make", "hormone") say little about the topic
NAME_MATCH_RATIO = 0.5  # share of informative words a record's own name/aliases/identifiers must contain
MIN_SCORE_FACTOR = 0.6  # best BM25F score needed, as a multiple of ln(corpus size), when no entity was named

STOPWORDS = frozenset("""
a an the of in on at to for from by with about and or not no nor me my i you your we our it its this that these those
there here what which who whom whose how why when where is are was were be been being do does did can could would should
will shall may might must have has had having give show tell find get list explain describe please know any some all
more most also than then so if as into between related relate regarding information info details detail mean means
link links url urls page pages website webpage open want need like let lets just really very much many
involve involves involved involving act acts acting affect affects linked part hey
make makes made making produce produces produced create creates
""".split())

# Words that say what kind of record is wanted; they steer ranking rather than matching.
TYPE_HINTS = {
    "gene": "gene", "genes": "gene",
    "protein": "protein", "proteins": "protein", "enzyme": "protein", "enzymes": "protein",
    "pathway": "pathway", "pathways": "pathway",
    "drug": "therapeutic", "drugs": "therapeutic", "compound": "therapeutic", "compounds": "therapeutic",
    "medication": "therapeutic", "medications": "therapeutic", "therapeutic": "therapeutic",
    "therapeutics": "therapeutic",
    "hormone": "hormone", "hormones": "hormone",
    "biomarker": "biomarker", "biomarkers": "biomarker",
    "paper": "publication", "papers": "publication", "publication": "publication", "publications": "publication",
    "study": "publication", "studies": "publication", "article": "publication", "articles": "publication",
    "literature": "publication", "pubmed": "publication",
}

EXPLAIN_PATTERN = re.compile(
    r"\b(mechanism|function|role|how (does|do)|why|explain|describe|tell me about|"
    r"what (is|are|does) .+ (and|,))\b", re.IGNORECASE)

LINK_PATTERN = re.compile(
    r"\b(links?|urls?|hyperlinks?|web ?pages?|websites?|where (can|do|could) (i|we) (find|see|read|get|look)|"
    r"pdbe?|rcsb|alphafold|structures?|crystal|3d|"
    r"(page|record|entry|database entry) (for|of|on)|accessions?|identifiers?|ids?|cid|uniprot|pubchem|reactome|ncbi)\b",
    re.IGNORECASE)

REFUSAL_PATTERNS = [
    ("dosing", re.compile(
        r"\b(dose|doses|dosage|dosages|dosing|how much|how many (mg|milligrams?|tablets?|pills?|capsules?|units)|"
        r"mg|mcg|milligrams?|micrograms?|iu|twice daily|once daily|per day|every (day|morning|night|\d+ hours)|"
        r"how (often|frequently)|how long (should|to|do|can)|when (should|do|to) (i |you |one )?(take|use|start|stop)|"
        r"(be )?taken (with|before|after|daily|twice|once)|intake|(maximum|recommended|safe|daily) (amount|allowance))\b",
        re.IGNORECASE)),
    ("personal medical advice", re.compile(
        r"\b(should i|can i (take|use|stop|start|have|eat|drink|get rid|treat|cure|lose|conceive)|"
        r"how (do|can|should|would) i (treat|cure|manage|reverse|fix|lose|conceive|get pregnant|get rid of|improve my)|"
        r"how to (treat|cure|manage|reverse|get rid of|lose weight|conceive|get pregnant)|"
        r"do i need (to take|a prescription|medication|treatment)|am i (at risk|pregnant|infertile|insulin resistant|"
        r"diabetic)|my (doctor|symptoms?|pcos|period|periods|cycle|weight|hormones?|test results?|blood|diagnosis|"
        r"condition)|prescribe|prescription|diagnose me|treat my|cure my|help me (lose|conceive|get pregnant|treat))\b",
        re.IGNORECASE)),
    ("a treatment or efficacy claim", re.compile(
        r"\b(best (drug|drugs|medicine|medication|treatment|therapy|supplement)|"
        r"which (drug|medicine|medication|treatment|supplement) (is|works|should)|"
        r"(?<!how )does\s+.+?\s+(work\b|cure|treat|help (with|treat|cure|my|women|patients))|"
        r"is\s+.+?\s+(effective|safe|better|worth|good for)|how effective|"
        r"safe (to take|during|in pregnancy)|recommend(ed)? (a |the )?(drug|medicine|medication|treatment|therapy)|"
        r"cure for|side effects?)\b", re.IGNORECASE)),
]

REFUSAL_MESSAGE = (
    "I can't help with {what}. This knowledge base only records sourced associations between genes, proteins, "
    "pathways, compounds and publications. It makes no treatment recommendations, dosing information or claims "
    "of efficacy, and it is not a substitute for a healthcare professional."
)
HELP_PATTERN = re.compile(
    r"^\s*(hi|hello|hey|hiya|good (morning|afternoon|evening)|thanks|thank you|ok|okay|cool|great|bye|help|"
    r"who are you|what are you|what can you do|how do(es)? (this|you) work)\b[\s!.?]*$", re.IGNORECASE)
HELP_MESSAGE = (
    "Hi! I answer questions from the PMOS knowledge base: genes, proteins, pathways, compounds, hormones, "
    "biomarkers and the papers behind them, each with a link to its source record. I only say what those "
    "records say, and I won't give medical advice. Try: \"Link for the androgen receptor\", "
    "\"Which compounds target CYP19A1?\" or \"Papers about hirsutism\"."
)
ENTRY_POINTS = [
    {"id": None, "type": None, "name": "Explore all records", "url": "/explore"},
    {"id": None, "type": None, "name": "Pathways", "url": "/pathways"},
    {"id": None, "type": None, "name": "Therapeutics", "url": "/therapeutics"},
]
LINK_WORDS = frozenset("uniprot pubchem reactome ncbi accession accessions identifier identifiers id ids cid pubmed pmid "
                       "pdb pdbe rcsb alphafold structure crystal 3d".split())
PUBMED_SEARCH = "https://pubmed.ncbi.nlm.nih.gov/?term={}"
SHORT_SOURCE_NAMES = {"pdb": "RCSB PDB", "alphafold": "AlphaFold DB"}
STRUCTURE_WORDS = frozenset("pdb pdbe rcsb alphafold structure crystal 3d".split())  # structures belong to proteins
# "this gene", "its pathways": the question points at the record the visitor is looking at
CONTEXT_CUE = re.compile(r"\b(this|it|its|that|these|those|here|current)\b", re.IGNORECASE)
SEED_RELATIVE_SCORE = 0.35  # extra ranked seeds must score at least this share of the named entity's score
LOOSE_SUGGESTION_FACTOR = 1.8  # a loose match must reach this multiple of ln(corpus size) to be recommended
NO_EVIDENCE_MESSAGE = (
    "I couldn't find this in the knowledge base, so I won't guess. I only answer from the recorded genes, "
    "proteins, pathways, compounds and publications."
)


# --------------------------------------------------------------------------- text helpers

def fold(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "")
    return "".join(c for c in text if unicodedata.category(c) != "Mn").lower()


def _stem(word: str) -> str:
    if len(word) > 4 and word.endswith("ies"):
        return word[:-3] + "y"
    if len(word) > 3 and word.endswith("s") and not word.endswith(("ss", "us", "is")):
        return word[:-1]
    return word


def tokenize(text: str, drop_stopwords: bool = True) -> list[str]:
    """Lower-cased, accent-free tokens. Hyphenated terms yield their joined and split forms
    (n-acetylcysteine -> nacetylcysteine, n, acetylcysteine) so either spelling matches."""
    out: list[str] = []
    for raw in re.findall(r"[a-z0-9]+(?:[-_][a-z0-9]+)*", fold(text)):
        parts = re.split(r"[-_]", raw)
        pieces = ["".join(parts), *parts] if len(parts) > 1 else parts
        for piece in pieces:
            if len(piece) < 2:
                continue
            if drop_stopwords and piece in STOPWORDS:
                continue
            out.append(_stem(piece) if piece.isalpha() else piece)
    return out


def phrase_key(text: str) -> str:
    """Normalised form used for exact name/identifier matching inside a question."""
    return " ".join(re.findall(r"[a-z0-9]+", fold(text)))


def _truncate(text: str | None, limit: int) -> str:
    text = re.sub(r"\s+", " ", text or "").strip()
    if len(text) <= limit:
        return text
    return text[:limit].rsplit(" ", 1)[0] + "…"


def citation(entity: dict) -> str:
    """'Smith et al., 2018' (or the title when authors are not recorded)."""
    authors = entity.get("authors") or []
    year = entity.get("year")
    if not authors:
        return f"{_truncate(entity['name'], 60)}" + (f" ({year})" if year else "")
    parts = authors[0].split(" ")
    if len(parts) > 1 and re.fullmatch(r"[A-Z]{1,4}", parts[-1]):  # stored as "Surname Initials"
        parts = parts[:-1]
    first = " ".join(parts)
    who = f"{first} et al." if len(authors) > 1 else first
    return f"{who}, {year}" if year else who


# --------------------------------------------------------------------------- corpus (BM25F over entities)

def _entity_fields(entity: dict, index) -> dict[str, list[str]]:
    aliases = list(entity.get("aliases") or [])
    ids = [entity["primaryId"], entity.get("symbol"), entity.get("geneSymbol"),
           *[s.get("accession") for s in entity["sources"]],
           *[s["id"] for s in (entity.get("structures") or {}).get("entries", [])]]
    body = [entity.get("description"), entity.get("mechanism"), entity.get("abstract")]
    body += [f"{a['label']} {a['value']}" for a in entity.get("annotations", [])]
    context = []
    for n in pmos_data.get_neighbours(index, entity["id"]):
        context.append(f"{n['relationship']['label']} {n['entity']['name']}")
    if entity["type"] == "publication":
        context += [*(entity.get("authors") or []), entity.get("journal") or "", str(entity.get("year") or "")]
    return {
        "name": tokenize(entity["name"]),
        "ids": tokenize(" ".join(str(i) for i in ids if i), drop_stopwords=False),
        "alias": tokenize(" ".join(aliases)),
        "body": tokenize(" ".join(b for b in body if b)),
        "context": tokenize(" ".join(context)),
    }


class Corpus:
    """In-memory BM25F index over every entity, plus a phrase table for naming entities in a question."""

    def __init__(self, index):
        self.index = index
        self.entities = index.entities
        n = len(self.entities)
        self.fields = [_entity_fields(e, index) for e in self.entities]
        self.tf = [{f: Counter(toks) for f, toks in doc.items()} for doc in self.fields]
        self.avg_len = {f: (sum(len(d[f]) for d in self.fields) / n) or 1.0 for f in FIELD_WEIGHTS}
        df: Counter = Counter()
        self.postings: dict[str, set[int]] = defaultdict(set)
        for i, doc in enumerate(self.fields):
            for tok in {t for toks in doc.values() for t in toks}:
                df[tok] += 1
                self.postings[tok].add(i)
        self.idf = {t: math.log(1 + (n - c + 0.5) / (c + 0.5)) for t, c in df.items()}
        self.vocab_by_doc = [{t for toks in doc.values() for t in toks} for doc in self.fields]
        self.name_tokens = [set(doc["name"]) | set(doc["alias"]) | set(doc["ids"]) for doc in self.fields]
        # score thresholds scale with the corpus (BM25 idf grows with ln N), so they hold as the data grows
        self.min_score = MIN_SCORE_FACTOR * math.log(max(n, 2))
        self.loose_suggestion_score = LOOSE_SUGGESTION_FACTOR * math.log(max(n, 2))

        # exact phrases (names, aliases, identifiers) -> entities
        self.phrases: dict[str, list[int]] = defaultdict(list)
        for i, e in enumerate(self.entities):
            names = [e["name"], *(e.get("aliases") or []), e["primaryId"], e.get("symbol"), e.get("geneSymbol")]
            names += [s.get("accession") for s in e["sources"]]
            names += [s["id"] for s in (e.get("structures") or {}).get("entries", [])]
            for name in names:
                key = phrase_key(name or "")
                if key and not (key.isdigit() and len(key) < 6) and i not in self.phrases[key]:
                    self.phrases[key].append(i)

    # -- ranking
    def search(self, qtokens: list[str], type_hints: set[str] | None = None) -> list[tuple[float, int]]:
        qset = list(dict.fromkeys(qtokens))
        candidates: set[int] = set()
        for t in qset:
            candidates |= self.postings.get(t, set())
        scored = []
        for i in candidates:
            total = 0.0
            for t in qset:
                idf = self.idf.get(t)
                if idf is None:
                    continue
                for field, weight in FIELD_WEIGHTS.items():
                    tf = self.tf[i][field].get(t, 0)
                    if tf:
                        length = len(self.fields[i][field])
                        norm = tf * (K1 + 1) / (tf + K1 * (1 - B + B * length / self.avg_len[field]))
                        total += idf * weight * norm
            if type_hints and self.entities[i]["type"] in type_hints:
                total *= TYPE_HINT_BOOST
            if total > 0:
                scored.append((total, i))
        scored.sort(key=lambda x: (-x[0], self.entities[x[1]]["name"]))
        return scored

    def informative(self, token: str) -> bool:
        """Unknown words and rare words identify a topic; very common words do not."""
        idf = self.idf.get(token)
        return idf is None or idf >= INFORMATIVE_IDF

    def name_match(self, doc_index: int, tokens: list[str]) -> float:
        """Share of `tokens` found in the record's own name, aliases and identifiers (not its description)."""
        return sum(1 for t in tokens if t in self.name_tokens[doc_index]) / len(tokens) if tokens else 1.0

    # -- naming entities in the question
    def find_mentions(self, query: str) -> list[dict]:
        """Entities whose name, alias or identifier appears in the question as a whole phrase.

        Short symbols (AR, FTO) only count when written in capitals, so ordinary words never match."""
        orig = re.findall(r"[A-Za-z0-9]+", query)
        words = [fold(w) for w in orig]
        spans = []
        for start in range(len(words)):
            for end in range(start + 1, min(len(words), start + 9) + 1):
                key = " ".join(words[start:end])
                if key not in self.phrases:
                    continue
                if len(key) < 4 and not all(w == w.upper() for w in orig[start:end]):
                    continue
                spans.append((start, end, key))
        # a mention strictly inside a longer mention is dropped
        spans = [s for s in spans if not any(o != s and o[0] <= s[0] and s[1] <= o[1] and (o[1] - o[0]) > (s[1] - s[0])
                                              for o in spans)]
        mentions, seen = [], set()
        for start, end, key in sorted(spans, key=lambda s: (-(s[1] - s[0]), s[0])):
            ids = [self.entities[i]["id"] for i in self.phrases[key][:4]]
            if (key, tuple(ids)) in seen:
                continue
            seen.add((key, tuple(ids)))
            mentions.append({"text": " ".join(orig[start:end]), "entityIds": ids})
        return mentions


def get_corpus(index) -> Corpus:
    corpus = getattr(index, "_retrieval_corpus", None)
    if corpus is None:
        corpus = Corpus(index)
        index._retrieval_corpus = corpus
    return corpus


# --------------------------------------------------------------------------- graph expansion

def _neighbours(index, entity_id: str, type_: str, label: str | None = None) -> list[dict]:
    out = {}
    for n in pmos_data.get_neighbours(index, entity_id):
        if n["entity"]["type"] == type_ and (label is None or n["relationship"]["label"] == label):
            out[n["entity"]["id"]] = n["entity"]
    return list(out.values())


def _by_evidence(genes: list[dict]) -> list[dict]:
    return sorted(genes, key=lambda g: (-(g.get("pcosAssociation") or {}).get("score", -1), g["name"]))


def _expand(index, e: dict, hints: set[str] | None = None) -> list[tuple[dict, str]]:
    """Records related to `e`, each with a plain-language reason. Capped per category (more of the kind asked for)."""
    out: list[tuple[dict, str]] = []
    name = e["name"]
    t = e["type"]
    hints = hints or set()

    def add(entities, reason, cap):
        if entities and entities[0]["type"] in hints:
            cap = max(cap, LISTING_CAP)
        out.extend((x, reason) for x in entities[:cap])

    if t == "gene":
        proteins = _neighbours(index, e["id"], "protein", "encodes")
        add(proteins, f"protein encoded by {name}", 1)
        add(_neighbours(index, e["id"], "therapeutic", "targets"), f"compound that targets {name}", 4)
        add(_neighbours(index, e["id"], "process"), f"condition associated with {name}", 1)
        pathways = [p for pr in proteins for p in _neighbours(index, pr["id"], "pathway")]
        add(pathways, f"pathway containing the protein encoded by {name}", 5)
        add(_neighbours(index, e["id"], "publication"), f"paper supporting {name}", 3)
    elif t == "protein":
        genes = _neighbours(index, e["id"], "gene", "encodes")
        add(genes, f"gene encoding {name}", 1)
        add([d for g in genes for d in _neighbours(index, g["id"], "therapeutic", "targets")],
            f"compound that targets the gene encoding {name}", 4)
        add(_neighbours(index, e["id"], "pathway"), f"pathway that includes {name}", 5)
        add(_neighbours(index, e["id"], "hormone") + _neighbours(index, e["id"], "biomarker"),
            f"hormone or biomarker associated with {name}", 3)
    elif t == "pathway":
        genes = _by_evidence([g for p in _neighbours(index, e["id"], "protein")
                              for g in _neighbours(index, p["id"], "gene", "encodes")])
        add(genes, f"member gene of {name}", 6)
        drugs = [d for g in genes for d in _neighbours(index, g["id"], "therapeutic", "targets")]
        add(drugs, f"compound whose target is a member gene of {name}", 4)
    elif t == "therapeutic":
        genes = _neighbours(index, e["id"], "gene", "targets")
        add(genes, f"curated target of {name}", 4)
        proteins = [pr for g in genes for pr in _neighbours(index, g["id"], "protein", "encodes")]
        add(proteins, f"protein encoded by a curated target of {name}", 4)
        pathways = [p for pr in proteins for p in _neighbours(index, pr["id"], "pathway")]
        add(pathways, f"pathway reached through the target of {name}", 5)
        add(_neighbours(index, e["id"], "publication"), f"paper supporting {name}", 3)
    elif t in ("hormone", "biomarker"):
        proteins = _neighbours(index, e["id"], "protein")
        add(proteins, f"protein associated with {name}", 2)
        add([g for p in proteins for g in _neighbours(index, p["id"], "gene", "encodes")],
            f"gene encoding a protein associated with {name}", 2)
        add(_neighbours(index, e["id"], "publication"), f"paper supporting {name}", 3)
    elif t == "publication":
        for n in pmos_data.get_neighbours(index, e["id"]):
            out.append((n["entity"], f"subject of {citation(e)}"))
    elif t == "process":
        genes = [g for g in index.entities if g["type"] == "gene" and g.get("pcosAssociation")]
        add(_by_evidence(genes), f"gene associated with {name} (Open Targets)", 8)
    return out


# --------------------------------------------------------------------------- records

def record_text(entity: dict, index) -> str:
    """A compact factual description of one record: the only text a generated answer may draw on."""
    t = entity["type"]
    head = f"{t.capitalize()} {entity['name']} ({entity['idLabel']} {entity['primaryId']})."
    if t == "publication":
        authors = ", ".join((entity.get("authors") or [])[:3]) + (" et al." if len(entity.get("authors") or []) > 3 else "")
        meta = " ".join(x for x in [authors, f"{entity.get('journal')}" if entity.get("journal") else "",
                                    f"({entity['year']})" if entity.get("year") else ""] if x)
        return f"Publication: {entity['name']} {meta}. Abstract: {_truncate(entity.get('abstract'), 900) or 'not available'}"
    parts = [head]
    if entity.get("aliases"):
        parts.append("Also known as " + ", ".join(entity["aliases"][:3]) + ".")
    desc = entity.get("mechanism") if t == "therapeutic" and entity.get("mechanism") else entity.get("description")
    if desc:
        parts.append(("Mechanism: " if t == "therapeutic" else "") + _truncate(desc, 600))
    assoc = entity.get("pcosAssociation")
    if assoc:
        kinds = ", ".join(f"{x['type'].replace('_', ' ')} {x['score']:.2f}" for x in assoc.get("evidenceTypes", [])
                          if x["score"] >= 0.1)
        parts.append(f"Open Targets PCOS association score {assoc['score']:.2f} (rank {assoc['rank']}"
                     f"{' of ' + str(assoc['total']) if assoc.get('total') else ''}); evidence: {kinds or 'n/a'}.")
    ev = entity.get("pcosEvidence")
    if ev:
        parts.append(f"{ev['associatedGenes']} of {ev['memberGenes']} member genes in the knowledge base are "
                     f"associated with PCOS" + (f"; strongest {ev['topGene']} ({ev['topScore']:.2f})." if ev.get("topGene") else "."))
    if t == "protein":
        go = [a["value"] for a in entity.get("annotations", []) if a["label"] == "GO (biological_process)"][:5]
        if go:
            parts.append("Gene Ontology processes: " + "; ".join(go) + ".")
        st = entity.get("structures")
        if st:
            best = ", ".join(
                f"{e['id']} ({e['method'] or 'method not stated'}"
                + (f", {e['resolution']:.2f} Å" if e["resolution"] is not None else "") + ")"
                for e in st["entries"][:3]
            )
            parts.append(
                (f"{st['pdbCount']} experimental structures in the Protein Data Bank; best resolved: {best}. " if best else "")
                + ("An AlphaFold predicted structure is available." if st["alphafoldId"] else "")
            )
    if t == "therapeutic":
        targets = [f"{n['entity']['name']} ({n['relationship'].get('note', '')})".strip()
                   for n in pmos_data.get_neighbours(index, entity["id"])
                   if n["relationship"]["label"] == "targets"]
        if targets:
            parts.append("Curated targets (Open Targets/ChEMBL): " + "; ".join(targets) + ".")
    return " ".join(parts)


def first_sentence(text: str | None, limit: int = 220) -> str:
    text = re.sub(r"\s+", " ", text or "").strip()
    sentence = re.split(r"(?<=[.!?])\s(?=[A-Z])", text, maxsplit=1)[0]
    return _truncate(sentence, limit)


def make_record(ref: str, entity: dict, index, via: str | None = None, score: float | None = None) -> dict:
    external = []
    for s in entity["sources"]:
        if s.get("url"):
            meta = pmos_data.SOURCE_META.get(s["source"])
            name = SHORT_SOURCE_NAMES.get(s["source"]) or (meta[0] if meta else s["source"])
            external.append({"source": name, "url": s["url"], "accession": s.get("accession"),
                             "kind": "structure" if s["source"] in SHORT_SOURCE_NAMES else "record"})
    st = entity.get("structures")
    if st:  # a few more of the best entries, and the page listing every structure of this protein
        have = {x["url"] for x in external}
        for e in st["entries"][1:3]:
            if e["url"] not in have:
                external.append({"source": "RCSB PDB", "url": e["url"], "accession": e["id"], "kind": "structure"})
        if st.get("allUrl"):
            external.append({"source": f"All {st['pdbCount']} structures (PDBe-KB)", "url": st["allUrl"],
                             "accession": None, "kind": "structure"})
    return {
        "ref": ref, "id": entity["id"], "type": entity["type"], "name": entity["name"],
        "idLabel": entity["idLabel"], "primaryId": entity["primaryId"],
        "url": f"/entity/{entity['id']}", "external": external,
        "text": record_text(entity, index), "via": via,
        "summary": first_sentence(entity.get("mechanism") or entity.get("description") or entity.get("abstract")),
        "score": round(score, 2) if score is not None else None,
        "citation": citation(entity) if entity["type"] == "publication" else None,
    }


# --------------------------------------------------------------------------- main entry point

def detect_refusal(query: str) -> str | None:
    for what, pattern in REFUSAL_PATTERNS:
        if pattern.search(query):
            return what
    return None


def _content(query: str, link_intent: bool = False, named_text: str = "") -> tuple[list[str], set[str]]:
    """Content tokens of the question, and the record types it asks for.

    Type words that belong to a name the question already uses ("...transcription pathway") stay part of
    the name; they do not ask for pathways."""
    hints: set[str] = set()
    tokens = []
    protected = set(tokenize(named_text, drop_stopwords=False))
    all_tokens = tokenize(query)
    if link_intent and STRUCTURE_WORDS & set(all_tokens):
        hints.add("protein")
    for tok in all_tokens:
        if tok not in protected and (tok in TYPE_HINTS or _stem(tok) in TYPE_HINTS):
            hints.add(TYPE_HINTS.get(tok) or TYPE_HINTS[_stem(tok)])
            continue
        if link_intent and tok in LINK_WORDS:
            continue
        tokens.append(tok)
    return tokens, hints


def retrieve(index, query: str, limit: int = MAX_RECORDS, context_id: str | None = None) -> dict:
    """Decide what the knowledge base can support for `query` and gather the evidence for it.

    `context_id` is the record the visitor is viewing (or was just answered about). It is used only when the
    question names nothing itself and points at it ("what pathways is this gene in?")."""
    query = re.sub(r"\s+", " ", (query or "")).strip()[:MAX_QUERY_CHARS]
    corpus = get_corpus(index)
    result = {"query": query, "intent": "qa", "status": "ok", "reason": None, "message": None,
              "records": [], "suggestions": [], "mentions": [], "unmatchedTerms": [],
              "confidence": {"anchored": False, "topScore": 0.0, "coverage": 0.0}}
    if not query:
        return {**result, "status": "no_evidence", "reason": "empty question", "message": NO_EVIDENCE_MESSAGE,
                "suggestions": list(ENTRY_POINTS)}

    if HELP_PATTERN.match(query):
        return {**result, "intent": "help", "message": HELP_MESSAGE}

    mentions = corpus.find_mentions(query)
    if not mentions and context_id in corpus.index.by_id and CONTEXT_CUE.search(query):
        mentions = [{"text": "(the record you are viewing)", "entityIds": [context_id]}]
    result["mentions"] = mentions
    link_intent = bool(LINK_PATTERN.search(query)) and not EXPLAIN_PATTERN.search(query)
    qtokens, hints = _content(query, link_intent, " ".join(m["text"] for m in mentions))

    # 1. refuse: not answerable by design, whatever the data holds
    refusal = detect_refusal(query)
    if refusal:
        # point only at what the question named: loose word matches after a refusal are just clutter
        suggestions = _suggest(corpus, [i for m in mentions for i in m["entityIds"]], qtokens, hints, min_score=float("inf"))
        return {**result, "intent": "refuse", "status": "refused", "reason": refusal,
                "message": REFUSAL_MESSAGE.format(what=refusal), "suggestions": suggestions}

    # 2./3. rank candidates
    named = [corpus.index.by_id[i] for m in mentions for i in m["entityIds"] if i in corpus.index.by_id]
    result["intent"] = "link" if link_intent else "qa"
    scored = corpus.search(qtokens, hints)
    top_score = scored[0][0] if scored else 0.0
    result["confidence"]["topScore"] = round(top_score, 2)
    anchored = bool(named)
    result["confidence"]["anchored"] = anchored

    # coverage: how many of the question's informative words appear in the best records
    info = [t for t in qtokens if corpus.informative(t)]
    vocab: set[str] = set()
    if scored:
        vocab = set().union(*(corpus.vocab_by_doc[i] for _, i in scored[:5]))
    if anchored:  # words that are the entity's own name are covered by definition
        named_tokens = {t for e in named for t in tokenize(e["name"] + " " + " ".join(e.get("aliases") or []))}
        coverage = sum(1 for t in info if t in named_tokens or t in vocab) / len(info) if info else 1.0
    elif scored:
        coverage = sum(1 for t in info if t in vocab) / len(info) if info else 1.0
    else:
        coverage = 0.0
    result["confidence"]["coverage"] = round(coverage, 2)

    # does any leading record carry the question's words in its own name (rather than only in its text)?
    name_matched = anchored or any(corpus.name_match(i, info) >= NAME_MATCH_RATIO for _, i in scored[:3])
    result["confidence"]["nameMatch"] = name_matched
    result["evidenceLevel"] = "records" if name_matched else "mentions"

    sufficient = anchored or (top_score >= corpus.min_score and coverage >= MIN_COVERAGE)
    if link_intent and not anchored and not name_matched:
        sufficient = False  # a link must point at a record whose own name matches, never at a loose match
    if not sufficient:
        loose = _suggest(corpus, [], qtokens, hints, min_score=corpus.loose_suggestion_score)
        return {**result, "status": "no_evidence", "reason": "not enough matching records",
                "message": NO_EVIDENCE_MESSAGE, "suggestions": loose}

    # seeds: named entities first (preferred types first), then the best-ranked records
    seeds: list[tuple[dict, float | None]] = []
    seen: set[str] = set()

    def add_seed(entity, score=None):
        if entity["id"] not in seen and len(seeds) < MAX_SEEDS:
            seen.add(entity["id"])
            seeds.append((entity, score))

    score_of = {corpus.entities[i]["id"]: s for s, i in scored}
    for e in sorted(named, key=lambda x: (x["type"] not in hints, )):
        add_seed(e, score_of.get(e["id"]))
    floor = SEED_RELATIVE_SCORE * max((score_of.get(e["id"], 0.0) for e in named), default=0.0)
    for score, i in scored:
        candidate = corpus.entities[i]
        if link_intent and anchored and (candidate["type"] not in hints or candidate["type"] in {e["type"] for e in named}):
            continue  # a link request needs only what it named, plus records of a kind it asked for but did not name
        if anchored and (len(seeds) >= len(named) + 2 or score < floor):
            break
        add_seed(candidate, score)

    # kind: 0 named in the question, 1 linked through the graph, 2 matched only by wording
    named_ids = {e["id"] for e in named}
    linked_to_named: dict[str, str] = {}
    for e, _ in seeds:
        if e["id"] in named_ids:
            for other, via in _expand(index, e, hints):
                linked_to_named.setdefault(other["id"], via)
    entries: list[tuple[dict, str | None, float | None, int]] = []
    for e, s in seeds:
        if e["id"] in named_ids:
            entries.append((e, None, s, 0))
        elif e["id"] in linked_to_named:
            entries.append((e, linked_to_named[e["id"]], s, 1))
        elif anchored:
            entries.append((e, "matches your wording but is not linked to the record you named", s, 2))
        else:
            entries.append((e, None, s, 2))
    named_types = {e["type"] for e in named}
    wanted_types = (hints - named_types) if link_intent else None  # link requests: only kinds asked for but not named
    for entity, _ in list(seeds):
        if link_intent and not wanted_types:
            break
        for other, via in _expand(index, entity, hints):
            if other["id"] not in seen and (wanted_types is None or other["type"] in wanted_types):
                seen.add(other["id"])
                entries.append((other, via, None, 1))
    # the kind of record asked for comes first, and true relationships before wording matches
    entries.sort(key=lambda x: (x[0]["type"] not in hints, x[3]))
    result["records"] = [make_record(f"R{n}", e, index, via, s)
                         for n, (e, via, s, _) in enumerate(entries[:limit], 1)]

    haystack = set()
    for r in result["records"]:
        haystack |= set(tokenize(r["text"] + " " + r["name"]))
    result["unmatchedTerms"] = sorted({t for t in info if t not in haystack})
    return result


def _suggest(corpus: Corpus, entity_ids: list[str], qtokens: list[str], hints: set[str], n: int = 4,
             min_score: float = 0.0) -> list[dict]:
    """Pages worth opening instead: named entities first, then loose matches strong enough to recommend.
    With nothing relevant, fall back to the site's entry points rather than unrelated records."""
    picks: list[dict] = []
    for eid in entity_ids:
        if eid in corpus.index.by_id:
            picks.append(corpus.index.by_id[eid])
    if len(picks) < n:
        for score, i in corpus.search(qtokens, hints)[: n * 2]:
            if score >= min_score:
                picks.append(corpus.entities[i])
    out, seen = [], set()
    for e in picks:
        if e["id"] not in seen and len(out) < n:
            seen.add(e["id"])
            out.append({"id": e["id"], "type": e["type"], "name": e["name"], "url": f"/entity/{e['id']}"})
    return out or list(ENTRY_POINTS)


# --------------------------------------------------------------------------- further reading

def further_reading(result: dict, max_items: int = 9) -> list[dict]:
    """Research links for an answered question, built only from the retrieved records (never by a model):
    papers in the knowledge base (PubMed), a PubMed search on the topic, 3D structures, and source records."""
    if result["status"] != "ok" or result["intent"] != "qa":
        return []
    records = result["records"]
    items: list[dict] = []

    for r in [x for x in records if x["type"] == "publication"][:3]:
        pubmed = next((e for e in r["external"] if e["source"] == "PubMed"), None)
        who = f"{r['citation']}: " if r.get("citation") else ""
        items.append({"kind": "paper", "label": f"{who}{_truncate(r['name'], 90)}",
                      "url": pubmed["url"] if pubmed else r["url"], "external": bool(pubmed)})

    named_ids = {i for m in result["mentions"] for i in m["entityIds"]}
    topic = next((r for r in records if r["id"] in named_ids and r["type"] != "publication"), None) \
        or next((r for r in records if r["type"] != "publication"), None)
    if topic:
        query = "polycystic ovary syndrome" if topic["type"] == "process" else f'"{topic["name"]}" AND "polycystic ovary syndrome"'
        label = "PCOS" if topic["type"] == "process" else f"{topic['name']} and PCOS"
        items.append({"kind": "search", "label": f"Search PubMed: {label}",
                      "url": PUBMED_SEARCH.format(urllib.parse.quote_plus(query)), "external": True})

    structures = [(r, e) for r in records for e in r["external"] if e.get("kind") == "structure"]
    for r, e in structures[:2]:
        items.append({"kind": "structure", "label": f"{e['source']}" + (f" {e['accession']}" if e["accession"] else "")
                      + f" ({r['name']})", "url": e["url"], "external": True})

    shown = 0
    for r in records:
        if r["type"] == "publication" or shown >= 3:
            continue
        link = next((e for e in r["external"] if e.get("kind") == "record"), None)
        if link:
            items.append({"kind": "database", "label": f"{link['source']}: {_truncate(r['name'], 60)}",
                          "url": link["url"], "external": True})
            shown += 1

    seen, unique = set(), []
    for item in items:
        if item["url"] not in seen:
            seen.add(item["url"])
            unique.append(item)
    return unique[:max_items]


# --------------------------------------------------------------------------- answers without a model

def compose_extractive(result: dict, suggestions: bool = True) -> str:
    """A complete answer built only from the records, for link requests and for when no model is available.

    `suggestions=False` leaves out the "Related pages" sentence for callers that show suggestions separately."""
    if result["intent"] == "help":
        return result["message"]
    if result["status"] == "refused":
        text = result["message"]
    elif result["status"] == "no_evidence":
        text = result["message"]
    else:
        records = result["records"]
        if result["intent"] == "link":
            lines = ["Here is what the knowledge base has:"]
            for r in records:
                ext = "; ".join(
                    f"[{x['source']}{' ' + x['accession'] if x.get('kind') == 'structure' and x.get('accession') else ''}]({x['url']})"
                    for x in r["external"])
                lines.append(f"- **{r['name']}** ({r['type']}, {r['idLabel']} {r['primaryId']}): "
                             f"[PMOS page]({r['url']})" + (f"; {ext}" if ext else ""))
            text = "\n".join(lines)
        else:
            lines = ["I couldn't generate a written summary, but these records answer your question:"]
            if result.get("evidenceLevel") == "mentions":
                lines = ["The knowledge base has no record dedicated to this. These records only mention it in passing:"]
            for r in records[:6]:
                src = f" ([{r['external'][0]['source']}]({r['external'][0]['url']}))" if r["external"] else ""
                lines.append(f"- **[{r['name']}]({r['url']})** ({r['type']}): {r['summary'] or 'see the record'}{src} [{r['ref']}]")
            text = "\n".join(lines)
        if result["unmatchedTerms"]:
            text += "\n\nNot found in the knowledge base: " + ", ".join(result["unmatchedTerms"]) + "."
    if suggestions and result["suggestions"] and result["status"] != "ok":
        text += "\n\nRelated pages: " + ", ".join(f"[{s['name']}]({s['url']})" for s in result["suggestions"]) + "."
    return text
