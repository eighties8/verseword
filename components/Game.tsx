import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/router';
import { GAME_CONFIG } from '../lib/config';
import { GameState, Toast } from '../lib/types';
import { loadDailyPuzzle, loadPuzzle } from '../lib/daily';
import { getESTDateString } from '../lib/timezone';
import {
  loadDictionary,
  evaluateGuess,
  computeRevealsForWord,
  validateGuess,
} from '../lib/gameLogic';
import { recordResult } from '../lib/stats';
import { Brain } from 'lucide-react';
import Header from './Header';
import Footer from './Footer';
import Settings from './Settings';
import GuessInputRow from './GuessInputRow';
import RowHistory from './RowHistory';
import ClueRibbon from './ClueRibbon';
import ToastComponent from './Toast';
import Keyboard from './Keyboard';
import type { GuessInputRowHandle } from './GuessInputRow';

type InputRowHandle = {
  /** Move focus to the first editable (non-locked, empty) cell */
  focusFirstEmptyEditable: () => void;
  /** Move focus to the first editable (non-locked) cell even if filled */
  focusFirstEditable: () => void;
};

interface GameSettings {
  wordLength: 5 | 6 | 7;
  maxGuesses: number;
  revealVowels: boolean;
  revealVowelCount: number;
  revealClue: boolean;
  randomPuzzle: boolean;
}

