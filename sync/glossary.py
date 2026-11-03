"""
Glossary of the concepts people ask about (hirsutism, insulin resistance, what PCOS is, its symptoms and causes ...),
harvested only from two U.S. National Library of Medicine sources:

  * MeSH (Medical Subject Headings): the concise, authoritative definition (scope note) of a term.
  * MedlinePlus Health Topics (NIH): plain-language sections, where a health topic with exactly that title exists.

Nothing is paraphrased or written by hand: every entry is the source's own text plus its identifier and retrieval date.
Which terms to look up is the only hand-written part (glossary_terms.csv).

MedlinePlus search is fuzzy (a search for "Hirsutism" returns the PCOS page), so a topic is accepted only when its
title is exactly the one asked for. Only sections that explain the condition are kept (overview, symptoms, causes,
who is at risk, diagnosis, related health problems). Treatment, prevention and management sections are never stored,
because this site gives no treatment information.
"""
from __future__ import annotations

import csv
import html
import re
import urllib.parse
import xml.etree.ElementTree as ET
from html.parser import HTMLParser

import harvest

GLOSSARY_CSV = harvest.ROOT / "glossary_terms.csv"
MESH_LOOKUP = "https://id.nlm.nih.gov/mesh/lookup/descriptor"
MEDLINEPLUS = "https://wsearch.nlm.nih.gov/ws/query"

# Capitalised words in a MeSH scope note are cross-references to other headings ("WOMEN", "OVARIES"), not emphasis.
# These are real acronyms and stay as they are.
KEEP_UPPERCASE = frozenset("""
AIDS HIV DNA RNA MRNA ATP GTP FSH LH GNRH AMH SHBG PCOS PMOS BMI GWAS SNP CRP DHEA IGF NADH HDL LDL VLDL
""".split())

# MedlinePlus question headings we keep, in the order they are tested. "treat" is excluded before anything else.
# Specific sections are tested first: "What are the symptoms of ...?" also starts with "what are", so the broad
# overview pattern (a heading that is only "What is/are X?") must come last.
SECTION_PATTERNS = [
    ("causes", re.compile(r"\bcaus(e|es)\b")),
    ("risk", re.compile(r"\brisk\b|\bwho (gets|is)\b")),
    ("symptoms", re.compile(r"\b(symptom|sign)s?\b")),
    ("diagnosis", re.compile(r"diagnos")),
    ("complications", re.compile(r"\b(complication|health problems)s?\b")),
    ("overview", re.compile(r"^what (is|are)\b")),
]
EXCLUDED_HEADING = re.compile(r"\b(treat|therap|medic|cure|manag|prevent|living with|outlook)", re.IGNORECASE)


# This site gives no treatment information, so any sentence that talks about treatment, therapy or medicines is left
# out. Sentences are only ever removed, never reworded: what remains is the source's own wording.
TREATMENT_WORDS = re.compile(r"\b(treat\w*|therap\w*|medicat\w*|medicine\w*|prescri\w*|cure\w*|dose\w*|dosage)\b",
                             re.IGNORECASE)


def without_treatment(text: str) -> str:
    lines = []
    for line in text.split("\n"):
        bullet = line.startswith("- ")
        body = line[2:] if bullet else line
        kept = [s for s in re.split(r"(?<=[.!?])\s+(?=[A-Z])", body) if not TREATMENT_WORDS.search(s)]
        if kept:
            lines.append(("- " if bullet else "") + " ".join(kept))
    return "\n".join(lines).strip()


def read_terms() -> list[dict]:
    with GLOSSARY_CSV.open(encoding="utf-8-sig", newline="") as fh:
        return [{k: (v or "").strip() for k, v in row.items()} for row in csv.DictReader(fh)]


# --------------------------------------------------------------------------- MeSH

def tidy_scope_note(text: str) -> str:
    """MeSH writes cross-references in capitals; show them as ordinary words, keeping real acronyms."""
    def fix(match: re.Match) -> str:
        word = match.group(0)
        return word if word in KEEP_UPPERCASE or len(word) < 4 else word.lower()

    text = re.sub(r"\b[A-Z][A-Z-]{3,}\b", fix, text)
    return re.sub(r"\s+", " ", text).strip()


def _lang_value(value) -> str | None:
    if isinstance(value, dict):
        value = value.get("@value")
    return value.strip() if isinstance(value, str) and value.strip() else None


def mesh_entry(label: str) -> dict | None:
    """{id, label, definition, retrieved_on} for an exact MeSH heading, or None."""
    rec = harvest.fetch("mesh", f"lookup_{label}", MESH_LOOKUP, {"label": label, "match": "exact", "limit": 1})
    hits = rec["response"] or []
    if not hits:
        return None
    descriptor_id = hits[0]["resource"].rsplit("/", 1)[-1]
    descriptor = harvest.fetch("mesh", descriptor_id, f"https://id.nlm.nih.gov/mesh/{descriptor_id}.json")["response"] or {}
    concept_url = descriptor.get("preferredConcept")
    if not concept_url:
        return {"id": descriptor_id, "label": hits[0]["label"], "definition": None, "retrieved_on": harvest.day(rec)}
    concept_id = concept_url.rsplit("/", 1)[-1]
    concept = harvest.fetch("mesh", concept_id, f"https://id.nlm.nih.gov/mesh/{concept_id}.json")
    note = _lang_value((concept["response"] or {}).get("scopeNote"))
    definition = without_treatment(tidy_scope_note(note)) if note else ""
    return {"id": descriptor_id, "label": hits[0]["label"], "definition": definition or None,
            "retrieved_on": harvest.day(concept)}


