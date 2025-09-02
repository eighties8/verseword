#!/usr/bin/env python3
"""
Build common 6- and 7-letter word lists using wordfreq.

Defaults:
  - Size: 2500 per length (6 & 7)
  - Language: en
  - Outputs JSON arrays sorted by frequency desc then alpha
  - Filters: lowercase a-z only, exact length, no proper nouns

Usage examples:
  python3 scripts/build_common_wordlists.py
  python3 scripts/build_common_wordlists.py --size 5000
  python3 scripts/build_common_wordlists.py --only 6 --size 8000
  python3 scripts/build_common_wordlists.py --min-zipf 4.2
"""

import argparse, json, os, re
from typing import List
from wordfreq import top_n_list, zipf_frequency

ALPHA_RE = re.compile(r"^[a-z]+$")

def is_clean_common(word: str, want_len: int, min_zipf: float, lang: str) -> bool:
    if not word.islower():
        return False
    if not ALPHA_RE.match(word):
        return False
    if len(word) != want_len:
        return False
    if zipf_frequency(word, lang) < min_zipf:
        return False
    return True

def collect_for_length(length: int,
                       size: int,
                       start_zipf: float,
                       min_zipf_floor: float,
                       step_zipf: float,
                       lang: str,
                       n_top: int) -> List[str]:
    base = top_n_list(lang, n_top)
    floor = start_zipf

    while True:
        kept: List[str] = []
        seen = set()

        for w in base:
            if w in seen:
                continue
            if is_clean_common(w, length, floor, lang):
                seen.add(w)
                kept.append(w)
            if len(kept) > size + 1500:
                break

        # Sort by frequency desc then alpha (stable)
        kept.sort(key=lambda x: (-zipf_frequency(x, lang), x))

        if len(kept) >= size or floor <= min_zipf_floor:
            top = max(size, min(len(kept), size + 1000))
            return kept[:top]

        # Not enough: relax the floor a bit
        floor = max(min_zipf_floor, floor - step_zipf)

def main():
    ap = argparse.ArgumentParser(description="Build common 6/7-letter word lists.")
    ap.add_argument("--size", type=int, default=2500, help="Target words per length (default 2500)")
    ap.add_argument("--only", choices=["6","7"], help="Only build one length")
    ap.add_argument("--lang", default="en", help="Language code for wordfreq (default en)")
    ap.add_argument("--min-zipf", type=float, default=None,
                    help="Starting ZIPF floor (adaptive lowers if needed). If omitted, uses smart defaults.")
    ap.add_argument("--top", type=int, default=300_000,
                    help="How many top words to scan from wordfreq (default 300k)")
    ap.add_argument("--outdir", default="public/data", help="Output directory (default public/data)")
    ap.add_argument("--step-zipf", type=float, default=0.1, help="ZIPF relaxation step (default 0.1)")
    ap.add_argument("--min-zipf-floor", type=float, default=2.8,
                    help="Do not relax below this ZIPF (default 2.8)")
    args = ap.parse_args()

    os.makedirs(args.outdir, exist_ok=True)

    # Smart starting floors: 6-letter words occur a bit more often than 7s
    start_zipf_6 = args.min_zipf if args.min_zipf is not None else 4.1
    start_zipf_7 = args.min_zipf if args.min_zipf is not None else 3.9

    built_any = False

    if args.only in (None, "6"):
        words6 = collect_for_length(
            length=6,
            size=args.size,
            start_zipf=start_zipf_6,
            min_zipf_floor=args.min_zipf_floor,
            step_zipf=args.step_zipf,
            lang=args.lang,
            n_top=args.top
        )
        out6 = os.path.join(args.outdir, "words6-common.json")
        with open(out6, "w") as f:
            json.dump(words6, f, indent=2)
        print(f"✅ 6-letter words: {len(words6)} -> {out6}")
        built_any = True

    if args.only in (None, "7"):
        words7 = collect_for_length(
            length=7,
            size=args.size,
            start_zipf=start_zipf_7,
            min_zipf_floor=args.min_zipf_floor,
            step_zipf=args.step_zipf,
            lang=args.lang,
            n_top=args.top
        )
        out7 = os.path.join(args.outdir, "words7-common.json")
        with open(out7, "w") as f:
            json.dump(words7, f, indent=2)
        print(f"✅ 7-letter words: {len(words7)} -> {out7}")
        built_any = True

    if not built_any:
        print("Nothing built (check --only).")

if __name__ == "__main__":
    main()