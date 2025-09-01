#!/usr/bin/env python3
import argparse, json, re
from pathlib import Path
from datetime import date, timedelta

ALPHA57 = re.compile(r"^[A-Z]{5,7}$")

def load_pool(path: Path):
    words = json.loads(path.read_text(encoding="utf-8"))
    pool = []
    seen = set()
    for w in words:
        if not isinstance(w, str): continue
        s = w.strip().upper()
        if ALPHA57.match(s) and s not in seen:
            seen.add(s)
            pool.append(s)
    return pool

def cycle_5_6_7():
    while True:
        for n in (5, 6, 7):
            yield n

def assign_by_year(pool, start_2025: date):
    end_2025 = date(2025, 12, 31)
    start_2026 = date(2026, 1, 1)
    end_2026 = date(2026, 12, 31)

    want_2025 = (end_2025 - start_2025).days + 1
    want_2026 = (end_2026 - start_2026).days + 1

    # group pool by length, preserving order (treat earlier words as "better")
    buckets = {5: [], 6: [], 7: []}
    for w in pool:
        buckets[len(w)].append(w)

    # iterators over each length bucket
    idx = {5: 0, 6: 0, 7: 0}
    def draw(L):
        if idx[L] >= len(buckets[L]): return None
        w = buckets[L][idx[L]]
        idx[L] += 1
        return w

    def make_year(start_day: date, slots: int):
        out = {}
        need = slots
        length_cycle = cycle_5_6_7()
        d = start_day
        while need > 0:
            target_len = next(length_cycle)
            w = draw(target_len)
            # if that bucket is empty, pull from any available bucket in order of closeness
            if not w:
                for alt in (5, 6, 7):
                    if idx[alt] < len(buckets[alt]):
                        w = draw(alt)
                        break
            if not w:
                break  # totally out of words
            out[str(d)] = {"word": w, "len": len(w)}
            d += timedelta(days=1)
            need -= 1
        return out

    y2025 = make_year(start_2025, want_2025)
    y2026 = make_year(date(2026,1,1), want_2026)

    return y2025, y2026

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pool", default="lib/data/biblical_words_final.json")
    ap.add_argument("--start-2025")  # YYYY-MM-DD; default = today if in 2025, else 2025-09-01
    ap.add_argument("--outdir", default="lib/data")
    args = ap.parse_args()

    pool = load_pool(Path(args.pool))

    if args.start_2025:
        y, m, d = map(int, args.start_2025.split("-"))
        start_2025 = date(y, m, d)
    else:
        today = date.today()
        start_2025 = today if today.year == 2025 else date(2025, 9, 1)

    puzzles_2025, puzzles_2026 = assign_by_year(pool, start_2025)

    outdir = Path(args.outdir); outdir.mkdir(parents=True, exist_ok=True)
    p2025 = outdir / "puzzles-2025.json"
    p2026 = outdir / "puzzles-2026.json"

    p2025.write_text(json.dumps(puzzles_2025, ensure_ascii=False, indent=2), encoding="utf-8")
    p2026.write_text(json.dumps(puzzles_2026, ensure_ascii=False, indent=2), encoding="utf-8")

    c25 = len(puzzles_2025); c26 = len(puzzles_2026)
    total_used = c25 + c26
    print(f"2025 days: {c25} → {p2025}")
    print(f"2026 days: {c26} → {p2026}")
    print(f"Total words used: {total_used}")
    print(f"Remaining in pool: {max(0, len(pool) - total_used)}")

if __name__ == "__main__":
    main()