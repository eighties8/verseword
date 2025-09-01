#!/usr/bin/env python3
"""
Generate daily puzzle files from clues json.

Input files (in lib/data/):
  - clues-{YEAR}.json
    Format:
      {
        "YOWLS": "Caterwaul cry fest",
        "ZONED": "Spaced out real nice",
        "ZONES": "Earth's timely dance."
      }

Output files (also in lib/data/):
  - puzzles-{YEAR}.json
    Format:
      {
        "2025-08-25": { "word": "HAPPY", "len": 5 },
        "2025-08-26": { "word": "DREAM", "len": 5 }
      }

Usage:
  python scripts/build_puzzles_from_clues.py
  python scripts/build_puzzles_from_clues.py --years 2025 2026 2027 2029 2030 --seed 42
  python scripts/build_puzzles_from_clues.py --only-lengths 6 7

Notes:
- For the current year, the schedule starts at *today*.
- For other years, schedule runs Jan 1 → Dec 31 of that year.
- If there are fewer words than days, the list cycles to cover all days.
- If there are more words than days, extra words are ignored for that year.
"""

from __future__ import annotations

import argparse
import json
import random
from datetime import date, timedelta
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

# Paths
REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = REPO_ROOT / "lib" / "data"

DEFAULT_YEARS = [2025, 2026, 2027, 2029, 2030]


# ---------- date helpers ----------

def jan1(y: int) -> date:
    return date(y, 1, 1)

def jan1_next(y: int) -> date:
    return date(y + 1, 1, 1)

def days_between(d0: date, d1: date) -> int:
    return (d1 - d0).days

def dates_for_year(y: int, today: date) -> Iterable[date]:
    """
    Current year: start at 'today' → Dec 31.
    Other years:  Jan 1 → Dec 31.
    """
    start = today if y == today.year else jan1(y)
    end_exclusive = jan1_next(y)
    d = start
    while d < end_exclusive:
        yield d
        d += timedelta(days=1)


# ---------- data helpers ----------

def load_clue_words(path: Path) -> List[str]:
    with path.open("r", encoding="utf-8") as f:
        data: Dict[str, str] = json.load(f)
    # keys are the words; normalize to UPPER and de-dupe (stable)
    seen = set()
    words: List[str] = []
    for k in data.keys():
        if not isinstance(k, str):
            continue
        w = k.strip().upper()
        if w and w not in seen:
            seen.add(w)
            words.append(w)
    return words


def ensure_pool_has(pool: List[str], needed: int, base_words: List[str]) -> List[str]:
    """
    Ensure 'pool' has at least 'needed' items; if not, extend by cycling/shuffling
    more copies of base_words until the pool is long enough.
    """
    if len(pool) >= needed:
        return pool
    # How many more words do we need?
    missing = needed - len(pool)
    # Keep adding randomized chunks of base_words until we have enough
    while missing > 0:
        extra = base_words[:]  # copy
        random.shuffle(extra)
        pool.extend(extra)
        missing = needed - len(pool)
    return pool


# ---------- main logic ----------

def build_for_length(n: int, years: List[int], today: date) -> None:
    clues_file = DATA_DIR / CLUE_FILES[n]
    words = load_clue_words(clues_file)
    if not words:
        print(f"[WARN] No words found in {clues_file}")
        return

    # One global randomized sequence for this length.
    # We'll walk it with a moving cursor so we don't repeat yearly order.
    sequence = words[:]
    random.shuffle(sequence)
    cursor = 0

    # Pre-calc total days needed in ascending year order (the sequence rolls forward)
    years_sorted = sorted(years)
    for y in years_sorted:
        # Count how many days we need this year (today→Dec31 if current, else full year)
        num_days = sum(1 for _ in dates_for_year(y, today))

        # Make sure sequence has enough remaining items; extend by cycling if needed
        remaining = len(sequence) - cursor
        if remaining < num_days:
            # Extend the sequence by shuffling more copies of the base words
            extension = sequence[cursor:]  # keep any remainder to preserve order
            base_words = words[:]         # use the original vocabulary for cycling
            random.shuffle(base_words)
            extension += base_words
            sequence = sequence[:cursor] + ensure_pool_has(extension, num_days, words)

        # Slice for this year and advance the cursor
        slot = sequence[cursor: cursor + num_days]
        cursor += num_days

        # Pair with dates and write
        dated: List[Tuple[date, str]] = list(zip(dates_for_year(y, today), slot))
        out_path = DATA_DIR / f"puzzles{n}-{y}.json"
        with out_path.open("w", encoding="utf-8") as f:
            json.dump(
                [{"date": d.isoformat(), "word": w} for d, w in dated],
                f,
                indent=2,
            )
        print(f"Wrote {out_path} ({len(dated)} days) from index start={cursor - num_days}")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Build daily puzzles from clues (starts today for current year, then rolls forward)."
    )
    p.add_argument(
        "--years",
        nargs="+",
        type=int,
        default=DEFAULT_YEARS,
        help=f"List of years to generate (default: {' '.join(map(str, DEFAULT_YEARS))})",
    )
    p.add_argument(
        "--only-lengths",
        nargs="+",
        type=int,
        choices=[5, 6, 7],
        default=[5, 6, 7],
        help="Restrict to specific word lengths (choices: 5 6 7). Default: all.",
    )
    p.add_argument(
        "--seed",
        type=int,
        default=None,
        help="Random seed for reproducible ordering (optional).",
    )
    return p.parse_args()


def main():
    args = parse_args()
    if args.seed is not None:
        random.seed(args.seed)
    else:
        random.seed()

    today = date.today()

    # validate years exist
    years = [int(y) for y in args.years]

    # Run per length
    for n in args.only_lengths:
        if n not in CLUE_FILES:
            print(f"[WARN] Unsupported length '{n}', skipping.")
            continue
        build_for_length(n, years, today)


if __name__ == "__main__":
    main()