# --------------------------------------------------------------------------- MedlinePlus

class _SummaryParser(HTMLParser):
    """MedlinePlus FullSummary: plain-text question headings followed by <p> and <ul><li> content."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.sections: list[tuple[str, list[str]]] = []
        self._outside, self._inside, self._tag = "", "", None

    def _flush_heading(self) -> None:
        heading = re.sub(r"\s+", " ", self._outside).strip()
        self._outside = ""
        if heading.endswith("?"):
            self.sections.append((heading, []))

    def handle_starttag(self, tag, attrs):
        if tag in ("p", "li"):
            self._flush_heading()
            self._tag, self._inside = tag, ""

    def handle_endtag(self, tag):
        if tag == self._tag:
            text = re.sub(r"\s+", " ", self._inside).strip()
            if text and self.sections:
                self.sections[-1][1].append(f"- {text}" if tag == "li" else text)
            self._tag, self._inside = None, ""

    def handle_data(self, data):
        if self._tag:
            self._inside += data
        else:
            self._outside += data

    def close(self):
        super().close()
        self._flush_heading()


def parse_medlineplus_sections(summary_html: str) -> dict[str, str]:
    """{section: text} for the explanatory sections only; treatment and prevention are dropped."""
    parser = _SummaryParser()
    parser.feed(summary_html)
    parser.close()
    out: dict[str, str] = {}
    for heading, parts in parser.sections:
        lowered = heading.lower()
        if EXCLUDED_HEADING.search(lowered) or not parts:
            continue
        for name, pattern in SECTION_PATTERNS:
            if pattern.search(lowered):
                text = without_treatment("\n".join(parts))
                if text:
                    out.setdefault(name, text)
                break
    return out


def _plain(markup: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", markup or ""))).strip()


def medlineplus_topic(title: str) -> dict | None:
    """The MedlinePlus health topic whose title is exactly `title`: {slug, title, aliases, sections, retrieved_on}."""
    rec = harvest.fetch("medlineplus", f"topic_{title}", MEDLINEPLUS,
                        {"db": "healthTopics", "term": f'"{title}"', "retmax": 5}, as_json=False)
    if not rec["response"]:
        return None
    for doc in ET.fromstring(rec["response"]).findall(".//document"):
        contents = {}
        for c in doc.findall("content"):
            contents.setdefault(c.get("name"), []).append("".join(c.itertext()))
        if _plain(contents.get("title", [""])[0]).lower() != title.lower():
            continue
        url = doc.get("url") or ""
        return {
            "slug": url.rstrip("/").rsplit("/", 1)[-1].removesuffix(".html"),
            "title": _plain(contents["title"][0]),
            "aliases": [_plain(a) for a in contents.get("altTitle", [])],
            "sections": parse_medlineplus_sections(html.unescape("".join(contents.get("FullSummary", [""])))),
            "retrieved_on": harvest.day(rec),
        }
    return None


# --------------------------------------------------------------------------- harvest

def harvest_glossary(terms: list[dict] | None = None) -> tuple[list[dict], list[dict]]:
    """(glossary_term rows, glossary_section rows) for every term in glossary_terms.csv."""
    term_rows, section_rows = [], []
    for t in terms if terms is not None else read_terms():
        name = t["term"]
        harvest.log(f"glossary: {name}")
        mesh = mesh_entry(t["mesh_label"]) if t["mesh_label"] else None
        topic = medlineplus_topic(t["medlineplus_title"]) if t["medlineplus_title"] else None
        if t["mesh_label"] and not mesh:
            harvest.log_unresolved("glossary", name, f"no exact MeSH heading '{t['mesh_label']}'")
        if t["medlineplus_title"] and not topic:
            harvest.log_unresolved("glossary", name, f"no MedlinePlus topic titled '{t['medlineplus_title']}'")
        if not mesh and not topic:
            continue
        aliases = [a for a in t["aliases"].split(";") if a.strip()] + (topic["aliases"] if topic else [])
        primary = mesh or topic
        term_rows.append({
            "term": name, "mesh_id": mesh["id"] if mesh else None,
            "medlineplus_slug": topic["slug"] if topic else None,
            "aliases": "; ".join(dict.fromkeys(a.strip() for a in aliases if a.strip() and a.lower() != name.lower())),
            "source": "MeSH" if mesh else "MedlinePlus",
            "source_accession": mesh["id"] if mesh else topic["slug"],
            "retrieved_on": primary["retrieved_on"],
        })
        if mesh and mesh["definition"]:
            section_rows.append({"term": name, "section": "definition", "text": mesh["definition"], "source": "MeSH",
                                 "source_accession": mesh["id"], "retrieved_on": mesh["retrieved_on"]})
        for section, text in (topic["sections"] if topic else {}).items():
            section_rows.append({"term": name, "section": section, "text": text, "source": "MedlinePlus",
                                 "source_accession": topic["slug"], "retrieved_on": topic["retrieved_on"]})
    harvest.log(f"Glossary: {len(term_rows)} terms, {len(section_rows)} sections")
    return term_rows, section_rows
