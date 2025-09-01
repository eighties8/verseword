#!/usr/bin/env python3
import argparse, json, re
from pathlib import Path

ALPHA57 = re.compile(r"^[A-Z]{5,7}$")

def load_words(p: Path):
    data = json.loads(p.read_text(encoding="utf-8"))
    # normalize: uppercase, strip, filter to alpha 5–7
    norm = []
    seen = set()
    for w in data:
        if not isinstance(w, str): 
            continue
        s = w.strip().upper()
        if ALPHA57.match(s) and s not in seen:
            seen.add(s)
            norm.append(s)
    return norm

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base",  required=True)  # STRICT_top1000.json
    ap.add_argument("--extra", required=True)  # STRICT.json
    ap.add_argument("--out",   default="lib/data/biblical_words_final.json")
    args = ap.parse_args()

    base  = load_words(Path(args.base))
    extra = load_words(Path(args.extra))

    base_set = set(base)
    additions = [w for w in extra if w not in base_set]

    merged = base + additions

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Base: {len(base)}")
    print(f"Extras considered: {len(extra)}")
    print(f"New additions: {len(additions)}")
    print(f"Final total: {len(merged)}")
    print(f"Wrote → {out_path}")

if __name__ == "__main__":
    main()