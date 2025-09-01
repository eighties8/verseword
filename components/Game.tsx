import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/router';
import { GAME_CONFIG, ANIMATION_CONFIG } from '../lib/config';
import { GameState, Toast } from '../lib/types';
import { loadDailyPuzzle, loadPuzzle } from '../lib/daily';
import { getESTDateString } from '../lib/timezone';
import {
  loadDictionary,
  evaluateGuess,
  validateGuess,
} from '../lib/gameLogic';
import { recordResult } from '../lib/stats';
import { Brain, Trophy, EyeClosed } from 'lucide-react';
import {
  WordLength,
  PuzzleStateV2,
  ensurePuzzle,
  upsertPuzzle,
  getPuzzle,
  makeId,
  toDateISO,
  loadAll,
  saveAll,
  getLastPlayed,
  isCurrentlyPlaying,
  setIsPlaying,
} from '../lib/storage';


import Settings from './Settings';
import RowHistory from './RowHistory';
import ClueRibbon from './ClueRibbon';
import ToastComponent from './Toast';
import Keyboard from './Keyboard';
import SplashScreen from './SplashScreen';
// ⬇️ add this (paths as in your project)
import GuessInputRow, { type GuessInputRowHandle } from './GuessInputRow';

type InputRowHandle = {
  /** Move focus to the first editable (non-locked, empty) cell */
  focusFirstEmptyEditable: () => void;
  /** Move focus to the first editable (non-locked) cell even if filled */
  focusFirstEditable: () => void;
};

interface GameSettings {
  maxGuesses: number;
  revealClue: boolean;
  randomPuzzle: boolean;
  lockGreenMatchedLetters: boolean;
}

// utils/isTouch.ts
export const isTouch =
  typeof window !== 'undefined' &&
  ('ontouchstart' in window || navigator.maxTouchPoints > 0);
  

