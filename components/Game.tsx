import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/router';
import { GAME_CONFIG, ANIMATION_CONFIG } from '../lib/config';
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
import { Brain, Trophy } from 'lucide-react';
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
  lockGreenMatchedLetters: boolean;
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
    lockGreenMatchedLetters: GAME_CONFIG.LOCK_GREEN_MATCHED_LETTERS,
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
  const [flippingRows, setFlippingRows] = useState<Set<number>>(new Set());
  const [showFadeInForInput, setShowFadeInForInput] = useState(false);
  const [fadeOutClearInput, setFadeOutClearInput] = useState(false);
  const [previouslyRevealedPositions, setPreviouslyRevealedPositions] = useState<Set<number>>(new Set());
  
  // Callback when fade-out clear animation completes
  const handleFadeOutComplete = useCallback(() => {
    setFadeOutClearInput(false);
    
    // Focus first empty editable after the fade-out clear completes
    if (gameState.gameStatus === 'playing') {
      queueFocusFirstEmpty();
    }
  }, [gameState.gameStatus]);


  // Imperative handle to control focus inside GuessInputRow
  // const inputRowRef = useRef<InputRowHandle | null>(null);
  const inputRowRef = useRef<GuessInputRowHandle | null>(null);
  
  // Flag to prevent input row onChange during keyboard input
  const keyboardInputInProgress = useRef(false);

  // Helper function to safely check if a position is revealed
  const isPositionRevealed = useCallback((position: number) => {
    // Check if position is locked (already visible from correct guesses)
    if (gameState.lockedLetters[position]) {
      return true;
    }
    
    // Check if position was revealed by lifeline
    if (!gameState.revealedLetters || typeof gameState.revealedLetters.has !== 'function') {
      return false;
    }
    return gameState.revealedLetters.has(position);
  }, [gameState.revealedLetters, gameState.lockedLetters]);

  // Handle letter reveal
  const handleRevealLetter = useCallback(() => {
    if (gameState.letterRevealsRemaining <= 0 || gameState.gameStatus !== 'playing') {
      return;
    }

    // Find a random unrevealed position (not already revealed by lifeline or locked letters)
    const unrevealedPositions = Array.from({ length: gameState.wordLength }, (_, i) => i)
      .filter(i => !isPositionRevealed(i));

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
  }, [gameState.letterRevealsRemaining, gameState.gameStatus, gameState.wordLength, isPositionRevealed]);

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
      
      // DO NOT set lockedLetters immediately - wait for flip animation to complete
      // This prevents the top input row from turning green prematurely

      
      // Start letter flip animation sequence
      // Each letter will flip with a delay between them (sequential flipping)
      const totalAnimationTime = gameState.wordLength * ANIMATION_CONFIG.TILE_FLIP_DURATION; // sequential timing from config
      
      setTimeout(() => {
        setWinAnimationComplete(true);

        
        // NOW set lockedLetters AFTER the flip animation completes
        // This prevents the top input row from turning green prematurely
        const solutionLockedLetters = Object.fromEntries(
          Array.from({ length: gameState.wordLength }, (_, i) => [i, gameState.secretWord[i]])
        );
        
        setGameState(prev => {
          const newState = {
            ...prev,
            lockedLetters: solutionLockedLetters,
            gameStatus: 'won' as const
          };
          return newState;
        });
        

        
        // Also update currentGuess to show the solution
        setCurrentGuess(() => {
          const next = new Array(gameState.wordLength).fill('');
          for (let i = 0; i < gameState.wordLength; i++) {
            next[i] = gameState.secretWord[i];
          }
          return next;
        });
        
        // Always trigger fade-in animations for the win state input row
        // This ensures the nice animation effect regardless of the lockGreenMatchedLetters setting
        setShowFadeInForInput(true);
        
        // Wait 1.5 seconds after the clue text changes to win text, then redirect to stats
        setTimeout(() => {
          router.push('/stats');
        }, 1500);
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

    // Calculate puzzle number (starting from 8/25/25 as puzzle #1)
    const startDate = new Date('2025-08-25');
    const today = new Date();
    const daysDiff = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const puzzleNumber = daysDiff + 1;

    // Generate emoji grid from game state
    let emojiGrid = `Wordibble #${puzzleNumber} ${gameState.attemptIndex + 1}/${settings.maxGuesses}\nhttps://wordibble.com\n`;
    
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

        setSettings(typedSettings);
        // Update game state if word length changed
        if (typedSettings.wordLength !== gameState.wordLength) {
          setGameState(prev => ({ ...prev, wordLength: typedSettings.wordLength }));
        }
      } catch (e) {
        console.error('Failed to parse saved settings:', e);
      }
    } else {
      
    }
  }, []);

  // Update game state when settings change (but not during archive puzzle loading)
  useEffect(() => {
    const isArchivePuzzle = router.query.date && router.query.archive === 'true';
    if (!isArchivePuzzle && settings.wordLength !== gameState.wordLength) {
      
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
      if (e.metaKey && e.key === '8') {
        e.preventDefault();
        
        // Use the callback approach to get the new value
        setDebugMode((prevDebugMode) => {
          const newDebugMode = !prevDebugMode;
          
          // If debug mode is being enabled, focus the Reset Puzzle button
          if (newDebugMode) {
            
            // Try immediate focus first
            const immediateButton = document.querySelector('button[onclick*="clearPuzzleState"]') as HTMLButtonElement;
            if (immediateButton) {
              immediateButton.focus();
            }
            
            // Also try after a short delay
            setTimeout(() => {              
              // Try multiple selectors to find the button
              let resetButton = document.querySelector('button[onclick*="clearPuzzleState"]') as HTMLButtonElement;
              
              if (!resetButton) {
                resetButton = Array.from(document.querySelectorAll('button')).find(btn => 
                  btn.textContent?.includes('Reset Puzzle')
                ) as HTMLButtonElement;
              }
              
              if (resetButton) {
                resetButton.focus();
              } 
            }, 200); // Increased timeout to ensure DOM is fully updated
            
            // Try one more time after a longer delay
            setTimeout(() => {
              const finalButton = document.querySelector('button[onclick*="clearPuzzleState"]') as HTMLButtonElement;
              if (finalButton) {
                finalButton.focus();
              }
            }, 500);
          }
          
          return newDebugMode;
        });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []); // Remove debugMode dependency since we're using the callback approach

  // ===== Initialize guess row length =====
  useEffect(() => {
    if (gameState.wordLength > 0) {
      setCurrentGuess((prev) => {
        if (prev.length === gameState.wordLength) return prev;
        return new Array(gameState.wordLength).fill('');
      });
    }
  }, [gameState.wordLength]);



  // ===== Load daily puzzle + dictionary =====
  useEffect(() => {
    let alive = true;
    
    (async () => {
      try {
  
        
        // Clear any stale puzzle state before loading new puzzle
        if (!router.query.date || router.query.archive !== 'true') {
          const savedPuzzleState = localStorage.getItem('wordibble-puzzle-state');
          if (savedPuzzleState) {
            try {
              const puzzleState = JSON.parse(savedPuzzleState);
              const today = getESTDateString();
              
              if (puzzleState.date !== today) {
    
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
          
          puzzle = await loadPuzzle(archiveDate, archiveLength);
          
          // Update word length setting for archive puzzles (only if different)
          if (archiveLength !== settings.wordLength) {

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

        setGameState((prev) => {
          const newState = {
            ...prev,
            wordLength: puzzleWordLength,
            secretWord: puzzle.word,
            clue: settings.revealClue ? puzzle.clue : undefined,
            // Only set lockedLetters if they haven't been restored from localStorage
            lockedLetters: Object.keys(prev.lockedLetters).length > 0 ? prev.lockedLetters : lockedLetters,
            revealedLetters: new Set<number>(),
            letterRevealsRemaining: 1,
          };
          return newState;
        });
        
        setDictionary(dict);
        
      } catch (error) {
        console.error('Error loading game data:', error);
        addToast('Failed to load game data', 'error');
      } finally {
        if (alive) {
          setIsLoading(false);
  
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
  const hasRestoredFromStorage = useRef(false);
  
  useEffect(() => {
    // Only restore once per component mount
    if (hasRestoredFromStorage.current) return;
    
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
          
          // ALWAYS convert string keys back to numbers, regardless of game status
          let finalLockedLetters: Record<number, string | null> = {};
          
          if (puzzleState.lockedLetters && Object.keys(puzzleState.lockedLetters).length > 0) {
            // Convert string keys back to numbers from localStorage
            Object.entries(puzzleState.lockedLetters).forEach(([key, value]) => {
              const numericKey = parseInt(key, 10);
              if (!isNaN(numericKey)) {
                finalLockedLetters[numericKey] = value as string | null;
              }
            });
          } else if (puzzleState.gameStatus === 'won' && puzzleState.secretWord) {
            // Fallback: generate from secret word if no lockedLetters in localStorage
            finalLockedLetters = Object.fromEntries(
              Array.from({ length: puzzleState.wordLength }, (_, i) => [i, puzzleState.secretWord[i]])
            );
          }
          
          const fixedPuzzleState = {
            ...puzzleState,
            revealedLetters: new Set(revealedLettersArray),
            lockedLetters: finalLockedLetters
          };
          
          
          setGameState(fixedPuzzleState);
          
          // For won games, ensure currentGuess shows the solution
          if (fixedPuzzleState.gameStatus === 'won' && fixedPuzzleState.lockedLetters) {
            const solutionGuess = Array.from({ length: fixedPuzzleState.wordLength }, (_, i) => 
              fixedPuzzleState.lockedLetters[i] || ''
            );
            setCurrentGuess(solutionGuess);
          } else {
            setCurrentGuess(puzzleState.currentGuess || new Array(puzzleState.wordLength).fill(''));
            
            // Mark that we've restored from storage
            hasRestoredFromStorage.current = true;
          }
          } else {
    
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
      
      // ALWAYS convert lockedLetters keys to numbers before saving to localStorage
      const numericLockedLetters: Record<number, string | null> = {};
      Object.entries(gameState.lockedLetters).forEach(([key, value]) => {
        const numericKey = parseInt(key, 10);
        if (!isNaN(numericKey)) {
          numericLockedLetters[numericKey] = value;
        }
      });
      
      // For won games, ensure lockedLetters contain the full solution
      let finalLockedLetters = numericLockedLetters;
      if (gameState.gameStatus === 'won' && gameState.secretWord) {
        finalLockedLetters = Object.fromEntries(
          Array.from({ length: gameState.wordLength }, (_, i) => [i, gameState.secretWord[i]])
        );
      }
      
      const puzzleState = {
        ...gameState,
        lockedLetters: finalLockedLetters,
        date: today,
        currentGuess
      };
      
      localStorage.setItem('wordibble-puzzle-state', JSON.stringify(puzzleState));
    }
  }, [gameState.secretWord, gameState.attempts, gameState.attemptIndex, winAnimationComplete, currentGuess, settings.randomPuzzle, router.query.date, router.query.archive]);

  // ===== Toast helpers =====
  const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  // Manual cleanup function for stuck puzzle state
  const clearPuzzleState = useCallback(() => {
    if (confirm('Reset the current puzzle? This will clear your progress and start fresh.')) {
      localStorage.removeItem('wordibble-puzzle-state');
      localStorage.removeItem('wordibble-puzzle-completed');
      
      // Instead of reloading, reset the game state directly
      setGameState(prev => ({
        ...prev,
        attempts: [],
        attemptIndex: 0,
        gameStatus: 'playing',
        lockedLetters: {},
        revealedLetters: new Set()
      }));
      
      // Reset other state variables
      setCurrentGuess(new Array(gameState.wordLength).fill(''));
      setFlippingRows(new Set());
      setShowWinAnimation(false);
      setWinAnimationComplete(false);
      setShowFadeInForInput(false);
      setClueError(null);
      setIsShaking(false);
      setForceClear(false);
      
      // Focus the input row after reset
      setTimeout(() => {
        queueFocusFirstEmpty();
      }, 100);
    }
  }, [gameState.wordLength, queueFocusFirstEmpty]);

  // Clear ALL Wordibble data and reset to factory defaults
  const clearAllWordibbleData = useCallback(() => {
    if (confirm('This will clear ALL Wordibble data including stats, settings, and puzzle state. Are you sure?')) {
      localStorage.removeItem('wordibble-puzzle-state');
      localStorage.removeItem('wordibble-puzzle-completed');
      localStorage.removeItem('wordibble-settings');
      localStorage.removeItem('wordibble:stats:v1');
      localStorage.removeItem('wordibble-debug-mode');
      
      // Reset to factory defaults instead of reloading
      setGameState(prev => ({
        ...prev,
        attempts: [],
        attemptIndex: 0,
        gameStatus: 'playing',
        lockedLetters: {},
        revealedLetters: new Set()
      }));
      
      // Reset other state variables
      setCurrentGuess(new Array(gameState.wordLength).fill(''));
      setFlippingRows(new Set());
      setShowWinAnimation(false);
      setWinAnimationComplete(false);
      setShowFadeInForInput(false);
      setClueError(null);
      setIsShaking(false);
      setForceClear(false);
      
      // Reset settings to defaults
      setSettings({
        wordLength: GAME_CONFIG.WORD_LENGTH,
        maxGuesses: GAME_CONFIG.MAX_GUESSES,
        revealVowels: GAME_CONFIG.REVEAL_VOWELS,
        revealVowelCount: GAME_CONFIG.REVEAL_VOWEL_COUNT,
        revealClue: GAME_CONFIG.REVEAL_CLUE,
        randomPuzzle: GAME_CONFIG.RANDOM_PUZZLE,
        lockGreenMatchedLetters: GAME_CONFIG.LOCK_GREEN_MATCHED_LETTERS,
      });
      
      // Focus the input row after reset
      setTimeout(() => {
        queueFocusFirstEmpty();
      }, 100);
    }
  }, [gameState.wordLength, queueFocusFirstEmpty]);
  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ===== Input row onChange -> source of truth for the active guess =====
  const handleGuessChange = useCallback((letters: string[]) => {
    // Skip updating if keyboard input is in progress to prevent race condition
    if (keyboardInputInProgress.current) return;
    setCurrentGuess(letters);
  }, []);

  // ===== Submit guess =====
  const handleSubmit = useCallback(() => {
    if (gameState.gameStatus !== 'playing') return;

    // Build the complete guess mixing locked + current
    const completeGuess = Array.from({ length: gameState.wordLength }, (_, i) =>
      gameState.lockedLetters[i] ?? currentGuess[i] ?? ''
    ).join('');

    if (!validateGuess(completeGuess, gameState.wordLength)) {
      setClueError('Not enough letters');
      setTimeout(() => setClueError(null), 1500); // Clear after 1.5 seconds
      return;
    }
    if (!dictionary.has(completeGuess)) {
      setClueError('Not in the valid word list!');
      setTimeout(() => setClueError(null), 1500); // Clear after 1.5 seconds
      
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
      } else if (nextAttemptIndex >= settings.maxGuesses) {
        newStatus = 'lost';
      }

      return {
        ...prev,
        attempts: newAttempts,
        attemptIndex: nextAttemptIndex,
        gameStatus: newStatus,
      };
    });

    // Mark this row for flip animation
    const newRowIndex = gameState.attempts.length;
    setFlippingRows(prev => new Set([...Array.from(prev), newRowIndex]));
    
    // Don't clear the input row yet - wait for flip animation to complete
    // The input row will keep showing the submitted text until the flip is done
    
    // Clear the flip animation after all letters have flipped
    // Each tile takes TILE_FLIP_DURATION and tiles flip sequentially, so total time is (wordLength - 1) * TILE_FLIP_DURATION + TILE_FLIP_DURATION
    const flipDuration = gameState.wordLength * ANIMATION_CONFIG.TILE_FLIP_DURATION;
        setTimeout(() => {
      // Only remove non-winning rows from flippingRows
      // Winning rows should stay visible with their final state
      if (!isWin) {
        setFlippingRows(prev => {
          const next = new Set(Array.from(prev));
          next.delete(newRowIndex);
          return next;
        });
      }
      
      // Now that flip animation is complete, set the locked letters and trigger fade-in
      // Only lock green letters if the setting is enabled
      const finalLockedLetters = settings.lockGreenMatchedLetters ? newLocked : gameState.lockedLetters;
      
      setGameState(prev => ({
        ...prev,
        lockedLetters: finalLockedLetters,
      }));
      
      // Only trigger fade-in for NEWLY revealed positions (and only if locking is enabled)
      const newlyRevealedPositions = new Set<number>();
      if (settings.lockGreenMatchedLetters) {
        for (const [posStr, letter] of Object.entries(newLocked)) {
          const pos = Number(posStr);
          if (letter && !previouslyRevealedPositions.has(pos)) {
            newlyRevealedPositions.add(pos);
          }
        }
      }
      
      // Update previously revealed positions
      setPreviouslyRevealedPositions(prev => new Set([...Array.from(prev), ...Array.from(newlyRevealedPositions)]));
      
      // Only show fade-in if there are newly revealed letters
      if (newlyRevealedPositions.size > 0) {
        setShowFadeInForInput(true);
        
        // Reset fade-in trigger after animation completes
        setTimeout(() => {
          setShowFadeInForInput(false);
        }, 500);
      }
      
      // Reset current guess to only the locked positions (greens) if locking is enabled
      setCurrentGuess(() => {
        const next = new Array(gameState.wordLength).fill('');
        if (settings.lockGreenMatchedLetters) {
          for (const [idxStr, letter] of Object.entries(newLocked)) {
            const i = Number(idxStr);
            if (letter) next[i] = letter;
          }
        }
        return next;
      });
      
      // Now that flip animation is complete, trigger fade-out clear for the input row
      setFadeOutClearInput(true);
    }, flipDuration);

    // Record stats for completed game (only for daily puzzles, not archive or random)
    const isArchivePuzzle = router.query.date && router.query.archive === 'true';
    if (!isArchivePuzzle) {
      const todayISO = getESTDateString();
      recordResult(
        {
          dateISO: todayISO,
          wordLength: GAME_CONFIG.WORD_LENGTH as 5 | 6 | 7,
          won: isWin,
          guesses: isWin ? (gameState.attemptIndex + 1) : settings.maxGuesses,
          solution: gameState.secretWord,
          mode: {
            revealVowels: GAME_CONFIG.REVEAL_VOWELS,
            vowelCount: GAME_CONFIG.REVEAL_VOWEL_COUNT,
            revealClue: GAME_CONFIG.REVEAL_CLUE,
            randomPuzzle: settings.randomPuzzle,
          },
        },
        settings.maxGuesses
      );
    }

    // Don't focus immediately - wait for the flip animation to complete
    // Focus will be handled after the flip animation finishes
    }, [
    gameState.gameStatus,
    gameState.wordLength,
    gameState.lockedLetters,
    gameState.secretWord,
    currentGuess,
    dictionary,
    addToast,
    settings.maxGuesses,
    settings.randomPuzzle,
    router.query.date,
    router.query.archive,
    settings.lockGreenMatchedLetters,
    previouslyRevealedPositions,
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
      
      if (gameState.gameStatus !== 'playing') return;
      
      const i = findFirstEmptyEditableIndex();
      
      if (i >= 0) {
        // Set flag to prevent input row onChange interference
        keyboardInputInProgress.current = true;
        
        setCurrentGuess((prev) => {
          const next = [...prev];
          next[i] = key;

          return next;
        });
        
        // Clear flag after state update
        setTimeout(() => {
          keyboardInputInProgress.current = false;
        }, 0);
        
        // Advance to next editable cell
        setTimeout(() => {
          const nextIndex = findNextEditableIndex(i);

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
    // Only compute evaluations if we have a complete game state
    if (!gameState.secretWord || gameState.attempts.length === 0) {
      return [];
    }
    
    return gameState.attempts.map((attempt) => evaluateGuess(attempt, gameState.secretWord));
  }, [gameState.attempts, gameState.secretWord, gameState.gameStatus]);

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
      <div className="min-h-screen flex flex-col items-center justify-center p-2">
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

  const attemptsLeft = settings.maxGuesses - gameState.attemptIndex;

  return (
    <div className="min-h-screen flex flex-col">
      <Header onSettingsClick={() => setIsSettingsOpen(true)} />
      
      <main className="flex-1 py-4 md:py-8 px-4">
        <div className="max-w-md mx-auto">
        {/* Clue Ribbon - Handles all message types */}
        <ClueRibbon 
          clue={(() => {
            if (gameState.gameStatus === 'lost') {
              return gameState.secretWord;
            } else if (gameState.gameStatus === 'won' && winAnimationComplete) {
              // Only show win message after animation is complete
              // Calculate puzzle number (starting from 8/25/25 as puzzle #1)
              const startDate = new Date('2025-08-25');
              const today = new Date();
              const daysDiff = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
              const puzzleNumber = daysDiff + 1;
              return `Win! Nice. Wordibble #${puzzleNumber} ${gameState.attempts.length}/${settings.maxGuesses}`;
            } else if (clueError) {
              return clueError;
            } else {
              return gameState.clue || '';
            }
          })()}
          targetWord={debugMode ? gameState.secretWord : undefined}
          onRevealLetter={handleRevealLetter}
          letterRevealsRemaining={gameState.letterRevealsRemaining}
          onSettingsClick={() => {
            setSettingsOpenedFromClue(true);
            setIsSettingsOpen(true);
          }}
          variant={(() => {
            if (gameState.gameStatus === 'lost') return 'solution';
            if (gameState.gameStatus === 'won' && winAnimationComplete) return 'success';
            if (clueError) return 'error'; // Return 'error' variant for different styling
            return 'clue';
          })()}
        />
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
            {/* Active Input Row - Show when playing or won */}
            {(gameState.gameStatus === 'playing' || gameState.gameStatus === 'won') && (
              <GuessInputRow
                ref={inputRowRef as any}
                key={`input-${gameState.gameStatus}-${gameState.attemptIndex}`}
                wordLength={gameState.wordLength}
                locked={Array.from({ length: gameState.wordLength }, (_, i) => {
                  // lockedLetters now have numeric keys, so direct access works
                  const isLocked = !!gameState.lockedLetters[i];
                  return isLocked;
                })}
                initialCells={Array.from({ length: gameState.wordLength }, (_, i) => 
                  gameState.lockedLetters[i] || 
                  (isPositionRevealed(i) ? gameState.secretWord[i] : '') ||
                  currentGuess[i] || ''
                )}
                onChange={handleGuessChange}
                isShaking={isShaking}
                forceClear={forceClear}
                fadeOutClear={fadeOutClearInput}
                onFadeOutComplete={handleFadeOutComplete}
                revealedLetters={gameState.revealedLetters}
                readOnly={gameState.gameStatus !== 'playing'}
                showFadeIn={showFadeInForInput}
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
              
              return (
                <RowHistory
                  key={index}
                  guess={attempt}
                  evaluation={evaluation}
                  wordLength={gameState.wordLength}
                  isWinningRow={isWinningRow}
                  showAnimation={showWinAnimation}
                  showFlipAnimation={flippingRows.has(index)}
                />
              );
            })}
          </div>

          {/* Guesses Left */}
          {gameState.gameStatus === 'playing' && (
            <div className="text-center mb-4">
              <span className="text-gray-900 text-lg">
                {gameState.attemptIndex === 0 
                  ? `Guess the word in ${attemptsLeft} tries`
                  : `${attemptsLeft} guesses left`
                }
              </span>
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
            <div className="text-center mb-4 space-x-2">
              <button
                onClick={clearPuzzleState}
                className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600 transition-colors"
                title="Clear saved puzzle state and reload (for debugging stuck puzzles)"
              >
                Reset Puzzle
              </button>
              <button
                onClick={clearAllWordibbleData}
                className="px-4 py-2 bg-red-700 text-white rounded-lg text-sm hover:bg-red-800 transition-colors"
                title="Clear ALL Wordibble data including stats, settings, and puzzle state"
              >
                Clear All Data
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