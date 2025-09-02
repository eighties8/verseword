#!/usr/bin/env python3
# apply_easton_definitions.py
# Drop-in: replaces definitions in wordDefinitions.json with Easton’s entries
# and extracts all Scripture references into the "examples" array.

from __future__ import annotations
import argparse, json, re, sys
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

# ---------- Scripture reference parsing ----------

BOOK_ALIASES = {
    "Gen.": "Genesis", "Ex.": "Exodus", "Lev.": "Leviticus", "Num.": "Numbers",
    "Deut.": "Deuteronomy", "Josh.": "Joshua", "Judg.": "Judges",
    "Ruth": "Ruth", "1 Sam.": "1 Samuel", "2 Sam.": "2 Samuel",
    "1 Kings": "1 Kings", "2 Kings": "2 Kings",
    "1 Chron.": "1 Chronicles", "2 Chron.": "2 Chronicles",
    "Ezra": "Ezra", "Neh.": "Nehemiah", "Esth.": "Esther",
    "Job": "Job", "Ps.": "Psalms", "Prov.": "Proverbs",
    "Eccles.": "Ecclesiastes", "Song": "Song of Solomon",
    "Isa.": "Isaiah", "Jer.": "Jeremiah", "Lam.": "Lamentations",
    "Ezek.": "Ezekiel", "Dan.": "Daniel",
    "Hos.": "Hosea", "Joel": "Joel", "Amos": "Amos", "Obad.": "Obadiah",
    "Jon.": "Jonah", "Mic.": "Micah", "Nah.": "Nahum", "Hab.": "Habakkuk",
    "Zeph.": "Zephaniah", "Hag.": "Haggai", "Zech.": "Zechariah",
    "Mal.": "Malachi",
    "Matt.": "Matthew", "Matt": "Matthew", "Mark": "Mark",
    "Luke": "Luke", "Luk.": "Luke", "John": "John", "Jn.": "John",
    "Acts": "Acts", "Rom.": "Romans",
    "1 Cor.": "1 Corinthians", "2 Cor.": "2 Corinthians",
    "Gal.": "Galatians", "Eph.": "Ephesians", "Phil.": "Philippians",
    "Col.": "Colossians", "1 Thess.": "1 Thessalonians", "2 Thess.": "2 Thessalonians",
    "1 Tim.": "1 Timothy", "2 Tim.": "2 Timothy", "Tit.": "Titus",
    "Philem.": "Philemon", "Heb.": "Hebrews", "Jas.": "James",
    "1 Pet.": "1 Peter", "2 Pet.": "2 Peter",
    "1 John": "1 John", "2 John": "2 John", "3 John": "3 John",
    "Jude": "Jude", "Rev.": "Revelation",
}

FULL_RX = re.compile(
    r'(?P<book>(?:[1-3]\s*)?[A-Z][A-Za-z. ]+?)\s*(?P<chap>\d+)\s*:\s*(?P<v1>\d+)',
)

def _norm_book(b: str) -> str:
    b = re.sub(r'\s+', ' ', b.strip())
    if b in BOOK_ALIASES: return BOOK_ALIASES[b]
    if b.endswith('.') and b[:-1] in BOOK_ALIASES: return BOOK_ALIASES[b[:-1]]
    return b

