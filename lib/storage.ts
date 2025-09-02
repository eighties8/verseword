/* eslint-disable no-console */
export type WordLength = 5 | 6 | 7;
export type PuzzleId = `${string}:${WordLength}`; // `${YYYY-MM-DD}:${length}`

export interface PuzzleStateV2 {
  id: PuzzleId;
  dateISO: string;
  wordLength: WordLength;
  secretWord: string;
  attempts: string[];
  lockedLetters: Record<number, string>;
  revealedLetters: Record<number, string>;
  letterRevealsRemaining: number;
  gameStatus: 'not_started' | 'playing' | 'won' | 'lost';
  attemptIndex: number;
  currentGuess: string[];
  completedAt?: string;
  // Animation states to preserve exact visual appearance
  showWinAnimation?: boolean;
  winAnimationComplete?: boolean;
  showLossAnimation?: boolean;
  lossAnimationComplete?: boolean;
  showFadeInForInput?: boolean;
  fadeOutClearInput?: boolean;
  previouslyRevealedPositions?: number[];
}

export type PuzzlesById = Record<PuzzleId, PuzzleStateV2>;

const V2_KEY = 'verseword:puzzles:v2';
const LAST_KEY = 'verseword:lastPlayed:v2';
const IS_PLAYING_KEY = 'verseword:isPlaying';

// ---- utils ----
export const toDateISO = (d: Date) => {
  // Use EST timezone for consistency with the rest of the app
  const estDate = new Date(d.toLocaleString("en-US", {timeZone: "America/New_York"}));
  return estDate.getFullYear() + '-' + 
         String(estDate.getMonth() + 1).padStart(2, '0') + '-' + 
         String(estDate.getDate()).padStart(2, '0');
};
export const makeId = (dateISO: string, len: WordLength): PuzzleId =>
  `${dateISO}:${len}` as PuzzleId;

const readJSON = <T>(k: string): T | null => {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(k) : null;
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const writeJSON = (k: string, v: unknown) => {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(k, JSON.stringify(v));
      // Verify the write was successful
      const written = localStorage.getItem(k);
      if (!written) {
        console.error('Failed to write to localStorage:', k);
      }
    }
  } catch (error) {
    console.error('Error writing to localStorage:', error);
  }
};

// ---- migration from v1 ----
// v1 key: 'verseword-puzzle-state' (single object)
type LegacyV1 = {
  wordLength: number;
  secretWord: string;
  attempts: string[];
  lockedLetters: Record<string, string> | Record<number, string>;
  gameStatus: 'not_started' | 'playing' | 'won' | 'lost';
  attemptIndex: number;
  revealedLetters?: Record<string, string> | Record<number, string>;
  letterRevealsRemaining?: number;
  date?: string;
  currentGuess?: string[];
};

const V1_KEY = 'verseword-puzzle-state';

function coerceNumKeys<T>(obj: Record<string, T> | Record<number, T> | undefined): Record<number, T> {
  const out: Record<number, T> = {};
  if (!obj) return out;
  Object.entries(obj).forEach(([k, v]) => {
    const n = Number(k);
    out[Number.isFinite(n) ? n : (k as unknown as number)] = v;
  });
  return out;
}

export function migrateIfNeeded(): void {
  const v2 = readJSON<PuzzlesById>(V2_KEY);
  if (v2) return; // already on v2

  const v1 = readJSON<LegacyV1>(V1_KEY);
  if (!v1) {
    // initialize empty store
    writeJSON(V2_KEY, {});
    return;
  }

  const dateISO = v1.date || toDateISO(new Date());
  const len = Math.max(5, Math.min(7, v1.wordLength)) as WordLength;

  const id = makeId(dateISO, len);
  const state: PuzzleStateV2 = {
    id,
    dateISO,
    wordLength: len,
    secretWord: v1.secretWord,
    attempts: v1.attempts || [],
    lockedLetters: coerceNumKeys(v1.lockedLetters as any),
    revealedLetters: coerceNumKeys(v1.revealedLetters as any),
    letterRevealsRemaining: v1.letterRevealsRemaining ?? 1,
    gameStatus: v1.gameStatus,
    attemptIndex: v1.attemptIndex ?? (v1.attempts ? v1.attempts.length : 0),
    currentGuess: (v1.currentGuess && v1.currentGuess.length === len
      ? v1.currentGuess
      : Array(len).fill('')) as string[],
    // Set animation states based on game status for completed games
    showWinAnimation: v1.gameStatus === 'won',
    winAnimationComplete: v1.gameStatus === 'won',
    showLossAnimation: v1.gameStatus === 'lost',
    lossAnimationComplete: v1.gameStatus === 'lost',
    showFadeInForInput: v1.gameStatus === 'won',
    fadeOutClearInput: false,
    previouslyRevealedPositions: [],
  };

  writeJSON(V2_KEY, { [id]: state });
  writeJSON(LAST_KEY, { id });
  // keep V1 around for safety; optionally remove:
  // localStorage.removeItem(V1_KEY);
}

// ---- v2 - public API ----
export function loadAll(): PuzzlesById {
  migrateIfNeeded();
  return readJSON<PuzzlesById>(V2_KEY) ?? {};
}

export function saveAll(all: PuzzlesById) {
  writeJSON(V2_KEY, all);
}

export function getPuzzle(id: PuzzleId): PuzzleStateV2 | null {
  const all = loadAll();
  return all[id] ?? null;
}

export function upsertPuzzle(state: PuzzleStateV2): void {
  const all = loadAll();
  all[state.id] = state;
  saveAll(all);
  writeJSON(LAST_KEY, { id: state.id });
}

export function ensurePuzzle(dateISO: string, len: WordLength, init: () => Omit<PuzzleStateV2, 'id'>): PuzzleStateV2 {
  const id = makeId(dateISO, len);
  const all = loadAll();
  const existing = all[id];
  if (existing) return existing;
  const next: PuzzleStateV2 = { id, ...init() };
  all[id] = next;
  saveAll(all);
  writeJSON(LAST_KEY, { id });
  return next;
}

export function getLastPlayed(): PuzzleId | null {
  const last = readJSON<{ id: PuzzleId }>(LAST_KEY);
  return last?.id ?? null;
}

// convenience helpers
export function todayId(len: WordLength): PuzzleId {
  return makeId(toDateISO(new Date()), len);
}

// ---- isPlaying shortcut ----
export function setIsPlaying(): void {
  // Check if we're in a browser environment
  if (typeof window === 'undefined') {
    return; // Do nothing during SSR
  }
  
  // Test if localStorage is working
  try {
    localStorage.setItem('test', 'test');
    const testValue = localStorage.getItem('test');
    if (testValue !== 'test') {
      console.error('localStorage test failed - cannot read what was written');
      return;
    }
    localStorage.removeItem('test');
  } catch (error) {
    console.error('localStorage test failed:', error);
    return;
  }
  
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  
  const data = {
    isPlaying: true,
    expiresAt: midnight.getTime()
  };
  
  writeJSON(IS_PLAYING_KEY, data);
}

export function isCurrentlyPlaying(): boolean {
  // Check if we're in a browser environment
  if (typeof window === 'undefined') {
    return false; // Default to false during SSR
  }
  
  const data = readJSON<{isPlaying: boolean, expiresAt: number}>(IS_PLAYING_KEY);
  
  if (!data) return false;
  
  // Check if expired
  if (Date.now() > data.expiresAt) {
    // Clean up expired data
    localStorage.removeItem(IS_PLAYING_KEY);
    return false;
  }
  
  return data.isPlaying;
}