export default function Game({ openSettings, resetSettings }: { 
  openSettings?: (openedFromClue?: boolean, puzzleInProgress?: boolean) => void;
  resetSettings?: () => void;
}) {
  const router = useRouter();
  
  // Add error boundary state
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const [settings, setSettings] = useState<GameSettings>({
    maxGuesses: GAME_CONFIG.MAX_GUESSES,
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
    gameStatus: 'not_started',
    attemptIndex: 0,
    revealedLetters: new Set<number>(),
    letterRevealsRemaining: GAME_CONFIG.LETTER_REVEALS[GAME_CONFIG.WORD_LENGTH],
  });

  const [currentGuess, setCurrentGuess] = useState<string[]>([]);
  const [dictionary, setDictionary] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [forceClear, setForceClear] = useState(false);

  const [showWinAnimation, setShowWinAnimation] = useState(false);
  const [winAnimationComplete, setWinAnimationComplete] = useState(false);
  const [showLossAnimation, setShowLossAnimation] = useState(false);
  const [lossAnimationComplete, setLossAnimationComplete] = useState(false);
  const [clueError, setClueError] = useState<string | null>(null);
  const [flippingRows, setFlippingRows] = useState<Set<number>>(new Set());
  const [showFadeInForInput, setShowFadeInForInput] = useState(false);
  const [fadeOutClearInput, setFadeOutClearInput] = useState(false);
  const [previouslyRevealedPositions, setPreviouslyRevealedPositions] = useState<Set<number>>(new Set());
  const [showSplashScreen, setShowSplashScreen] = useState(true);
  
  // ===== Post-submission unlocked positions =====
  const [postSubmitUnlockedPositions, setPostSubmitUnlockedPositions] = useState<Set<number>>(new Set());
  

  
  // Callback when fade-out clear animation completes
  const handleFadeOutComplete = useCallback(() => {
    setFadeOutClearInput(false);
    
    // Focus first empty editable after the fade-out clear completes
    // Always focus after fade-out, regardless of game status
    queueFocusFirstEmpty();
  }, []);


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

  // Handle letter reveal - only allowed on initial submission
  const handleRevealLetter = useCallback(() => {
    if (gameState.letterRevealsRemaining <= 0 || (gameState.gameStatus !== 'playing' && gameState.gameStatus !== 'not_started')) {
      return;
    }
    
    // Only allow letter reveals on the initial submission (attemptIndex === 0)
    if (gameState.attemptIndex > 0) {
      setToasts(prev => [...prev, {
        id: Date.now().toString(),
        message: 'Letter reveals are only available on the first guess!',
        type: 'info'
      }]);
      return;
    }

    // Find unrevealed positions (not already revealed or locked)
    const unrevealedPositions = Array.from({ length: gameState.wordLength }, (_, i) => i)
      .filter(i => !isPositionRevealed(i));

    if (unrevealedPositions.length === 0) {
      // No more letters to reveal
      setToasts(prev => [...prev, {
        id: Date.now().toString(),
        message: 'All available letters have been revealed!',
        type: 'info'
      }]);
      return;
    }

    // Prioritize vowels over consonants
    const vowels = unrevealedPositions.filter(i => {
      const letter = gameState.secretWord[i];
      return /[AEIOU]/i.test(letter);
    });
    
    const consonants = unrevealedPositions.filter(i => {
      const letter = gameState.secretWord[i];
      return !/[AEIOU]/i.test(letter);
    });

    // Choose position to reveal: vowels first, then consonants
    let positionToReveal: number;
    if (vowels.length > 0) {
      // Reveal a random vowel
      positionToReveal = vowels[Math.floor(Math.random() * vowels.length)];
    } else {
      // No vowels left, reveal a random consonant
      positionToReveal = consonants[Math.floor(Math.random() * consonants.length)];
    }
    
    setGameState(prev => ({
      ...prev,
      revealedLetters: new Set(
        prev.revealedLetters && typeof prev.revealedLetters.has === 'function'
          ? Array.from(prev.revealedLetters).concat(positionToReveal)
          : [positionToReveal]
      ),
      letterRevealsRemaining: prev.letterRevealsRemaining - 1
    }));

    // Show success toast
    // const letter = gameState.secretWord[positionToReveal];
    // const isVowel = /[AEIOU]/i.test(letter);
    // setToasts(prev => [...prev, {
    //   id: Date.now().toString(),
    //   message: `Revealed ${isVowel ? 'vowel' : 'consonant'} "${letter}" at position ${positionToReveal + 1}!`,
    //   type: 'success'
    // }]);
  }, [gameState.letterRevealsRemaining, gameState.gameStatus, gameState.wordLength, isPositionRevealed, gameState.secretWord]);

  // Handle new game
  const handleNewGame = useCallback(async () => {
    try {
      // Clear saved puzzle state
      localStorage.removeItem('verseword-puzzle-state');
      localStorage.removeItem('verseword-puzzle-completed');
      
      // Set loading state
      setIsLoading(true);
      
      // Load new puzzle and dictionary
      const puzzle = await loadDailyPuzzle(settings.randomPuzzle);
      const dict = await loadDictionary(puzzle.word.length as 5 | 6 | 7);
      
      // Reset game state with puzzle-determined word length
      setGameState({
        wordLength: puzzle.word.length as 5 | 6 | 7,
        secretWord: '',
        clue: undefined,
        attempts: [],
        lockedLetters: {},
        gameStatus: 'not_started',
        attemptIndex: 0,
        revealedLetters: new Set<number>(),
        letterRevealsRemaining: GAME_CONFIG.LETTER_REVEALS[puzzle.word.length as 5 | 6 | 7],
      });
      
      // Reset current guess
      setCurrentGuess(new Array(puzzle.word.length).fill(''));
      
      // Reset UI states
      setIsShaking(false);
      setForceClear(false);
      setToasts([]);

      // No more automatic vowel reveal - all letters start hidden
      const lockedLetters: Record<number, string | null> = {};

      // Update game state with new puzzle
      setGameState(prev => ({
        ...prev,
        secretWord: puzzle.word,
        clue: settings.revealClue ? puzzle.clue : undefined,
        lockedLetters,
        revealedLetters: new Set<number>(),
        letterRevealsRemaining: GAME_CONFIG.LETTER_REVEALS[puzzle.word.length as 5 | 6 | 7],
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
  }, [settings.randomPuzzle, settings.revealClue]);

  // Handle win animation and letter flip
  useEffect(() => {
    // Don't redirect for archive puzzles or random puzzles
    const isArchivePuzzle = router.query.date && router.query.archive === 'true';
    
    // Check if this is a fresh win (not restored from localStorage)
    // Use a puzzle-specific completion key to avoid conflicts
    const puzzleCompletionKey = `verseword-puzzle-completed-${gameState.secretWord}-${router.query.date || 'today'}`;
    const isFreshWin = !localStorage.getItem(puzzleCompletionKey);
    
    if (gameState.gameStatus === 'won' && !showWinAnimation && !settings.randomPuzzle && !isArchivePuzzle) {
      setShowWinAnimation(true);
      
      // Only mark as completed for fresh wins to prevent redirect loops
      if (isFreshWin) {
        localStorage.setItem(puzzleCompletionKey, 'true');
      }
      
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
        

        
        // Wait 2 seconds after the win animation completes, then redirect to stats with fade transition
        // Only redirect for fresh wins, not restored wins
        if (isFreshWin) {
          // console.log('🎯 Fresh win detected - will redirect to stats in 2 seconds');
          setTimeout(() => {
            // console.log('🔄 Starting fade transition to stats...');
            // Add fade out effect before redirecting
            const gameContainer = document.querySelector('.game-container');
            if (gameContainer) {
              gameContainer.classList.add('opacity-0', 'transition-opacity', 'duration-500');
              setTimeout(() => {
                // console.log('🚀 Redirecting to stats page');
                router.push('/stats');
              }, 500);
            } else {
              // console.log('⚠️ Game container not found, redirecting immediately');
              router.push('/stats');
            }
          }, 2000);
        } else {
          // console.log('📋 Restored win - no redirect to stats');
        }
      }, totalAnimationTime);
    }
  }, [gameState.gameStatus, showWinAnimation, settings.randomPuzzle, router.query.date, router.query.archive, gameState.wordLength]);

  // Handle loss animation and letter flip
  useEffect(() => {
    // Don't redirect for archive puzzles or random puzzles
    const isArchivePuzzle = router.query.date && router.query.archive === 'true';
    if (gameState.gameStatus === 'lost' && !showLossAnimation && !settings.randomPuzzle && !isArchivePuzzle) {
      setShowLossAnimation(true);
      
      // Wait for the flip animation to complete (same timing as row flips)
      // Use the same duration as the tile flip animations
      const totalAnimationTime = gameState.wordLength * ANIMATION_CONFIG.TILE_FLIP_DURATION;
      
      setTimeout(() => {
        setLossAnimationComplete(true);
      }, totalAnimationTime);
    }
  }, [gameState.gameStatus, showLossAnimation, settings.randomPuzzle, router.query.date, router.query.archive, gameState.wordLength]);

  // Generate and share emoji grid
  const generateAndShareEmojiGrid = () => {
    // Temporarily allow sharing for all puzzles to test logging
    // const isArchivePuzzle = router.query.date && router.query.archive === 'true';
    // if (settings.randomPuzzle || isArchivePuzzle) {
    //   setToasts(prev => [...prev, {
    //     id: Date.now().toString(),
    //       message: 'Sharing is only available for daily puzzles',
    //       type: 'info'
    //     }]);
    //   return;
    // }

    // Calculate puzzle number based on the actual puzzle date, not current date
    const startDate = new Date('2025-08-25');
    let puzzleDate: Date;
    
    if (router.query.date && router.query.archive === 'true') {
      // For archive puzzles, use the puzzle's date
      const dateString = router.query.date as string;
      const [year, month, day] = dateString.split('-').map(Number);
      puzzleDate = new Date(year, month - 1, day);
    } else {
      // For daily puzzles, use current date
      puzzleDate = new Date();
    }
    
    const daysDiff = Math.floor((puzzleDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const puzzleNumber = daysDiff + 1;

    // Generate emoji grid from game state
    let emojiGrid = `Verseword #${puzzleNumber} ${gameState.attemptIndex}/${settings.maxGuesses}\nhttps://verseword.com\n`;
    
    // Add each submitted attempt as emoji rows (exclude the top input row)
    gameState.attempts.forEach((attempt, attemptIndex) => {
      let row = '';
      const evaluations = evaluateGuess(attempt, gameState.secretWord);
            
      for (let i = 0; i < gameState.wordLength; i++) {
        const letter = attempt[i];
        const evaluation = evaluations[i];
        
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
    const savedDebugMode = localStorage.getItem('verseword-debug-mode');
    if (savedDebugMode) setDebugMode(JSON.parse(savedDebugMode));
  }, []);
  useEffect(() => {
    localStorage.setItem('verseword-debug-mode', JSON.stringify(debugMode));
  }, [debugMode]);

  // ===== Settings (persisted) =====
  useEffect(() => {
    const savedSettings = localStorage.getItem('verseword-settings');
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



  const handleSettingsChange = useCallback((newSettings: GameSettings) => {
    setSettings(newSettings);
    
    // If random puzzle setting changed, clear saved state
    if (newSettings.randomPuzzle !== settings.randomPuzzle) {
      localStorage.removeItem('verseword-puzzle-state');
    }
    

  }, [gameState.wordLength, settings.randomPuzzle]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.shiftKey && e.key === 'd') {
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
  
        
        // Note: localStorage cleanup is now handled in the dedicated persistence effect

        
        let puzzle;
                let dict;
        
        // Check if this is an archive puzzle
        if (router.query.date && router.query.archive === 'true') {
          // Parse the date string directly to avoid timezone issues
          const dateString = router.query.date as string;
          const [year, month, day] = dateString.split('-').map(Number);
          const archiveDate = new Date(year, month - 1, day); // month is 0-indexed

          
          puzzle = await loadPuzzle(archiveDate);
          
          // Load dictionary for the puzzle's word length
          dict = await loadDictionary(puzzle.word.length as 5 | 6 | 7);
        } else {
          puzzle = await loadDailyPuzzle(settings.randomPuzzle);
          
          // Load dictionary for the puzzle's word length
          dict = await loadDictionary(puzzle.word.length as 5 | 6 | 7);
        }
        
        // Debug: Log the hidden word and clue
        console.log('🎯 Hidden word:', puzzle.word);
        console.log('💡 Clue:', puzzle.clue);
        
        // No more automatic vowel reveal - all letters start hidden
        const lockedLetters: Record<number, string | null> = {};

        if (!alive) return;

        // Use the puzzle's actual word length
        const puzzleWordLength = puzzle.word.length as 5 | 6 | 7;

        // After loading puzzle, check if we have saved state to restore
        let dateISO: string;
        let wordLength: WordLength;
        
        if (router.query.date && router.query.archive === 'true') {
          // Parse the date string directly to avoid timezone issues
          const dateString = router.query.date as string;
          const [year, month, day] = dateString.split('-').map(Number);
          const archiveDate = new Date(year, month - 1, day); // month is 0-indexed
          dateISO = toDateISO(archiveDate);
          wordLength = puzzleWordLength;
        } else {
          dateISO = toDateISO(new Date());
          wordLength = puzzleWordLength;
        }
        
        const puzzleId = makeId(dateISO, wordLength);
        const savedState = getPuzzle(puzzleId);
        
        // Only restore if we have meaningful saved state AND it's for the same puzzle
        if (savedState && (savedState.attempts.length > 0 || savedState.gameStatus !== 'playing' && savedState.gameStatus !== 'not_started')) {
          // CRITICAL: Only restore if the saved state matches the current puzzle
          if (savedState.secretWord !== puzzle.word) {
            console.warn('⚠️ Saved state mismatch - not restoring:', {
              savedStateSecretWord: savedState.secretWord,
              currentPuzzleWord: puzzle.word,
              puzzleId,
              isArchivePuzzle: router.query.date && router.query.archive === 'true'
            });
            // Don't restore mismatched state - start fresh
            setGameState((prev) => ({
              ...prev,
              wordLength: puzzleWordLength,
              secretWord: puzzle.word,
              clue: settings.revealClue ? puzzle.clue : undefined,
                          lockedLetters,
            revealedLetters: new Set<number>(),
            letterRevealsRemaining: GAME_CONFIG.LETTER_REVEALS[puzzleWordLength],
            }));
            
            // Mark this route as hydrated and track which puzzle the state belongs to
            activePuzzleIdRef.current = puzzleId;
            hydratedForRouteRef.current = true;
            console.log('[HYDRATION] Set hydrated to true for puzzle:', puzzleId);
            
            setCurrentGuess(new Array(puzzleWordLength).fill(''));
            hasRestoredFromStorage.current = true;
            return;
          }
          
          // Convert revealedLetters from Set to Record for compatibility
          const revealedLettersRecord: Record<number, string> = {};
          if (savedState.revealedLetters) {
            Object.entries(savedState.revealedLetters).forEach(([key, value]) => {
              const numericKey = parseInt(key, 10);
              if (!isNaN(numericKey)) {
                revealedLettersRecord[numericKey] = value;
              }
            });
          }
          
          const restoredGameState: GameState = {
            wordLength: savedState.wordLength,
            secretWord: puzzle.word, // Use the actual puzzle word, not saved word
            clue: settings.revealClue ? puzzle.clue : undefined,
            attempts: savedState.attempts,
            lockedLetters: savedState.lockedLetters,
            gameStatus: savedState.gameStatus,
            attemptIndex: savedState.attemptIndex,
            revealedLetters: new Set(Object.keys(revealedLettersRecord).map(Number)),
            letterRevealsRemaining: savedState.letterRevealsRemaining,
          };
          
          setGameState(restoredGameState);
          
          // Set playing flag when restoring saved state
          setIsPlaying();
          
          // Mark this route as hydrated and track which puzzle the state belongs to
          activePuzzleIdRef.current = puzzleId;
          hydratedForRouteRef.current = true;
          console.log('[HYDRATION] Set hydrated to true for restored puzzle:', puzzleId);
          
          // For won games, ensure currentGuess shows the solution and restore animation states
          if (restoredGameState.gameStatus === 'won' && restoredGameState.lockedLetters) {
            const solutionGuess = Array.from({ length: restoredGameState.wordLength }, (_, i) => 
              restoredGameState.lockedLetters[i] || ''
            );
            setCurrentGuess(solutionGuess);
            setShowWinAnimation(savedState.showWinAnimation || false);
            setWinAnimationComplete(savedState.winAnimationComplete || false);
            setShowLossAnimation(savedState.showLossAnimation || false);
            setLossAnimationComplete(savedState.lossAnimationComplete || false);
            setShowFadeInForInput(savedState.showFadeInForInput || false);
            setFadeOutClearInput(savedState.fadeOutClearInput || false);
            setPreviouslyRevealedPositions(new Set(savedState.previouslyRevealedPositions || []));
          } else {
            setCurrentGuess(savedState.currentGuess || new Array(savedState.wordLength).fill(''));
          }
          
          hasRestoredFromStorage.current = true;
        } else {
          // No saved state, set up fresh game
          
          setGameState((prev) => ({
            ...prev,
            wordLength: puzzleWordLength,
            secretWord: puzzle.word,
            clue: settings.revealClue ? puzzle.clue : undefined,
            lockedLetters,
            revealedLetters: new Set<number>(),
            letterRevealsRemaining: GAME_CONFIG.LETTER_REVEALS[puzzleWordLength],
          }));
          
          // Mark this route as hydrated and track which puzzle the state belongs to
          activePuzzleIdRef.current = puzzleId;
          hydratedForRouteRef.current = true;
          console.log('[HYDRATION] Set hydrated to true for restored puzzle:', puzzleId);
          
          setCurrentGuess(new Array(puzzleWordLength).fill(''));
          setFlippingRows(new Set());
          setShowWinAnimation(false);
          setWinAnimationComplete(false);
          setShowLossAnimation(false);
          setLossAnimationComplete(false);
          setShowFadeInForInput(false);
          setFadeOutClearInput(false);
          setPreviouslyRevealedPositions(new Set());
          
          hasRestoredFromStorage.current = false;
        }
        
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
  }, [settings.randomPuzzle, settings.revealClue, router.query.date, router.query.archive]);

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
  
  // Helper function to get the expected secret word synchronously
  function getExpectedSecretSync(dateISO: string, wordLength: WordLength): string | null {
    // TODO: Implement actual puzzle lookup from your data
    // For now, return null to disable this validation until you implement the lookup
    // Example: look up in your preloaded puzzles map
    // const entry = puzzlesByLength[wordLength]?.find(p => p.date === dateISO);
    // return entry?.word ?? null;
    return null; // <- replace with your real lookup
  }
  
  // Reset restoration flag when route changes (e.g., navigating between puzzles)
  useEffect(() => {
    hasRestoredFromStorage.current = false;
  }, [router.query.date, router.query.archive, router.query.length]);

  // Build the active "route puzzle" from the URL (archive) or today (daily)
  const isArchiveRoute =
    router.isReady &&
    router.query.archive === 'true' &&
    typeof router.query.date === 'string';

  const routePuzzle = React.useMemo(() => {
    if (!router.isReady) return null;

    if (isArchiveRoute) {
      // Parse the date string directly to avoid timezone issues (same logic as puzzle loading)
      const dateString = router.query.date as string;
      const [year, month, day] = dateString.split('-').map(Number);
      const archiveDate = new Date(year, month - 1, day); // month is 0-indexed
      const dateISO = toDateISO(archiveDate);
      // For archived puzzles, use the word length from the loaded puzzle data
      // This will be set by the puzzle loading useEffect
      const wl = gameState.wordLength || Number(router.query.length) || 5; // Use game state first, then query param, then default
      const result = { id: makeId(dateISO, wl as WordLength), dateISO, wordLength: wl as WordLength, isArchive: true as const };
      console.log('[ROUTE PUZZLE] Archive route:', result, 'gameState.wordLength:', gameState.wordLength);
      return result;
    }

    const todayISO = toDateISO(new Date());
    // For daily puzzles, use the word length from the loaded puzzle data
    // This will be set by the puzzle loading useEffect
    const wl = gameState.wordLength || 5; // Use current game state or default to 5
    const result = { id: makeId(todayISO, wl as WordLength), dateISO: todayISO, wordLength: wl as WordLength, isArchive: false as const };
    console.log('[ROUTE PUZZLE] Daily route:', result, 'gameState.wordLength:', gameState.wordLength);
    return result;
  }, [router.isReady, router.query.archive, router.query.date, router.query.length, gameState.wordLength]);

  // Ref that says: "the in-memory gameState belongs to THIS puzzle id"
  const activePuzzleIdRef = useRef<string>('');
  
  // Ref that says: "we have finished hydrating/initializing state for this route"
  const hydratedForRouteRef = useRef(false);

  // When route changes, block saving until we hydrate for that route
  // But don't reset if it's just a word length change for the same date
  useEffect(() => {
    if (routePuzzle?.id && activePuzzleIdRef.current) {
      const currentDate = activePuzzleIdRef.current.split(':')[0];
      const newDate = routePuzzle.id.split(':')[0];
      
      // Only reset hydration if the date actually changed, not just the word length
      if (currentDate !== newDate) {
        hydratedForRouteRef.current = false;
        console.log('[HYDRATION] Reset hydration due to date change:', currentDate, '->', newDate);
      } else {
        console.log('[HYDRATION] Keeping hydration for same date, word length change:', activePuzzleIdRef.current, '->', routePuzzle.id);
      }
    } else {
      hydratedForRouteRef.current = false;
    }
  }, [routePuzzle?.id]);

  // Also add this tiny effect so route changes don't leave stale refs
  useEffect(() => {
    if (!routePuzzle) return;
    activePuzzleIdRef.current = routePuzzle.id;
  }, [routePuzzle?.id]);

  // Save puzzle state to localStorage
  useEffect(() => {
    if (!router.isReady || !routePuzzle) return;

    // Quick debug to confirm values line up while pressing Enter on archive puzzle
    console.log('[SAVE GUARDS]', {
      isReady: router.isReady,
      routePuzzle,
      activeId: activePuzzleIdRef.current,
      hydrated: hydratedForRouteRef.current,
      secret: gameState.secretWord,
      status: gameState.gameStatus,
      attempts: gameState.attempts.length,
    });

    // Must be hydrated for this route and state must belong to this route
    if (!hydratedForRouteRef.current) return;
    if (activePuzzleIdRef.current !== routePuzzle.id) return;

    // --- IMPORTANT: Don't block on randomPuzzle when saving archives or daily.
    // If you still want the flag, gate only the DAILY case; archives should save.
    // if (!routePuzzle.isArchive && settings.randomPuzzle) return;

    // Optional "expected secret" check should run only for DAILY, not ARCHIVE.
    if (!routePuzzle.isArchive && typeof getExpectedSecretSync === 'function') {
      const expected = getExpectedSecretSync(routePuzzle.dateISO, routePuzzle.wordLength);
      if (expected && expected.toUpperCase() !== (gameState.secretWord || '').toUpperCase()) {
        return; // still mismatched during route change; skip this save tick
      }
    }

    // For WINS, avoid saving half-populated state while animations finish
    if (
      gameState.gameStatus === 'won' &&
      (gameState.attempts.length === 0 || Object.keys(gameState.lockedLetters).length === 0)
    ) {
      return;
    }

    // ---- Build storage payload STRICTLY from routePuzzle for id/date/length ----
    const { id, dateISO, wordLength } = routePuzzle;

    // Convert revealedLetters Set -> Record
    const revealedLettersRecord: Record<number, string> = {};
    gameState.revealedLetters.forEach((pos) => {
      if (gameState.secretWord[pos]) revealedLettersRecord[pos] = gameState.secretWord[pos];
    });

    // Normalize locked letters; if won, force full solution
    let finalLocked: Record<number, string> = {};
    for (const [k, v] of Object.entries(gameState.lockedLetters)) {
      if (v != null) finalLocked[parseInt(k, 10)] = v;
    }
    if (gameState.gameStatus === 'won' && gameState.secretWord) {
      finalLocked = Object.fromEntries(
        Array.from({ length: gameState.wordLength }, (_, i) => [i, gameState.secretWord[i]])
      );
    }

    const puzzleState: PuzzleStateV2 = {
      id,                 // <--- use routePuzzle.id (e.g. "2025-08-25:5")
      dateISO,            // <--- use routePuzzle.dateISO
      wordLength,         // <--- use routePuzzle.wordLength
      secretWord: gameState.secretWord,
      attempts: gameState.attempts,
      lockedLetters: finalLocked,
      revealedLetters: revealedLettersRecord,
      letterRevealsRemaining: gameState.letterRevealsRemaining,
      gameStatus: gameState.gameStatus,
      attemptIndex: gameState.attemptIndex,
      currentGuess,
      completedAt: (gameState.gameStatus !== 'playing' && gameState.gameStatus !== 'not_started') ? new Date().toISOString() : undefined,

      // animation flags you already store:
      showWinAnimation,
      winAnimationComplete,
      showLossAnimation,
      lossAnimationComplete,
      showFadeInForInput,
      fadeOutClearInput,
      previouslyRevealedPositions: Array.from(previouslyRevealedPositions),
    };

    upsertPuzzle(puzzleState);
  }, [
    router.isReady,
    routePuzzle?.id,            // include the routed id so effect re-evaluates on route change
    routePuzzle?.dateISO,
    routePuzzle?.wordLength,
    // game progress deps:
    gameState.secretWord,
    gameState.attempts,
    gameState.attemptIndex,
    gameState.lockedLetters,
    gameState.revealedLetters,
    gameState.letterRevealsRemaining,
    gameState.gameStatus,
    // ui flags you persist:
    winAnimationComplete,
    showWinAnimation,
    showLossAnimation,
    lossAnimationComplete,
    showFadeInForInput,
    fadeOutClearInput,
    // current input:
    currentGuess,
  ]);

  // Belt-and-suspenders: force one immediate save when a puzzle transitions to WON
  // Sometimes the state after a route switch doesn't change again post-win (no dependency tick).
  // This tiny effect guarantees one save on the status transition:
  const saveNowRef = useRef<null | (() => void)>(null);
  saveNowRef.current = () => {
    // call the same builder used in the save effect with current routePuzzle/gameState
    // (or just rely on the effect—your call)
  };

  useEffect(() => {
    if (gameState.gameStatus === 'won') {
      // Kick a microtask so locks/reveals have landed
      queueMicrotask(() => {
        // optionally: saveNowRef.current?.();
      });
    }
  }, [gameState.gameStatus]);

  // ===== Toast helpers =====
  const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  // Manual cleanup function for stuck puzzle state
  const clearPuzzleState = useCallback(() => {
    if (confirm('Reset the current puzzle? This will clear your progress and start fresh.')) {
      // Clear from new storage system
      const isArchivePuzzle = router.query.date && router.query.archive === 'true';
      let dateISO: string;
      let wordLength: WordLength;
      
      if (isArchivePuzzle) {
        // Parse the date string directly to avoid timezone issues
        const dateString = router.query.date as string;
        const [year, month, day] = dateString.split('-').map(Number);
        const archiveDate = new Date(year, month - 1, day); // month is 0-indexed
        dateISO = toDateISO(archiveDate);
        wordLength = (router.query.length ? parseInt(router.query.length as string) : gameState.wordLength) as WordLength;
      } else {
        dateISO = toDateISO(new Date());
        wordLength = gameState.wordLength;
      }
      
              const puzzleId = makeId(dateISO, wordLength);
      const all = loadAll();
      delete all[puzzleId];
      saveAll(all);
      
      // Clear dynamic puzzle completion keys for this specific puzzle
      const puzzleCompletionKey = `verseword-puzzle-completed-${gameState.secretWord}-${dateISO}`;
      localStorage.removeItem(puzzleCompletionKey);
      
      // If this is the current puzzle, also clear the last played reference
      if (puzzleId === getLastPlayed()) {
        localStorage.removeItem('verseword:lastPlayed:v2');
      }
      
      // Also clear old localStorage for backward compatibility
      localStorage.removeItem('verseword-puzzle-state');
      localStorage.removeItem('verseword-puzzle-completed');
      
      // Reset the restoration flag so we can start fresh
      hasRestoredFromStorage.current = false;
      
      // Instead of reloading, reset the game state directly
      setGameState(prev => ({
        ...prev,
        attempts: [],
        attemptIndex: 0,
        gameStatus: 'not_started',
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
  }, [gameState.wordLength, gameState.secretWord, queueFocusFirstEmpty, router.query.date, router.query.archive, router.query.length]);

  // Clear ALL Verseword data and reset to factory defaults
  const clearAllVersewordData = useCallback(() => {
    if (confirm('This will clear ALL Verseword data including stats, settings, and puzzle state. Are you sure?')) {
      // Clear from new storage system
      saveAll({});
      localStorage.removeItem('verseword:lastPlayed:v2');
      
      // Clear current stats
      localStorage.removeItem('verseword:stats:v1');
      
      // Clear current settings
      localStorage.removeItem('verseword-settings');
      
      // Clear dynamic puzzle completion keys (these are puzzle-specific)
      // We need to clear all keys that match the pattern verseword-puzzle-completed-*
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('verseword-puzzle-completed-')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      // Also clear old localStorage for backward compatibility
      localStorage.removeItem('verseword-puzzle-state');
      localStorage.removeItem('verseword-puzzle-completed');
      localStorage.removeItem('verseword-debug-mode');
      
              // Reset to factory defaults instead of reloading
        setGameState(prev => ({
          ...prev,
          attempts: [],
          attemptIndex: 0,
          gameStatus: 'not_started',
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
        maxGuesses: GAME_CONFIG.MAX_GUESSES,
        revealClue: GAME_CONFIG.REVEAL_CLUE,
        randomPuzzle: GAME_CONFIG.RANDOM_PUZZLE,
        lockGreenMatchedLetters: GAME_CONFIG.LOCK_GREEN_MATCHED_LETTERS,
      });
      
      // Also reset the global settings in the parent component
      if (resetSettings) {
        resetSettings();
      }
      
      // Reset the restoration flag so we can start fresh
      hasRestoredFromStorage.current = false;
      
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
    if (gameState.gameStatus !== 'playing' && gameState.gameStatus !== 'not_started') return;

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
      
      // Shake animation to indicate invalid word
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      
      // Don't clear anything - preserve current guess including revealed letters
      // Just return to let user correct their input
      return;
    }

    // Clear any previous error
    setClueError(null);

    // Only undo reveal behavior for VALID submissions if letter locking is disabled
    if (!settings.lockGreenMatchedLetters) {
      // console.log('UNDO: Remove from revealedLetters, unlock positions, clear postSubmitUnlockedPositions');
      // UNDO: Remove from revealedLetters, unlock positions, clear postSubmitUnlockedPositions
      setGameState(prev => ({
        ...prev,
        revealedLetters: new Set<number>(), // Clear revealed letters
      }));
      setPostSubmitUnlockedPositions(new Set()); // Clear unlocked positions
    } else {
      // Clear any previously set unlocked positions
      setPostSubmitUnlockedPositions(new Set());
    }
    
    const evaluation = evaluateGuess(completeGuess, gameState.secretWord);
    const isWin = evaluation.every((s) => s === 'correct');

    // Update locked letters for exact matches
    const newLocked = { ...gameState.lockedLetters };
    for (let i = 0; i < evaluation.length; i++) {
      if (evaluation[i] === 'correct') newLocked[i] = completeGuess[i];
    }

    // Update state (but delay gameStatus change for won/lost until after flip animation)
    setGameState((prev) => {
      const newAttempts = prev.attempts.length
        ? [...prev.attempts, completeGuess]
        : [completeGuess];
      const nextAttemptIndex = prev.attemptIndex + 1;

      // Only set status to 'playing' after first guess submission
      // For won/lost games, keep current status until flip animation completes
      let newStatus: GameState['gameStatus'];
      if (isWin) {
        newStatus = prev.gameStatus; // Keep current status, will update after animation
      } else if (nextAttemptIndex >= settings.maxGuesses) {
        newStatus = prev.gameStatus; // Keep current status, will update after animation
      } else if (prev.gameStatus === 'not_started') {
        // First guess submitted - now we're actively playing
        newStatus = 'playing';
      } else {
        // Continue with current status (should be 'playing')
        newStatus = prev.gameStatus;
      }

      return {
        ...prev,
        attempts: newAttempts,
        attemptIndex: nextAttemptIndex,
        gameStatus: newStatus,
      };
    });
    


    // Set playing flag on first guess to hide splash screen
    if (gameState.attempts.length === 0) {
      setIsPlaying();
    }

    // STEP 1: Simple input clearing - clear the input row immediately after submission
    setCurrentGuess(new Array(gameState.wordLength).fill(''));

    // Mark this row for flip animation
    const newRowIndex = gameState.attempts.length;
    setFlippingRows(prev => new Set([...Array.from(prev), newRowIndex]));
    
    // Keep the input row visible during flip animations
    // It will be cleared with fade transition after animations complete
    
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
      const finalLockedLetters = settings.lockGreenMatchedLetters ? newLocked : {};
      
      setGameState(prev => ({
        ...prev,
        lockedLetters: finalLockedLetters,
      }));
      
      // Now update game status to won/lost and save to localStorage (after flip animation)
      if (isWin || gameState.attemptIndex + 1 >= settings.maxGuesses) {
        setGameState(prev => ({
          ...prev,
          gameStatus: isWin ? 'won' : 'lost',
        }));
        
        // Save puzzle state to localStorage
        const puzzleId = makeId(router.query.date as string || getESTDateString(), gameState.wordLength as 5 | 6 | 7);
        const puzzleState: PuzzleStateV2 = {
          id: puzzleId,
          dateISO: router.query.date as string || getESTDateString(),
          wordLength: gameState.wordLength as 5 | 6 | 7,
          secretWord: gameState.secretWord,
          attempts: [...gameState.attempts, completeGuess],
          lockedLetters: Object.fromEntries(
            Object.entries(finalLockedLetters).map(([pos, letter]) => [Number(pos), letter || ''])
          ),
          revealedLetters: {},
          letterRevealsRemaining: gameState.letterRevealsRemaining,
          gameStatus: isWin ? 'won' : 'lost',
          attemptIndex: gameState.attemptIndex + 1,
          currentGuess: [],
          showWinAnimation: isWin,
          winAnimationComplete: false,
          showLossAnimation: !isWin,
          lossAnimationComplete: false,
          showFadeInForInput: false,
          fadeOutClearInput: false,
          previouslyRevealedPositions: [],
        };
        
        upsertPuzzle(puzzleState);
      }
      
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
      
      // Show fade-in for newly revealed letters OR for won games
      if (newlyRevealedPositions.size > 0 || isWin) {
        setShowFadeInForInput(true);
        
        // Reset fade-in trigger after animation completes
        setTimeout(() => {
          setShowFadeInForInput(false);
        }, 500);
      }
      
      // STEP 2: Basic focus management - moved here after flip animation completes
      setTimeout(() => {
        // Don't focus for won/lost games
        if (gameState.gameStatus === 'won' || gameState.gameStatus === 'lost') {
          return;
        }
        
        // Find the first unlocked position (only skip locked letters for focus)
        let firstUnlockedIndex = -1;
        for (let i = 0; i < gameState.wordLength; i++) {
          const isLocked = gameState.lockedLetters[i];
          
          // Only skip locked letters for focus - revealed letters are editable
          if (!isLocked) {
            firstUnlockedIndex = i;
            break;
          }
        }
        
        // Focus the first unlocked position (or first position if all are locked)
        if (firstUnlockedIndex >= 0) {
          queueFocusSpecificIndex(firstUnlockedIndex);
        } else {
          // Fallback: focus first position if somehow all are locked
          queueFocusFirstEmpty();
        }
      }, 100); // Small delay to ensure state updates are processed
      
      // TEMPORARILY DISABLED: After flip animation completes, trigger fade-out transition for input row
      // setFadeOutClearInput(true);
      
      // TEMPORARILY DISABLED: The GuessInputRow component will handle the fade-out and clearing
      // TEMPORARILY DISABLED: The onFadeOutComplete callback will handle focus and state reset
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
      if (e.key === 'Enter' && (gameState.gameStatus === 'playing' || gameState.gameStatus === 'not_started')) handleSubmit();
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
      const isLocked = gameState.lockedLetters[i];
      
      // Only skip locked letters for focus - revealed letters are editable
      if (!isLocked) {
        return i;
      }
    }
    return -1; // No more editable cells
  }, [gameState.wordLength, gameState.lockedLetters]);

  const findFirstEditableIndex = useCallback(() => {
    // Find first editable cell
    for (let i = 0; i < gameState.wordLength; i++) {
      const isLocked = gameState.lockedLetters[i];
      
      // Only skip locked letters for focus - revealed letters are editable
      if (!isLocked) {
        return i;
      }
    }
    return -1; // No editable cells
  }, [gameState.wordLength, gameState.lockedLetters]);

  const findFirstEmptyEditableIndex = useCallback(() => {
    // Find first editable cell that is empty
    for (let i = 0; i < gameState.wordLength; i++) {
      const isLocked = gameState.lockedLetters[i];
      
      // Only skip locked letters for focus - revealed letters are editable
      if (!isLocked && !currentGuess[i]) {
        return i;
      }
    }
    // If no empty editable cells, return first editable cell
    return findFirstEditableIndex();
  }, [currentGuess, gameState.wordLength, gameState.lockedLetters, findFirstEditableIndex]);

  const handleKeyboardKeyPress = useCallback(
    (key: string) => {
      
      if (gameState.gameStatus !== 'playing' && gameState.gameStatus !== 'not_started') return;
      
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
    if (gameState.gameStatus !== 'playing' && gameState.gameStatus !== 'not_started') return;
    
    // Find last filled editable cell, skipping over locked letters only
    let i = -1;
    for (let j = currentGuess.length - 1; j >= 0; j--) {
      const isLocked = gameState.lockedLetters[j];
      const hasContent = currentGuess[j];
      
      // Only skip locked letters for backspace - revealed letters are editable
      if (isLocked) {
        continue; // Skip to next position
      }
      
      // Found an editable position with content
      if (hasContent) {
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
    // Don't focus for won/lost games
    if (gameState.gameStatus === 'won' || gameState.gameStatus === 'lost') {
      return;
    }
    
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
    // Don't focus for won/lost games
    if (gameState.gameStatus === 'won' || gameState.gameStatus === 'lost') {
      return;
    }
    
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
    // Don't focus for won/lost games
    if (!isLoading && gameState.secretWord && gameState.gameStatus !== 'won' && gameState.gameStatus !== 'lost') {
      queueFocusFirstEmpty();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, gameState.secretWord, gameState.lockedLetters, gameState.gameStatus]);

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
          <h1 className="text-2xl text-red-600 mb-4">Something went wrong</h1>
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

  // if (isLoading) {
  //   return (
  //     <div className="flex items-center justify-center min-h-screen">
  //       <div className="text-xl text-gray-900">Loading</div>
  //     </div>
  //   );
  // }

  // Check if we should show the splash screen (only after loading is complete)
  const isPlaying = isCurrentlyPlaying();
  
  // // Show splash screen when: not loading, no active game, and splash hasn't been dismissed
  // if (!isLoading && !isPlaying && showSplashScreen) {
  //   return (
  //     <SplashScreen
  //       onStartGame={() => {
  //         // Set playing flag and hide splash
  //         setIsPlaying();
  //         setShowSplashScreen(false);
  //       }}
  //       onOpenSettings={() => {
  //         if (openSettings) {
  //           // Check if the currently loaded puzzle is in progress
  //           const currentPuzzleId = activePuzzleIdRef.current;
  //           let currentPuzzleInProgress = false;
            
  //           if (currentPuzzleId) {
  //             try {
  //               const currentPuzzle = getPuzzle(currentPuzzleId as any);
  //               currentPuzzleInProgress = currentPuzzle?.gameStatus === 'playing';
  //             } catch (error) {
  //               currentPuzzleInProgress = false;
  //             }
  //           }
            
  //           openSettings(false, currentPuzzleInProgress);
  //         }
  //       }}
  //     />
  //   );
  // }

  // // Hide splash screen when there's an active game
  // if (!isLoading && isPlaying && showSplashScreen) {
  //   setShowSplashScreen(false);
  // }

  const attemptsLeft = settings.maxGuesses - gameState.attemptIndex;

  return (
    <div className="flex flex-col game-container">
      <main className="flex-1 py-4 md:py-8 px-2">
        <div className="max-w-md mx-auto">
        {/* Clue Ribbon - Handles all message types */}
        <ClueRibbon 
          clue={(() => {
            if (gameState.gameStatus === 'lost' && lossAnimationComplete) {
              return `Loss: ${gameState.secretWord}`;
            } else if (gameState.gameStatus === 'won') {
              // Show win message when game is won (either after animation or when restored from localStorage)
              // Calculate puzzle number based on the actual puzzle date, not current date
              const startDate = new Date('2025-08-25');
              let puzzleDate: Date;
              
              if (router.query.date && router.query.archive === 'true') {
                // For archive puzzles, use the puzzle's date
                const dateString = router.query.date as string;
                const [year, month, day] = dateString.split('-').map(Number);
                puzzleDate = new Date(year, month - 1, day);
              } else {
                // For daily puzzles, use current date
                puzzleDate = new Date();
              }
              
              const daysDiff = Math.floor((puzzleDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
              const puzzleNumber = daysDiff + 1;
              return `Solved! Verseword #${puzzleNumber} ${gameState.attempts.length}/${settings.maxGuesses}`;
            } else if (clueError) {
              return clueError;
            } else {
              return gameState.clue || '';
            }
          })()}
          targetWord={debugMode ? gameState.secretWord : undefined}
          onRevealLetter={handleRevealLetter}
          letterRevealsRemaining={gameState.letterRevealsRemaining}
          letterRevealsAllowed={gameState.attemptIndex === 0}
          onSettingsClick={() => {
            if (openSettings) {
              // Check if the currently loaded puzzle is in progress
              const currentPuzzleId = activePuzzleIdRef.current;
              let currentPuzzleInProgress = false;
              
              if (currentPuzzleId) {
                try {
                  const currentPuzzle = getPuzzle(currentPuzzleId as any);
                  // Only consider it in progress if actually playing, not just started
                  currentPuzzleInProgress = currentPuzzle?.gameStatus === 'playing';
                } catch (error) {
                  currentPuzzleInProgress = false;
                }
              }
              
              openSettings(true, currentPuzzleInProgress); // true means opened from clue
            }
          }}
          variant={(() => {
            if (gameState.gameStatus === 'lost' && lossAnimationComplete) return 'solution';
            if (gameState.gameStatus === 'won') return 'success';
            if (clueError) return 'error'; // Return 'error' variant for different styling
            return 'clue';
          })()}
          guessesText={(gameState.gameStatus === 'playing' || gameState.gameStatus === 'not_started') ? (
            gameState.attemptIndex === 0 
              ? `Guess the word in ${attemptsLeft} tries`
              : `${attemptsLeft} guesses left`
          ) : undefined}
          revealClueEnabled={settings.revealClue}
          wordLength={gameState.wordLength}
        />
          {/* Debug: Show clue info */}
          {/* {debugMode && (
            <div className="text-center mb-4 text-xs text-gray-500">
              <div>Clue: {gameState.clue || 'undefined'}</div>
              <div>Reveal Clue: {settings.revealClue ? 'true' : 'false'}</div>
              <div>Secret Word: {gameState.secretWord}</div>
            </div>
          )} */}

          {/* Game Grid */}
          <div className="space-y-1 md:space-y-1 mb-4 md:mb-8">
            {/* Active Input Row - Show when playing, won, or lost */}
            {(gameState.gameStatus === 'not_started' || gameState.gameStatus === 'playing' || gameState.gameStatus === 'won' || gameState.gameStatus === 'lost') && (
              <GuessInputRow
                ref={inputRowRef as any}
                key={`input-${gameState.gameStatus}-${gameState.attemptIndex}`}
                wordLength={gameState.wordLength}
                locked={(() => {
                  // If letter locking is disabled and we've made at least one guess, 
                  // force ALL positions to be unlocked (not locked)
                  if (!settings.lockGreenMatchedLetters && gameState.attemptIndex > 0) {
                    return Array.from({ length: gameState.wordLength }, () => false);
                  }
                  
                  // Otherwise, use normal locked logic
                  const lockedArray = Array.from({ length: gameState.wordLength }, (_, i) => {
                    
                    // If game is won or lost, don't lock anything
                    if (gameState.gameStatus === 'won' || gameState.gameStatus === 'lost') {
                      return false;
                    }
                    
                    // Handle locking logic for both not_started and playing states
                    if (gameState.gameStatus === 'playing' || gameState.gameStatus === 'not_started') {
                      // lockedLetters now have numeric keys, so direct access works
                      const isLocked = !!gameState.lockedLetters[i];
                      
                      // For revealed letters: always lock them to prevent focus
                      if (isPositionRevealed(i)) {
                        return true; // Always lock revealed letters
                      }
                      
                      // For hard mode: lock correct letters from previous guesses
                      if (isLocked) {
                        return true; // Lock hard mode letters
                      }
                      
                      return false;
                    }
                    
                    // Default: don't lock anything
                    return false;
                  });
                  return lockedArray;
                })()}
                initialCells={Array.from({ length: gameState.wordLength }, (_, i) => {
                  // If game is won, show the solution in input row for end-of-game reveal
                  if (gameState.gameStatus === 'won') {
                    return gameState.secretWord[i];
                  }
                  
                  // If game is lost, show the solution in input row for end-of-game reveal
                  if (gameState.gameStatus === 'lost') {
                    return gameState.secretWord[i];
                  }
                  
                  // Only show content when game is actively being played
                  if (gameState.gameStatus === 'playing' || gameState.gameStatus === 'not_started') {
                    // Priority 1: Show locked letters (correct guesses when playing)
                    if (gameState.lockedLetters[i]) {
                      return gameState.lockedLetters[i];
                    }
                    
                    // Priority 2: Show revealed letters (always visible initially, keep content after submission when letter locking disabled)
                    if (isPositionRevealed(i)) {
                      // If letter locking is disabled AND we've made at least one guess, keep the letter content but styling will be removed
                      if (!settings.lockGreenMatchedLetters && gameState.attemptIndex > 0) {
                        return gameState.secretWord[i]; // Keep the letter content
                      }
                      return gameState.secretWord[i];
                    }
                    
                    // Priority 3: Show current guess
                    return currentGuess[i] || '';
                  }
                  
                  // Default: show nothing
                  return '';
                })}
                onChange={handleGuessChange}
                isShaking={isShaking}
                forceClear={forceClear}
                fadeOutClear={fadeOutClearInput}
                onFadeOutComplete={handleFadeOutComplete}
                revealedLetters={(() => {
                  // If letter locking is disabled and we've made at least one guess, 
                  // completely remove revealed letters from being treated as revealed
                  if (!settings.lockGreenMatchedLetters && gameState.attemptIndex > 0) {
                    return new Set<number>(); // Empty set = no revealed letters
                  }
                  return gameState.revealedLetters;
                })()}
                wasRevealedPositions={(() => {
                  // Pass information about which positions were previously revealed
                  // so GuessInputRow can handle focus advancement correctly
                  if (!settings.lockGreenMatchedLetters && gameState.attemptIndex > 0) {
                    return gameState.revealedLetters; // Return the original revealed positions
                  }
                  return new Set<number>(); // Empty set if not applicable
                })()}
                                 readOnly={(() => {
                  // If letter locking is disabled and we've made at least one guess, 
                  // force ALL inputs to be editable (not read-only)
                  if (!settings.lockGreenMatchedLetters && gameState.attemptIndex > 0) {
                    return false; // Force all inputs to be editable
                  }
                  // Otherwise, use normal readOnly logic
                  const normalReadOnly = gameState.gameStatus !== 'playing' && gameState.gameStatus !== 'not_started';
                  return normalReadOnly;
                })()}
                showFadeIn={showFadeInForInput}
                gameStatus={gameState.gameStatus}
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
                onClick={clearAllVersewordData}
                className="px-4 py-2 bg-red-700 text-white rounded-lg text-sm hover:bg-red-800 transition-colors"
                title="Clear ALL Verseword data including stats, settings, and puzzle state"
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
          {(gameState.gameStatus === 'not_started' || gameState.gameStatus === 'playing' || gameState.gameStatus === 'won' || gameState.gameStatus === 'lost') && (
            <div className="mt-4 md:mt-8">
              <Keyboard
                onKeyPress={(gameState.gameStatus === 'playing' || gameState.gameStatus === 'not_started') ? handleKeyboardKeyPress : () => {}}
                onEnter={(gameState.gameStatus === 'playing' || gameState.gameStatus === 'not_started') ? handleSubmit : () => {}}
                onBackspace={(gameState.gameStatus === 'playing' || gameState.gameStatus === 'not_started') ? handleKeyboardBackspace : () => {}}
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


      

      {/* Settings modal now handled by Layout component */}

      {/* Toasts */}
      {toasts.map((toast) => (
        <ToastComponent key={toast.id} toast={toast} onDismiss={dismissToast} />
      ))}
    </div>
  );
}