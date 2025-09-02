import type { AppProps } from "next/app";
import "@/styles/globals.css";
import Layout from "@/components/Layout";
import { useState, useEffect, useCallback } from "react";

// Optional per-page layout control: a page component may export `narrow = true` or `title`.
type NextPageWithLayout = AppProps["Component"] & {
  title?: string;
  narrow?: boolean;
};

// Default settings that match the Game component's defaults
const DEFAULT_SETTINGS = {
  maxGuesses: 6,
  hideClue: false,
  randomPuzzle: false,
  lockGreenMatchedLetters: false,
};

export default function MyApp({ Component, pageProps }: AppProps) {
  const C = Component as NextPageWithLayout;
  
  // State for settings and debug mode that will be shared across components
  const [settings, setSettings] = useState<any>(DEFAULT_SETTINGS);
  const [debugMode, setDebugMode] = useState(false);
  const [showScriptureLink, setShowScriptureLink] = useState(false);
  const [scriptureWord, setScriptureWord] = useState<string>('');
  const [scripturePuzzleNumber, setScripturePuzzleNumber] = useState<string>('');

  // Function to check for completed games and update scripture link
  const checkForScriptureLink = useCallback(async () => {
    try {
      const puzzles = localStorage.getItem('verseword:puzzles:v2');
      console.log('🔍 Checking for scripture link...');
      console.log('📦 Puzzles data:', puzzles);
      
      if (puzzles) {
        const puzzlesData = JSON.parse(puzzles);
        const puzzleIds = Object.keys(puzzlesData);
        console.log('🎯 All Puzzle IDs:', puzzleIds);
        
        // Find the most recently completed daily puzzle
        let mostRecentCompletedPuzzle = null;
        let mostRecentCompletedId = null;
        
        for (const puzzleId of puzzleIds) {
          const puzzle = puzzlesData[puzzleId];
          const isCompleted = puzzle.gameStatus === 'won' || puzzle.gameStatus === 'lost';
          const isDailyPuzzle = !puzzleId.includes('archive') && !puzzle.randomPuzzle;
          
          if (isCompleted && isDailyPuzzle && puzzle.secretWord) {
            // This is a completed daily puzzle, check if it's more recent
            if (!mostRecentCompletedPuzzle || !mostRecentCompletedId || puzzleId > mostRecentCompletedId) {
              mostRecentCompletedPuzzle = puzzle;
              mostRecentCompletedId = puzzleId;
            }
          }
        }
        
        console.log('🎮 Most recent completed puzzle ID:', mostRecentCompletedId);
        console.log('🎮 Most recent completed puzzle data:', mostRecentCompletedPuzzle);
        
        if (mostRecentCompletedPuzzle && mostRecentCompletedId) {
          console.log('✅ Found completed puzzle:', mostRecentCompletedId);
          console.log('🔤 Secret word:', mostRecentCompletedPuzzle.secretWord);
          
          if (mostRecentCompletedPuzzle.secretWord) {
            // Check if word exists in definitions
            try {
              console.log('🌐 Checking word in definitions:', mostRecentCompletedPuzzle.secretWord);
              const response = await fetch(`/api/word-definitions?word=${encodeURIComponent(mostRecentCompletedPuzzle.secretWord)}`);
              console.log('📡 API response status:', response.status);
              
              if (response.ok) {
                console.log('✅ Word found in definitions, showing scripture link');
                setShowScriptureLink(true);
                setScriptureWord(mostRecentCompletedPuzzle.secretWord);
                
                // Extract puzzle number from puzzle ID (e.g., "2025-09-01:6" -> "9")
                const puzzleNumber = mostRecentCompletedId.split(':')[0].split('-').slice(1).join('');
                setScripturePuzzleNumber(puzzleNumber);
                return;
              } else {
                console.log('❌ Word not found in definitions');
              }
            } catch (error) {
              console.error('Error checking word in definitions:', error);
            }
          }
        }
      }
      
      // Reset if no valid scripture link
      console.log('🔄 Resetting scripture link');
      setShowScriptureLink(false);
      setScriptureWord('');
      setScripturePuzzleNumber('');
    } catch (error) {
      console.error('Error checking for scripture link:', error);
      setShowScriptureLink(false);
      setScriptureWord('');
      setScripturePuzzleNumber('');
    }
  }, []);

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem('verseword-settings');
      if (savedSettings) {
        setSettings(JSON.parse(savedSettings));
      }
      
      // Also check for debug mode
      const savedDebugMode = localStorage.getItem('verseword-debug-mode');
      if (savedDebugMode) {
        setDebugMode(JSON.parse(savedDebugMode));
      }
      
      // Check for scripture link
      checkForScriptureLink();
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }, [checkForScriptureLink]);

  const handleSettingsChange = (newSettings: any) => {
    setSettings(newSettings);
    // Save to localStorage
    try {
      localStorage.setItem('verseword-settings', JSON.stringify(newSettings));
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  };

  // Handle opening settings from children components (like Game component)
  const handleOpenSettings = (openedFromClue: boolean = false, puzzleInProgress: boolean = false) => {
    // This callback can be used to track or handle settings being opened from specific sources
  };

  // Function to refresh scripture link (can be called by child components)
  const refreshScriptureLink = useCallback(() => {
    checkForScriptureLink();
  }, [checkForScriptureLink]);

  // Make refreshScriptureLink available globally for debugging
  useEffect(() => {
    (window as any).refreshScriptureLink = refreshScriptureLink;
    return () => {
      delete (window as any).refreshScriptureLink;
    };
  }, [refreshScriptureLink]);

  return (
    <Layout 
      title={C.title} 
      narrow={C.narrow}
      onSettingsChange={handleSettingsChange}
      currentSettings={settings}
      debugMode={debugMode}
      onOpenSettings={handleOpenSettings}
      showScriptureLink={showScriptureLink}
      scriptureWord={scriptureWord}
      scripturePuzzleNumber={scripturePuzzleNumber}
    >
      <C {...pageProps} refreshScriptureLink={refreshScriptureLink} />
    </Layout>
  );
}
