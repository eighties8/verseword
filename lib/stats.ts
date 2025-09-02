import { loadAll, PuzzleStateV2 } from "./storage";

export const STATS_KEY = "verseword:stats:v1";

export type GameResult = {
  dateISO: string;          // e.g. "2025-08-24"
  wordLength: 5 | 6 | 7;
  won: boolean;
  guesses: number;          // 1..MAX_GUESSES (or MAX_GUESSES if lost)
  solution?: string;        // optional, useful for debugging
  mode?: {
    hideClue: boolean;
    randomPuzzle: boolean;
  };
};

export type StatsSnapshot = {
  played: number;
  wins: number;
  currentStreak: number;
  maxStreak: number;
  guessDistribution: number[]; // index 0 = won in 1 guess, etc.
  lastPlayedDate?: string;     // ISO date of last recorded game
  results?: GameResult[];      // optional detailed history (bounded)
};

const DEFAULT_STATS: StatsSnapshot = {
  played: 0,
  wins: 0,
  currentStreak: 0,
  maxStreak: 0,
  guessDistribution: [0, 0, 0, 0, 0, 0, 0], // supports up to 7 guesses safely
  results: [],
};

// Utility: date math on YYYY-MM-DD
export function isNextDay(prevISO?: string, nextISO?: string) {
  if (!prevISO || !nextISO) return false;
  const prev = new Date(prevISO + "T00:00:00Z");
  const next = new Date(nextISO + "T00:00:00Z");
  const diff = (next.getTime() - prev.getTime()) / 86_400_000;
  return Math.round(diff) === 1;
}

// Convert PuzzleStateV2 to GameResult for stats computation
function puzzleToGameResult(puzzle: PuzzleStateV2): GameResult {
  return {
    dateISO: puzzle.dateISO,
    wordLength: puzzle.wordLength,
    won: puzzle.gameStatus === 'won',
    guesses: puzzle.gameStatus === 'won' ? puzzle.attemptIndex + 1 : puzzle.attempts.length,
    solution: puzzle.secretWord,
  };
}

export function loadStats(): StatsSnapshot {
  // Compute stats from all stored puzzles
  const allPuzzles = loadAll();
  const completedPuzzles = Object.values(allPuzzles).filter(
    p => p.gameStatus !== 'playing' && p.gameStatus !== 'not_started' && p.attempts.length > 0
  );
  
  if (completedPuzzles.length === 0) {
    return DEFAULT_STATS;
  }
  
  // Convert to GameResults for processing
  const results = completedPuzzles.map(puzzleToGameResult);
  
  // Sort by date for streak calculation
  results.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  
  const played = results.length;
  const wins = results.filter(r => r.won).length;
  
  // Guess distribution (1..7), cap at 7
  const dist = [0, 0, 0, 0, 0, 0, 0];
  results.forEach(r => {
    if (r.won) {
      const tries = Math.min(7, r.guesses);
      dist[tries - 1] += 1;
    }
  });
  
  // Current/Max streak, by date continuity
  let current = 0;
  let max = 0;
  let prev: string | null = null;
  
  const addDay = (iso: string, delta = 1) => {
    const d = new Date(iso);
    d.setDate(d.getDate() + delta);
    return d.toISOString().slice(0, 10);
  };
  
  results.forEach(r => {
    if (r.won) {
      if (!prev || addDay(prev) === r.dateISO) {
        current += 1;
      } else {
        current = 1;
      }
      max = Math.max(max, current);
      prev = r.dateISO;
    } else {
      current = 0;
    }
  });
  
  const lastPlayedDate = results[results.length - 1]?.dateISO;
  
  return {
    played,
    wins,
    currentStreak: current,
    maxStreak: max,
    guessDistribution: dist,
    lastPlayedDate,
    results: results.slice(-180), // Keep last 180 results
  };
}

export function saveStats(s: StatsSnapshot) {
  // Note: Stats are now computed from puzzle data, so this is mainly for backward compatibility
  // Keep detailed history bounded (e.g., last 180 results)
  const bounded = { ...s, results: (s.results ?? []).slice(-180) };
  
  // Use localStorage directly for backward compatibility
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(bounded));
    } catch {
      /* ignore quota errors */
    }
  }
}

export function recordResult(result: GameResult, maxGuesses: number) {
  // Note: Results are now automatically recorded when puzzles are saved
  // This function is kept for backward compatibility but doesn't need to do much
  
  const stats = loadStats();
  
  // Update the stats object (this will be computed from puzzle data on next load)
  stats.played += 1;
  if (result.won) {
    stats.wins += 1;
    // guessDistribution index is guesses-1 but guard to list length
    const idx = Math.min(result.guesses - 1, stats.guessDistribution.length - 1);
    stats.guessDistribution[idx] = (stats.guessDistribution[idx] ?? 0) + 1;

    // streaks (only count days with wins)
    if (isNextDay(stats.lastPlayedDate, result.dateISO)) {
      stats.currentStreak += 1;
    } else {
      // If last game wasn't yesterday, streak resets to 1 on a win today
      stats.currentStreak = 1;
    }
    stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
  } else {
    // loss breaks streak
    stats.currentStreak = 0;
  }

  stats.lastPlayedDate = result.dateISO;
  stats.results = [...(stats.results ?? []), result];

  // If project ever changes MAX_GUESSES, keep array long enough
  if (stats.guessDistribution.length < maxGuesses) {
    stats.guessDistribution.push(...Array(maxGuesses - stats.guessDistribution.length).fill(0));
  }

  saveStats(stats);
}

export function winRate(stats: StatsSnapshot) {
  if (stats.played === 0) return 0;
  return Math.round((stats.wins / stats.played) * 100);
}

export function averageGuesses(stats: StatsSnapshot) {
  if (stats.wins === 0) return 0;
  
  let total = 0;
  let count = 0;
  
  stats.guessDistribution.forEach((wins, index) => {
    if (wins > 0) {
      total += (index + 1) * wins;
      count += wins;
    }
  });
  
  return count > 0 ? Math.round((total / count) * 10) / 10 : 0;
}