def extract_refs(text: str) -> List[str]:
    """Extract refs like 'Matt. 1:16, 20; Luke 2:5; Deut. 20:7; 24:5' → list of fully-qualified refs."""
    refs: List[str] = []
    i, n = 0, len(text)
    while i < n:
        m = FULL_RX.search(text, i)
        if not m: break
        book = _norm_book(m.group('book'))
        chap = int(m.group('chap'))
        v1 = int(m.group('v1'))
        refs.append(f"{book} {chap}:{v1}")
        i = m.end()

        while i < n:
            j = i
            while j < n and text[j].isspace(): j += 1
            if j >= n: i = j; break

            if text[j] == ',':
                j += 1
                m2 = re.match(r'\s*(\d+)(?:\s*-\s*(\d+))?', text[j:])
                if not m2: i = j; break
                vstart = int(m2.group(1))
                vend = int(m2.group(2)) if m2.group(2) else vstart
                for v in range(vstart, vend + 1):
                    refs.append(f"{book} {chap}:{v}")
                i = j + m2.end()
                continue

            if text[j] == ';':
                j += 1
                m3 = re.match(r'\s*(\d+)\s*:\s*(\d+)(?:\s*-\s*(\d+))?', text[j:])
                if m3:
                    chap2 = int(m3.group(1))
                    vstart = int(m3.group(2))
                    vend = int(m3.group(3)) if m3.group(3) else vstart
                    for v in range(vstart, vend + 1):
                        refs.append(f"{book} {chap2}:{v}")
                    i = j + m3.end()
                    continue
                m4 = FULL_RX.match(text, j)
                if m4:
                    book = _norm_book(m4.group('book'))
                    chap = int(m4.group('chap'))
                    v1 = int(m4.group('v1'))
                    refs.append(f"{book} {chap}:{v1}")
                    i = m4.end()
                    continue
                i = j
                break
            break

    out, seen = [], set()
    for r in refs:
        if r not in seen:
            seen.add(r); out.append(r)
    return out

# ---------- Easton loader & index ----------

def _canon_key(s: str) -> str:
    return re.sub(r'[^A-Za-z0-9]+', '', s).upper()

def _variants(term: str) -> Iterable[str]:
    t = term.strip()
    k = _canon_key(t)
    yield k
    # naive singularization for trailing S/ES
    if k.endswith('ES'): yield k[:-2]
    if k.endswith('S'): yield k[:-1]

def load_easton(path: Path) -> Tuple[Dict[str, str], int]:
    """Return index map canonical_key -> body, and count of lines read."""
    idx: Dict[str, str] = {}
    lines = 0
    with path.open(encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line: continue
            lines += 1
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            term = obj.get("term") or obj.get("Term") or obj.get("title") or obj.get("Title")
            body = obj.get("definitions") or obj.get("body") or obj.get("text") or ""
            if isinstance(body, list): body = " ".join(map(str, body))
            body = str(body)
            if not term or not body: continue
            for v in _variants(term):
                # don't overwrite a previously set exact term with a later duplicate
                if v not in idx:
                    idx[v] = body
    return idx, lines

# ---------- wordDefinitions.json helpers ----------

def load_defs(path: Path) -> dict:
    data = json.loads(path.read_text(encoding='utf-8'))
    if "definitions" not in data or not isinstance(data["definitions"], dict):
        raise RuntimeError("wordDefinitions.json missing {\"definitions\": {...}}")
    return data

def save_defs(data: dict, path: Path):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')

# ---------- Merge ----------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--defs", required=True)
    ap.add_argument("--easton", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    defs_path = Path(args.defs)
    easton_path = Path(args.easton)
    out_path = Path(args.out)

    easton_index, lines = load_easton(easton_path)
    print(f"Loaded Easton: {lines} lines, {len(easton_index)} indexed keys")

    data = load_defs(defs_path)
    defs: dict = data["definitions"]

    replaced = 0
    direct = 0
    fuzzy = 0
    missing_words: List[str] = []

    for word, entries in defs.items():
        # wordDefinitions.json stores an array for each WORD key
        match_key = _canon_key(word)
        body = None

        # direct match or simple variants
        if match_key in easton_index:
            body = easton_index[match_key]
            how = "direct"
            direct += 1
        else:
            # try plural/singular variants and spacing/punct changes
            for v in _variants(word):
                if v in easton_index:
                    body = easton_index[v]
                    how = "fuzzy"
                    fuzzy += 1
                    break

        if not body:
            missing_words.append(word)
            continue

        # normalize body and extract scripture refs
        if not isinstance(body, str):
            body = str(body)
        examples = extract_refs(body)

        defs[word] = [{
            "partOfSpeech": "",
            "definitions": [body.strip()],
            "examples": examples,
        }]

        replaced += 1

    save_defs(data, out_path)
    print(f"Replaced {replaced} entries (direct: {direct}, fuzzy: {fuzzy})")
    if missing_words:
        print(f"Missing ({len(missing_words)}):")
        print("\n".join(sorted(set(missing_words))))

if __name__ == "__main__":
    main()