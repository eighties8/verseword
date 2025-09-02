#!/usr/bin/env python3
# python3 scripts/build_word_definitions_full.py --puzzles lib/data/puzzles-2025.json --out lib/data/wordDefinitions.json
# Builds complete word definitions from dictionaryapi.dev (no pronunciation).
# Usage:
# python3 build_word_definitions_full.py --puzzles lib/data/puzzles-2025.json --out lib/data/wordDefinitions.json
# python3 build_word_definitions_full.py --puzzles lib/data/puzzles-2025.json --out lib/data/wordDefinitions.json --force
# python3 build_word_definitions_full.py --puzzles lib/data/puzzles-2025.json --out lib/data/wordDefinitions.json --flat

import argparse, json, time
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError

API = "https://api.dictionaryapi.dev/api/v2/entries/en/"
UA  = "VerseWord/1.0 (+dictionaryapi.dev client)"

def load_puzzles(path: Path) -> list[str]:
    data = json.loads(path.read_text(encoding="utf-8"))
    words = []
    if isinstance(data, dict):
        for _, v in data.items():
            w = (v.get("word") or v.get("answer") or "").strip()
            if w:
                words.append(w.upper())
    elif isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                w = (item.get("word") or item.get("answer") or "").strip()
            else:
                w = str(item).strip()
            if w:
                words.append(w.upper())
    # de-dupe preserving order
    seen, out = set(), []
    for w in words:
        if w not in seen:
            seen.add(w); out.append(w)
    return out

def load_existing(out_path: Path) -> dict:
    if not out_path.exists():
        return {"metadata": {"apiEndpoint": API}, "definitions": {}}
    try:
        obj = json.loads(out_path.read_text(encoding="utf-8"))
        if not isinstance(obj, dict): raise ValueError
        defs = obj.get("definitions") or {}
        if not isinstance(defs, dict): defs = {}
        meta = obj.get("metadata") or {}
        if not isinstance(meta, dict): meta = {"apiEndpoint": API}
        return {"metadata": meta, "definitions": defs}
    except Exception:
        return {"metadata": {"apiEndpoint": API}, "definitions": {}}

def fetch_entry(word: str, timeout: float = 15.0):
    url = API + word.lower()
    req = Request(url, headers={"User-Agent": UA})
    try:
        with urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8", errors="replace"))
    except HTTPError as e:
        if e.code == 404:
            return None
        return None
    except URLError:
        return None
    except Exception:
        return None

def to_structured(payload) -> list[dict]:
    """
    Returns a list like:
    [
      {
        "partOfSpeech": "noun",
        "definitions": ["full sentence …", ...],
        "examples": ["example sentence …", ...]
      },
      ...
    ]
    """
    out = []
    if not isinstance(payload, list):
        return out
    for entry in payload:
        meanings = entry.get("meanings") or []
        for m in meanings:
            pos = (m.get("partOfSpeech") or "").strip()
            defs_raw = m.get("definitions") or []
            defs, exs = [], []
            for d in defs_raw:
                txt = (d.get("definition") or "").strip()
                if txt: defs.append(txt)
                ex = (d.get("example") or "").strip()
                if ex: exs.append(ex)
            if defs:
                out.append({
                    "partOfSpeech": pos,
                    "definitions": defs,
                    "examples": exs
                })
    return out

from typing import Optional, List, Dict

def best_single_definition(structured: List[Dict]) -> Optional[str]:
    for block in structured:
        for d in block.get("definitions", []):
            if d: return d
    return None

def main():
    ap = argparse.ArgumentParser(description="Build complete word definitions from dictionaryapi.dev (no pronunciation).")
    ap.add_argument("--puzzles", required=True, help="path to puzzles-2025.json")
    ap.add_argument("--out", default="lib/data/wordDefinitions.json", help="output JSON path")
    ap.add_argument("--sleep", type=float, default=0.6, help="seconds between API calls")
    ap.add_argument("--max", type=int, default=0, help="limit number of words to fetch (0=all)")
    ap.add_argument("--force", action="store_true", help="re-fetch even if word already present")
    ap.add_argument("--flat", action="store_true", help='output as {"WORD":"first full definition"} instead of structured blocks')
    args = ap.parse_args()

    puzzles_path = Path(args.puzzles)
    out_path = Path(args.out)

    words = load_puzzles(puzzles_path)
    store = load_existing(out_path)
    defs = store["definitions"]

    # Determine todo list
    todo = [w for w in words if args.force or w not in defs or not defs[w]]
    if args.max and args.max > 0:
        todo = todo[:args.max]

    fetched = 0
    missing = []

    for i, w in enumerate(todo, 1):
        payload = fetch_entry(w)
        structured = to_structured(payload) if payload else []
        if args.flat:
            chosen = best_single_definition(structured)
            if chosen:
                defs[w] = chosen
                fetched += 1
            else:
                # leave empty to fill later from a biblical source
                defs[w] = defs.get(w, "")
                missing.append(w)
        else:
            if structured:
                defs[w] = structured
                fetched += 1
            else:
                defs[w] = defs.get(w, [])
                missing.append(w)

        if i < len(todo) and args.sleep > 0:
            time.sleep(args.sleep)

    # Write output
    out = {
        "metadata": {
            "apiEndpoint": API,
            "source": "dictionaryapi.dev",
            "puzzlesFile": str(puzzles_path),
            "totalWords": len(words),
            "lookedUp": len(todo),
            "successfulFetches": fetched,
            "missing": len(missing)
        },
        "definitions": defs
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")

    # Summary to stdout
    print(f"Wrote {out_path}")
    print(f"Total words: {len(words)} | Looked up: {len(todo)} | Success: {fetched} | Missing: {len(missing)}")

if __name__ == "__main__":
    main()