export default function Game() {
  const router = useRouter();
  
  // Add error boundary state
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const [settings, setSettings] = useState<GameSettings>({
    wordLength: GAME_CONFIG.WORD_LENGTH,
    maxGuesses: GAME_CONFIG.MAX_GUESSES,
    revealVowels: GAME_CONFIG.REVEAL_VOWELS,
    revealVowelCount: GAME_CONFIG.REVEAL_VOWEL_COUNT,
    revealClue: GAME_CONFIG.REVEAL_CLUE,
    randomPuzzle: GAME_CONFIG.RANDOM_PUZZLE,
  });

  const [gameState, setGameState] = useState<GameState>({
    wordLength: GAME_CONFIG.WORD_LENGTH,
    secretWord: '',
    clue: undefined,
    attempts: [],
    lockedLetters: {},
    gameStatus: 'playing',
    attemptIndex: 0,
    revealedLetters: new Set<number>(),
    letterRevealsRemaining: 1,
  });

  const [currentGuess, setCurrentGuess] = useState<string[]>([]);
  const [dictionary, setDictionary] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [forceClear, setForceClear] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsOpenedFromClue, setSettingsOpenedFromClue] = useState(false);
  const [showWinAnimation, setShowWinAnimation] = useState(false);
  const [winAnimationComplete, setWinAnimationComplete] = useState(false);
  const [clueError, setClueError] = useState<string | null>(null);

  // Imperative handle to control focus inside GuessInputRow
  // const inputRowRef = useRef<InputRowHandle | null>(null);
  const inputRowRef = useRef<GuessInputRowHandle | null>(null);
  
  // Flag to prevent input row onChange during keyboard input
  const keyboardInputInProgress = useRef(false);

  // Handle letter reveal
  const handleRevealLetter = useCallback(() => {
    if (gameState.letterRevealsRemaining <= 0 || gameState.gameStatus !== 'playing') {
      return;
    }

    // Find a random unrevealed position (not locked and not already revealed by lifeline)
    const unrevealedPositions = Array.from({ length: gameState.wordLength }, (_, i) => i)
      .filter(i => !gameState.lockedLetters[i] && !isPositionRevealed(i));

    if (unrevealedPositions.length > 0) {
      const randomPosition = unrevealedPositions[Math.floor(Math.random() * unrevealedPositions.length)];
      
      setGameState(prev => ({
        ...prev,
        revealedLetters: new Set(
          prev.revealedLetters && typeof prev.revealedLetters.has === 'function'
            ? Array.from(prev.revealedLetters).concat(randomPosition)
            : [randomPosition]
        ),
        letterRevealsRemaining: prev.letterRevealsRemaining - 1
      }));

      // Show success toast
      setToasts(prev => [...prev, {
        id: Date.now().toString(),
        message: `Revealed letter at position ${randomPosition + 1}!`,
        type: 'success'
      }]);
    }
  }, [gameState.letterRevealsRemaining, gameState.gameStatus, gameState.wordLength, gameState.revealedLetters, gameState.lockedLetters]);

  // Handle new game
  const handleNewGame = useCallback(async () => {
    try {
      // Clear saved puzzle state
      localStorage.removeItem('wordibble-puzzle-state');
      localStorage.removeItem('wordibble-puzzle-completed');
      
      // Reset game state
      setGameState({
        wordLength: settings.wordLength,
        secretWord: '',
        clue: undefined,
        attempts: [],
        lockedLetters: {},
        gameStatus: 'playing',
        attemptIndex: 0,
        revealedLetters: new Set<number>(),
        letterRevealsRemaining: 1,
      });
      
      // Reset current guess
      setCurrentGuess(new Array(settings.wordLength).fill(''));
      
      // Reset UI states
      setIsShaking(false);
      setForceClear(false);
      setToasts([]);
      
      // Set loading state
      setIsLoading(true);
      
      // Load new puzzle and dictionary
      const [puzzle, dict] = await Promise.all([
        loadDailyPuzzle(settings.wordLength, settings.randomPuzzle),
        loadDictionary(settings.wordLength),
      ]);

      const revealedMask = computeRevealsForWord(puzzle.word, {
        revealVowels: settings.revealVowels,
        vowelCount: settings.revealVowelCount,
      });

      const lockedLetters: Record<number, string | null> = {};
      revealedMask.forEach((isLocked, i) => {
        if (isLocked) lockedLetters[i] = puzzle.word[i];
      });

      // Update game state with new puzzle
      setGameState(prev => ({
        ...prev,
        secretWord: puzzle.word,
        clue: settings.revealClue ? puzzle.clue : undefined,
        lockedLetters,
        revealedLetters: new Set<number>(),
        letterRevealsRemaining: 1,
      }));
      
      setDictionary(dict);
      setIsLoading(false);
      
      // Focus first empty cell
      setTimeout(() => {
        queueFocusFirstEmpty();
      }, 100);
      
    } catch (error) {
      console.error('Error starting new game:', error);
      addToast('Failed to start new game', 'error');
      setIsLoading(false);
    }
  }, [settings.wordLength, settings.randomPuzzle, settings.revealVowels, settings.revealVowelCount, settings.revealClue]);

  // Handle win animation and letter flip
  useEffect(() => {
    // Don't redirect for archive puzzles or random puzzles
    const isArchivePuzzle = router.query.date && router.query.archive === 'true';
    if (gameState.gameStatus === 'won' && !showWinAnimation && !localStorage.getItem('wordibble-puzzle-completed') && !settings.randomPuzzle && !isArchivePuzzle) {
      setShowWinAnimation(true);
      
      // Mark puzzle as completed to prevent future redirects
      localStorage.setItem('wordibble-puzzle-completed', 'true');
      
      // Start letter flip animation sequence
      // Each letter will flip with a 100ms delay between them
      const totalAnimationTime = gameState.wordLength * 100 + 600; // 600ms for flip animation duration
      
      setTimeout(() => {
        setWinAnimationComplete(true);
        console.log('Letter flip animation sequence completed');
      }, totalAnimationTime);
    }
  }, [gameState.gameStatus, showWinAnimation, settings.randomPuzzle, router.query.date, router.query.archive, gameState.wordLength]);

  // Generate and share emoji grid
  const generateAndShareEmojiGrid = () => {
    // Only allow sharing for daily puzzles (not random or archive)
    const isArchivePuzzle = router.query.date && router.query.archive === 'true';
    if (settings.randomPuzzle || isArchivePuzzle) {
      setToasts(prev => [...prev, {
        id: Date.now().toString(),
        message: 'Sharing is only available for daily puzzles',
        type: 'info'
      }]);
      return;
    }

    // Calculate puzzle number (starting from 8/23/25 as puzzle #1)
    const startDate = new Date('2025-08-23');
    const today = new Date();
    const daysDiff = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const puzzleNumber = daysDiff + 1;

    // Generate emoji grid from game state
    let emojiGrid = `Wordibble #${puzzleNumber} ${gameState.attemptIndex + 1}/5\n\n`;
    
    // Add each attempt as emoji rows
    gameState.attempts.forEach((attempt, attemptIndex) => {
      let row = '';
      for (let i = 0; i < gameState.wordLength; i++) {
        const letter = attempt[i];
        const evaluation = historyEvaluations[attemptIndex]?.[i];
        
        if (evaluation === 'correct') {
          row += '🟩';
        } else if (evaluation === 'present') {
          row += '🟨';
        } else {
          row += '⬛';
        }
      }
      emojiGrid += row + '\n';
    });

    // Copy to clipboard
    navigator.clipboard.writeText(emojiGrid).then(() => {
      // Show success toast instead of alert
      setToasts(prev => [...prev, {
        id: Date.now().toString(),
        message: 'Result copied to clipboard!',
        type: 'success'
      }]);
    }).catch(() => {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = emojiGrid;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setToasts(prev => [...prev, {
        id: Date.now().toString(),
        message: 'Result copied to clipboard!',
        type: 'success'
      }]);
    });
  };

  // ===== Debug flag (persisted) =====
  useEffect(() => {
    const savedDebugMode = localStorage.getItem('wordibble-debug-mode');
    if (savedDebugMode) setDebugMode(JSON.parse(savedDebugMode));
  }, []);
  useEffect(() => {
    localStorage.setItem('wordibble-debug-mode', JSON.stringify(debugMode));
  }, [debugMode]);

  // ===== Settings (persisted) =====
  useEffect(() => {
    const savedSettings = localStorage.getItem('wordibble-settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        // Ensure wordLength is properly typed
        const typedSettings = {
          ...parsed,
          wordLength: Number(parsed.wordLength) as 5 | 6 | 7,
          randomPuzzle: parsed.randomPuzzle ?? false
        };
        console.log('Loaded settings from localStorage:', typedSettings);
        setSettings(typedSettings);
        // Update game state if word length changed
        if (typedSettings.wordLength !== gameState.wordLength) {
          setGameState(prev => ({ ...prev, wordLength: typedSettings.wordLength }));
        }
      } catch (e) {
        console.error('Failed to parse saved settings:', e);
      }
    } else {
      console.log('No saved settings found, using defaults:', settings);
    }
  }, []);

  // Update game state when settings change (but not during archive puzzle loading)
  useEffect(() => {
    const isArchivePuzzle = router.query.date && router.query.archive === 'true';
    if (!isArchivePuzzle && settings.wordLength !== gameState.wordLength) {
      console.log('Settings changed (non-archive):', settings);
      setGameState(prev => ({ ...prev, wordLength: settings.wordLength }));
    }
  }, [settings.wordLength, gameState.wordLength, router.query.date, router.query.archive]);

  const handleSettingsChange = useCallback((newSettings: GameSettings) => {
    setSettings(newSettings);
    
    // Update game state if word length changed
    if (newSettings.wordLength !== gameState.wordLength) {
      setGameState(prev => ({ ...prev, wordLength: newSettings.wordLength }));
      // Reset current guess to match new word length
      setCurrentGuess(new Array(newSettings.wordLength).fill(''));
    }
    
    // If random puzzle setting changed, clear saved state
    if (newSettings.randomPuzzle !== settings.randomPuzzle) {
      localStorage.removeItem('wordibble-puzzle-state');
    }
    
    // Close settings modal
    setIsSettingsOpen(false);
  }, [gameState.wordLength, settings.randomPuzzle]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === '0') {
        e.preventDefault();
        setDebugMode((p) => !p);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // ===== Initialize guess row length =====
  useEffect(() => {
    if (gameState.wordLength > 0) {
      setCurrentGuess((prev) => {
        if (prev.length === gameState.wordLength) return prev;
        return new Array(gameState.wordLength).fill('');
      });
    }
  }, [gameState.wordLength]);

  // ===== Calculate adjusted max guesses based on revealed letters =====
  const adjustedMaxGuesses = useMemo(() => {
    const revealedLetterCount = Object.keys(gameState.lockedLetters).length;
    
    // If REVEAL_CLUE is false and only 1 letter is revealed, add 1 to max guesses
    if (!settings.revealClue && revealedLetterCount === 1) {
      return settings.maxGuesses + 1;
    }
    
    // If there's a clue AND 2 or more vowels revealed, reduce max guesses by 2
    if (settings.revealClue && revealedLetterCount >= 2) {
      return Math.max(3, settings.maxGuesses - 2); // Ensure minimum of 3 guesses
    }
    
    return settings.maxGuesses;
  }, [gameState.lockedLetters, settings.revealClue, settings.maxGuesses]);

  // ===== Load daily puzzle + dictionary =====
  useEffect(() => {
    let alive = true;
    
    (async () => {
      try {
        console.log('Starting to load game data...');
        
        // Clear any stale puzzle state before loading new puzzle
        if (!router.query.date || router.query.archive !== 'true') {
          const savedPuzzleState = localStorage.getItem('wordibble-puzzle-state');
          if (savedPuzzleState) {
            try {
              const puzzleState = JSON.parse(savedPuzzleState);
              const today = getESTDateString();
              
              if (puzzleState.date !== today) {
                console.log('Clearing stale puzzle state from:', puzzleState.date, 'today (EST):', today);
                localStorage.removeItem('wordibble-puzzle-state');
                localStorage.removeItem('wordibble-puzzle-completed');
              }
            } catch (e) {
              console.error('Failed to parse saved puzzle state for cleanup:', e);
            }
          }
        }
        
        let puzzle;
                let dict;
        
        // Check if this is an archive puzzle
        if (router.query.date && router.query.archive === 'true') {
          const archiveDate = new Date(router.query.date as string);
          const archiveLength = router.query.length ? parseInt(router.query.length as string) as 5 | 6 | 7 : settings.wordLength;
          console.log('Loading archive puzzle for date:', archiveDate, 'length:', archiveLength);
          puzzle = await loadPuzzle(archiveDate, archiveLength);
          
          // Update word length setting for archive puzzles (only if different)
          if (archiveLength !== settings.wordLength) {
            console.log('Updating word length for archive puzzle:', archiveLength);
            setSettings(prev => ({ ...prev, wordLength: archiveLength }));
          }
          
          // Load dictionary for the archive puzzle length, not the settings length
          dict = await loadDictionary(archiveLength);
        } else {
          puzzle = await loadDailyPuzzle(settings.wordLength, settings.randomPuzzle);
          
          // Load dictionary for the daily puzzle length
          dict = await loadDictionary(settings.wordLength);
        }
        
        const revealedMask = computeRevealsForWord(puzzle.word, {
          revealVowels: settings.revealVowels,
          vowelCount: settings.revealVowelCount,
        });

        const lockedLetters: Record<number, string | null> = {};
        revealedMask.forEach((isLocked, i) => {
          if (isLocked) lockedLetters[i] = puzzle.word[i];
        });

        if (!alive) return;

        // For archive puzzles, ensure we use the correct word length
        const puzzleWordLength = router.query.date && router.query.archive === 'true' 
          ? (router.query.length ? parseInt(router.query.length as string) as 5 | 6 | 7 : settings.wordLength)
          : settings.wordLength;

        setGameState((prev) => ({
          ...prev,
          wordLength: puzzleWordLength,
          secretWord: puzzle.word,
          clue: settings.revealClue ? puzzle.clue : undefined,
          lockedLetters,
          revealedLetters: new Set<number>(),
          letterRevealsRemaining: 1,
        }));
        
        setDictionary(dict);
        console.log('Game data loaded successfully:', { puzzle: puzzle.word, dictSize: dict.size });
        console.log('Game state updated successfully');
        console.log('Debug - Secret word set to:', puzzle.word);
        console.log('Debug - Word length set to:', puzzleWordLength);
      } catch (error) {
        console.error('Error loading game data:', error);
        addToast('Failed to load game data', 'error');
      } finally {
        if (alive) {
          setIsLoading(false);
          console.log('Loading completed, setting loading to false');
          // Focus after mount
          queueFocusFirstEmpty();
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.wordLength, settings.revealVowels, settings.revealVowelCount, settings.randomPuzzle, settings.revealClue, router.query.date, router.query.archive]);

  // ===== Keep currentGuess aligned when locked letters change =====
  useEffect(() => {
    if (!gameState.secretWord) return;
    if (Object.keys(gameState.lockedLetters).length === 0) return;
    // Skip if keyboard input is in progress to prevent interference
    if (keyboardInputInProgress.current) return;

    setCurrentGuess((prev) => {
      const next = prev.length === gameState.wordLength ? [...prev] : new Array(gameState.wordLength).fill('');
      for (const [idxStr, letter] of Object.entries(gameState.lockedLetters)) {
        const i = Number(idxStr);
        if (letter) next[i] = letter;
      }
      return next;
    });
    // Don't focus here; we'll do it in targeted places
  }, [gameState.lockedLetters, gameState.secretWord, gameState.wordLength]);

  // ===== Puzzle State Persistence =====
  useEffect(() => {
    // Load saved puzzle state from localStorage
    const savedPuzzleState = localStorage.getItem('wordibble-puzzle-state');
    const isArchivePuzzle = router.query.date && router.query.archive === 'true';
    if (savedPuzzleState && !settings.randomPuzzle && !isArchivePuzzle) {
              try {
          const puzzleState = JSON.parse(savedPuzzleState);
          // Only restore if it's from today (using EST timezone)
          const today = getESTDateString();
          
          if (puzzleState.date === today) {
            // Fix revealedLetters to be a proper Set - handle both array and object cases
            let revealedLettersArray = [];
            if (puzzleState.revealedLetters) {
              if (Array.isArray(puzzleState.revealedLetters)) {
                revealedLettersArray = puzzleState.revealedLetters;
              } else if (typeof puzzleState.revealedLetters === 'object') {
                // If it's an object (from old localStorage), extract the values
                revealedLettersArray = Object.values(puzzleState.revealedLetters);
              }
            }
            
            const fixedPuzzleState = {
              ...puzzleState,
              revealedLetters: new Set(revealedLettersArray)
            };
            setGameState(fixedPuzzleState);
            setCurrentGuess(puzzleState.currentGuess || new Array(puzzleState.wordLength).fill(''));
            console.log('Restored puzzle state from localStorage for date:', today);
          } else {
            console.log('Puzzle state date mismatch - saved:', puzzleState.date, 'today (EST):', today);
            // Clear old puzzle state
            localStorage.removeItem('wordibble-puzzle-state');
            // Also clear the completed flag to allow new games
            localStorage.removeItem('wordibble-puzzle-completed');
          }
        } catch (e) {
          console.error('Failed to parse saved puzzle state:', e);
        }
    }
  }, [settings.randomPuzzle, router.query.date, router.query.archive]);

  // Save puzzle state to localStorage
  useEffect(() => {
    const isArchivePuzzle = router.query.date && router.query.archive === 'true';
    if (gameState.secretWord && !settings.randomPuzzle && !isArchivePuzzle) {
      // Use EST timezone for date consistency
      const today = getESTDateString();
      
      const puzzleState = {
        ...gameState,
        date: today,
        currentGuess
      };
      localStorage.setItem('wordibble-puzzle-state', JSON.stringify(puzzleState));
    }
  }, [gameState, currentGuess, settings.randomPuzzle, router.query.date, router.query.archive]);

  // ===== Toast helpers =====
  const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  // Manual cleanup function for stuck puzzle state
  const clearPuzzleState = useCallback(() => {
    localStorage.removeItem('wordibble-puzzle-state');
    localStorage.removeItem('wordibble-puzzle-completed');
    window.location.reload();
  }, []);
  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ===== Input row onChange -> source of truth for the active guess =====
  const handleGuessChange = useCallback((letters: string[]) => {
    // Skip updating if keyboard input is in progress to prevent race condition
    if (keyboardInputInProgress.current) return;
    setCurrentGuess(letters);
  }, []);

  // Helper function to safely check if a position is revealed
  const isPositionRevealed = useCallback((position: number) => {
    if (!gameState.revealedLetters || typeof gameState.revealedLetters.has !== 'function') {
      return false;
    }
    return gameState.revealedLetters.has(position);
  }, [gameState.revealedLetters]);

  // ===== Submit guess =====
  const handleSubmit = useCallback(() => {
    if (gameState.gameStatus !== 'playing') return;

    // Build the complete guess mixing locked + current
    const completeGuess = Array.from({ length: gameState.wordLength }, (_, i) =>
      gameState.lockedLetters[i] ?? currentGuess[i] ?? ''
    ).join('');

    if (!validateGuess(completeGuess, gameState.wordLength)) {
      setClueError('Please enter a complete word');
      setTimeout(() => setClueError(null), 1000); // Clear after 3 seconds
      return;
    }
    if (!dictionary.has(completeGuess)) {
      setClueError('Not in dictionary');
      setTimeout(() => setClueError(null), 1000); // Clear after 3 seconds
      
      // Shake animation and reset input
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      
      // Clear current guess (keep locked letters)
      setCurrentGuess(() => {
        const next = new Array(gameState.wordLength).fill('');
        for (const [idxStr, letter] of Object.entries(gameState.lockedLetters)) {
          const i = Number(idxStr);
          if (letter) next[i] = letter;
        }
        return next;
      });
      
      // Trigger force clear of input row
      setForceClear(true);
      setTimeout(() => {
        setForceClear(false);
        queueFocusFirstEmpty();
      }, 100);
      
      return;
    }

    // Clear any previous error
    setClueError(null);
    
    const evaluation = evaluateGuess(completeGuess, gameState.secretWord);
    const isWin = evaluation.every((s) => s === 'correct');

    // Update locked letters for exact matches
    const newLocked = { ...gameState.lockedLetters };
    for (let i = 0; i < evaluation.length; i++) {
      if (evaluation[i] === 'correct') newLocked[i] = completeGuess[i];
    }

    // Update state
    setGameState((prev) => {
      const newAttempts = prev.attempts.length
        ? [...prev.attempts, completeGuess]
        : [completeGuess];
      const nextAttemptIndex = prev.attemptIndex + 1;

      let newStatus: GameState['gameStatus'] = 'playing';
      if (isWin) {
        newStatus = 'won';
      } else if (nextAttemptIndex >= adjustedMaxGuesses) {
        newStatus = 'lost';
      }

      return {
        ...prev,
        attempts: newAttempts,
        attemptIndex: nextAttemptIndex,
        lockedLetters: newLocked,
        gameStatus: newStatus,
      };
    });

    // Reset current guess to only the locked positions (greens)
    setCurrentGuess(() => {
      const next = new Array(gameState.wordLength).fill('');
      for (const [idxStr, letter] of Object.entries(newLocked)) {
        const i = Number(idxStr);
        if (letter) next[i] = letter;
      }
      return next;
    });

    // Record stats for completed game (only for daily puzzles, not archive or random)
    const isArchivePuzzle = router.query.date && router.query.archive === 'true';
    if (!isArchivePuzzle) {
      const todayISO = getESTDateString();
      recordResult(
        {
          dateISO: todayISO,
          wordLength: GAME_CONFIG.WORD_LENGTH as 5 | 6 | 7,
          won: isWin,
          guesses: isWin ? (gameState.attemptIndex + 1) : adjustedMaxGuesses,
          solution: gameState.secretWord,
          mode: {
            revealVowels: GAME_CONFIG.REVEAL_VOWELS,
            vowelCount: GAME_CONFIG.REVEAL_VOWEL_COUNT,
            revealClue: GAME_CONFIG.REVEAL_CLUE,
            randomPuzzle: settings.randomPuzzle,
          },
        },
        adjustedMaxGuesses
      );
    }

    // Focus first empty editable after render commit
    queueFocusFirstEmpty();
  }, [
    gameState.gameStatus,
    gameState.wordLength,
    gameState.lockedLetters,
    gameState.secretWord,
    currentGuess,
    dictionary,
    addToast,
    adjustedMaxGuesses,
    settings.randomPuzzle,
    router.query.date,
    router.query.archive,
  ]);

  // ===== Global Enter handler =====
  const handleEnterKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' && gameState.gameStatus === 'playing') handleSubmit();
    },
    [handleSubmit, gameState.gameStatus]
  );
  useEffect(() => {
    document.addEventListener('keydown', handleEnterKey);
    return () => document.removeEventListener('keydown', handleEnterKey);
  }, [handleEnterKey]);

  // ===== Virtual keyboard handlers =====
  const findNextEditableIndex = useCallback((fromIndex: number) => {
    // Find next editable cell starting from fromIndex + 1
    for (let i = fromIndex + 1; i < gameState.wordLength; i++) {
      if (!gameState.lockedLetters[i]) {
        return i;
      }
    }
    return -1; // No more editable cells
  }, [gameState.wordLength, gameState.lockedLetters]);

  const findFirstEditableIndex = useCallback(() => {
    // Find first editable cell
    for (let i = 0; i < gameState.wordLength; i++) {
      if (!gameState.lockedLetters[i]) {
        return i;
      }
    }
    return -1; // No editable cells
  }, [gameState.wordLength, gameState.lockedLetters]);

  const findFirstEmptyEditableIndex = useCallback(() => {
    // Find first editable cell that is empty
    for (let i = 0; i < gameState.wordLength; i++) {
      if (!gameState.lockedLetters[i] && !currentGuess[i]) {
        return i;
      }
    }
    // If no empty editable cells, return first editable cell
    return findFirstEditableIndex();
  }, [currentGuess, gameState.wordLength, gameState.lockedLetters, findFirstEditableIndex]);

  const handleKeyboardKeyPress = useCallback(
    (key: string) => {
      console.log('Keyboard key pressed:', key, 'Game status:', gameState.gameStatus);
      if (gameState.gameStatus !== 'playing') return;
      
      const i = findFirstEmptyEditableIndex();
      console.log('Found editable index:', i, 'Current guess:', currentGuess, 'Locked letters:', gameState.lockedLetters);
      if (i >= 0) {
        // Set flag to prevent input row onChange interference
        keyboardInputInProgress.current = true;
        
        setCurrentGuess((prev) => {
          const next = [...prev];
          next[i] = key;
          console.log('Updated current guess:', next);
          return next;
        });
        
        // Clear flag after state update
        setTimeout(() => {
          keyboardInputInProgress.current = false;
        }, 0);
        
        // Advance to next editable cell
        setTimeout(() => {
          const nextIndex = findNextEditableIndex(i);
          console.log('Moving to next index:', nextIndex);
          if (nextIndex >= 0) {
            queueFocusSpecificIndex(nextIndex);
          }
        }, 50);
      }
    },
    [gameState.gameStatus, findFirstEmptyEditableIndex, findNextEditableIndex, currentGuess, gameState.lockedLetters]
  );

  const handleKeyboardBackspace = useCallback(() => {
    if (gameState.gameStatus !== 'playing') return;
    
    // Find last filled editable cell
    let i = -1;
    for (let j = currentGuess.length - 1; j >= 0; j--) {
      if (!gameState.lockedLetters[j] && currentGuess[j]) {
        i = j;
        break;
      }
    }
    
    if (i >= 0) {
      // Set flag to prevent input row onChange interference
      keyboardInputInProgress.current = true;
      
      setCurrentGuess((prev) => {
        const next = [...prev];
        next[i] = '';
        return next;
      });
      
      // Clear flag after state update
      setTimeout(() => {
        keyboardInputInProgress.current = false;
      }, 0);
      
      // Keep focus on the cell where deletion occurred
      setTimeout(() => {
        queueFocusSpecificIndex(i);
      }, 50);
    }
  }, [gameState.gameStatus, currentGuess, gameState.lockedLetters]);

  // ===== Memoized keyboard letter states =====
  const keyboardLetterStates = useMemo(() => {
    const states: Record<string, 'correct' | 'present' | 'absent'> = {};
    
    // Include initially revealed letters (locked letters) as correct
    for (const [indexStr, letter] of Object.entries(gameState.lockedLetters)) {
      if (letter) {
        states[letter] = 'correct';
      }
    }
    
    // Include letters revealed by lifeline as correct (these should never be overridden)
    for (const index of Array.from(gameState.revealedLetters)) {
      const letter = gameState.secretWord[index];
      if (letter) {
        states[letter] = 'correct';
      }
    }
    
    // Include letters from previous attempts (but don't override 'correct' states)
    for (const attempt of gameState.attempts) {
      const evaln = evaluateGuess(attempt, gameState.secretWord);
      for (let i = 0; i < attempt.length; i++) {
        const L = attempt[i];
        const s = evaln[i];
        // Only set state if it's not already 'correct' (preserving revealed letters)
        if (s === 'correct' && states[L] !== 'correct') {
          states[L] = 'correct';
        } else if (s === 'present' && states[L] !== 'correct') {
          states[L] = 'present';
        } else if (s === 'absent' && !states[L]) {
          states[L] = 'absent';
        }
      }
    }
    return states;
  }, [gameState.attempts, gameState.secretWord, gameState.lockedLetters, gameState.revealedLetters]);

  // ===== Memoize row evaluations so we don't recompute every render =====
  const historyEvaluations = useMemo(() => {
    return gameState.attempts.map((attempt) => evaluateGuess(attempt, gameState.secretWord));
  }, [gameState.attempts, gameState.secretWord]);

  // ===== Focus helpers =====
  function queueFocusFirstEmpty() {
    // Wait a tick for the input row to mount/update
    requestAnimationFrame(() => {
      if (inputRowRef.current?.focusFirstEmptyEditable) {
        inputRowRef.current.focusFirstEmptyEditable();
      } else {
        // DOM fallback: focus first input with data-role="active-cell" that is not [data-locked="true"] or [data-revealed="true"] and empty
        const el = document.querySelector<HTMLInputElement>(
          'input[data-role="active-cell"][data-locked="false"][data-revealed="false"][value=""]'
        ) || document.querySelector<HTMLInputElement>('input[data-role="active-cell"][data-locked="false"][data-revealed="false"]');
        el?.focus();
        el?.select?.();
      }
    });
  }
  function queueFocusSpecificIndex(i: number) {
    requestAnimationFrame(() => {
      // Only focus if the cell is not locked or revealed
      if (gameState.lockedLetters[i] || isPositionRevealed(i)) return;
      
      // Try a convention: inputs annotated with data-index
      const el = document.querySelector<HTMLInputElement>(
        `input[data-role="active-cell"][data-index="${i}"]`
      );
      if (el && el.getAttribute('data-locked') !== 'true' && el.getAttribute('data-revealed') !== 'true') {
        el.focus();
        el.select?.();
      }
    });
  }

  // Focus at game start (when loading finishes)
  useEffect(() => {
    if (!isLoading && gameState.secretWord) queueFocusFirstEmpty();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, gameState.secretWord, gameState.lockedLetters]);

  // Error boundary effect
  useEffect(() => {
    const handleError = (error: ErrorEvent) => {
      console.error('Game component error:', error);
      setHasError(true);
      setErrorMessage(error.message || 'An unexpected error occurred');
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  // Show error state if there's an error
  if (hasError) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-2">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Something went wrong</h1>
          <p className="text-gray-700 mb-4">{errorMessage}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
          >
            Reload Game
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="text-xl text-gray-900">Loading game...</div>
      </div>
    );
  }

  const attemptsLeft = adjustedMaxGuesses - gameState.attemptIndex;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header onSettingsClick={() => setIsSettingsOpen(true)} />
      
      <main className="flex-1 py-4 md:py-8 px-4">
        <div className="max-w-md mx-auto">
          {/* Clue Ribbon or Game Result Banner */}
          <div className="text-center mb-4 md:mb-8">
            {gameState.gameStatus === 'lost' ? (
              /* Solution Banner - Show in place of clue when lost */
              <div className="bg-black text-white px-6 py-3 rounded-lg w-full max-w-md mx-auto">
                <div className="text-2xl font-bold tracking-wider">
                  {gameState.secretWord}
                </div>
              </div>
            ) : gameState.gameStatus === 'won' ? (
              /* Wordibble Result Banner - Show in place of clue when won */
              <div className="bg-green-500 text-white px-6 py-3 rounded-lg w-full max-w-md mx-auto">
                <div className="text-xl font-bold tracking-wider">
                  {(() => {
                    // Calculate puzzle number (starting from 8/23/25 as puzzle #1)
                    const startDate = new Date('2025-08-23');
                    const today = new Date();
                    const daysDiff = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
                    const puzzleNumber = daysDiff + 1;
                    return `Wordibble #${puzzleNumber} ${gameState.attempts.length}/5`;
                  })()}
                </div>
              </div>
            ) : clueError ? (
              /* Error Banner - Show when there's an error */
              <div className="w-fit mx-auto mb-6 md:mb-6 bg-gray-300 text-gray-700 px-6 py-1.5 rounded-lg shadow-lg transition-all duration-300 ease-out transform text-sm font-medium whitespace-nowrap">
                {clueError}
              </div>
            ) : (
              /* Clue Ribbon - Show when playing normally */
              <ClueRibbon 
                clue={gameState.clue || ''} 
                targetWord={debugMode ? gameState.secretWord : undefined}
                onRevealLetter={handleRevealLetter}
                letterRevealsRemaining={gameState.letterRevealsRemaining}
                onSettingsClick={() => {
                  setSettingsOpenedFromClue(true);
                  setIsSettingsOpen(true);
                }}
              />
            )}
          </div>
          {/* Debug: Show clue info */}
          {debugMode && (
            <div className="text-center mb-4 text-xs text-gray-500">
              <div>Clue: {gameState.clue || 'undefined'}</div>
              <div>Reveal Clue: {settings.revealClue ? 'true' : 'false'}</div>
              <div>Secret Word: {gameState.secretWord}</div>
            </div>
          )}

          {/* Game Grid */}
          <div className="space-y-3 md:space-y-1 mb-4 md:mb-8">
            {/* Active Input Row - Only show when playing */}
            {gameState.gameStatus === 'playing' && (
              <GuessInputRow
                ref={inputRowRef as any}
                key={`input-${Object.keys(gameState.lockedLetters).length}-${gameState.attemptIndex}`}
                wordLength={gameState.wordLength}
                locked={Array.from({ length: gameState.wordLength }, (_, i) => !!gameState.lockedLetters[i])}
                initialCells={Array.from({ length: gameState.wordLength }, (_, i) => 
                  gameState.lockedLetters[i] || 
                  (isPositionRevealed(i) ? gameState.secretWord[i] : '') ||
                  currentGuess[i] || ''
                )}
                onChange={handleGuessChange}
                isShaking={isShaking}
                forceClear={forceClear}
                revealedLetters={gameState.revealedLetters}
                readOnly={gameState.gameStatus !== 'playing'}
              />
            )}

            {/* History Rows - Show all attempts when game is won */}
            {gameState.attempts.map((attempt, index) => {
              const isWinningRow = gameState.gameStatus === 'won' && index === gameState.attempts.length - 1;
              let evaluation = historyEvaluations[index];
              
              // Force all letters to be 'correct' for the winning row
              if (isWinningRow && gameState.gameStatus === 'won') {
                evaluation = new Array(gameState.wordLength).fill('correct');
              }
              
              // Debug logging for winning row
              if (isWinningRow) {
                console.log('Winning row:', {
                  attempt,
                  evaluation,
                  secretWord: gameState.secretWord,
                  gameStatus: gameState.gameStatus
                });
              }
              
              return (
                <RowHistory
                  key={index}
                  guess={attempt}
                  evaluation={evaluation}
                  wordLength={gameState.wordLength}
                  isWinningRow={isWinningRow}
                  showAnimation={showWinAnimation}
                  animationDelay={0}
                />
              );
            })}
          </div>

          {/* Guesses Left */}
          {gameState.gameStatus === 'playing' && (
            <div className="text-center mb-4">
              <span className="text-gray-900 text-lg">{attemptsLeft} guesses left</span>
              {debugMode && (
                <span className="ml-3 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">DEBUG</span>
              )}
            </div>
          )}

          {/* Game Status */}
          {/* Temporarily disabled congratulations popup */}
          {/* {gameState.gameStatus === 'won' && (
            <div className="text-center mb-4">
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-8 text-center shadow-xl max-w-md mx-4">
                  <div className="text-4xl mb-4">🎉</div>
                  <h2 className="text-3xl font-bold text-gray-900 mb-4">Congratulations!</h2>
                  <p className="text-xl text-gray-600 mb-6">You won!</p>
                  <button
                    onClick={() => setGameState(prev => ({ ...prev, gameStatus: 'playing' }))}
                    className="px-6 py-3 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 transition-colors"
                  >
                    ✕ Close
                  </button>
                </div>
              </div>
            </div>
          )} */}
          

          


          {/* Debug: Clear Puzzle State Button */}
          {debugMode && (
            <div className="text-center mb-4">
              <button
                onClick={clearPuzzleState}
                className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600 transition-colors"
                title="Clear saved puzzle state and reload (for debugging stuck puzzles)"
              >
                🧹 Clear Puzzle State
              </button>
            </div>
          )}

          {/* New Game Button - Commented out for now */}
          {/* {(gameState.gameStatus === 'won' || gameState.gameStatus === 'lost') && (
            <div className="text-center">
              <button
                onClick={handleNewGame}
                className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
              >
                New Game
              </button>
            </div>
          )} */}

          {/* Virtual Keyboard */}
          {(gameState.gameStatus === 'playing' || gameState.gameStatus === 'won' || gameState.gameStatus === 'lost') && (
            <div className="mt-4 md:mt-8">
              <Keyboard
                onKeyPress={gameState.gameStatus === 'playing' ? handleKeyboardKeyPress : () => {}}
                onEnter={gameState.gameStatus === 'playing' ? handleSubmit : () => {}}
                onBackspace={gameState.gameStatus === 'playing' ? handleKeyboardBackspace : () => {}}
                letterStates={keyboardLetterStates}
                revealedLetters={new Set(
                  gameState.revealedLetters && typeof gameState.revealedLetters.has === 'function' 
                    ? Array.from(gameState.revealedLetters).map(i => gameState.secretWord[i])
                    : []
                )}
              />
            </div>
          )}
        </div>
      </main>

      <Footer />

      {isSettingsOpen && (
        <Settings
          isOpen={isSettingsOpen}
          onClose={() => {
            setIsSettingsOpen(false);
            setSettingsOpenedFromClue(false);
          }}
          onSettingsChange={handleSettingsChange}
          currentSettings={settings}
          debugMode={debugMode}
          openedFromClue={settingsOpenedFromClue}
        />
      )}

      {/* Toasts */}
      {toasts.map((toast) => (
        <ToastComponent key={toast.id} toast={toast} onDismiss={dismissToast} />
      ))}
    </div>
  );
}