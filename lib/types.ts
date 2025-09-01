export type WordLength = 5 | 6 | 7;

export type LetterState = 'correct' | 'present' | 'absent';

export interface DailyPuzzle {
  word: string;
  clue?: string;
  isToday: boolean;
}

export interface PuzzleData {
  date: string;
  word: string;
  len: number;
}

export interface CluesData {
  [word: string]: string;
}

export interface GameState {
  wordLength: WordLength;
  secretWord: string;
  clue?: string;
  attempts: string[];
  lockedLetters: Record<number | string, string | null>;
  gameStatus: 'not_started' | 'playing' | 'won' | 'lost';
  attemptIndex: number;
  revealedLetters: Set<number>;
  letterRevealsRemaining: number;
}

export interface Toast {
  id: string;
  message: string;
  type: 'error' | 'success' | 'info';
}
