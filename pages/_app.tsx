import type { AppProps } from "next/app";
import "@/styles/globals.css";
import Layout from "@/components/Layout";
import { useState, useEffect } from "react";

// Optional per-page layout control: a page component may export `narrow = true` or `title`.
type NextPageWithLayout = AppProps["Component"] & {
  title?: string;
  narrow?: boolean;
};

// Default settings that match the Game component's defaults
const DEFAULT_SETTINGS = {
  maxGuesses: 6,
  revealClue: false,
  randomPuzzle: false,
  lockGreenMatchedLetters: false,
};

export default function MyApp({ Component, pageProps }: AppProps) {
  const C = Component as NextPageWithLayout;
  
  // State for settings and debug mode that will be shared across components
  const [settings, setSettings] = useState<any>(DEFAULT_SETTINGS);
  const [debugMode, setDebugMode] = useState(false);

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
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }, []);

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

  return (
    <Layout 
      title={C.title} 
      narrow={C.narrow}
      onSettingsChange={handleSettingsChange}
      currentSettings={settings}
      debugMode={debugMode}
      onOpenSettings={handleOpenSettings}
    >
      <C {...pageProps} />
    </Layout>
  );
}
