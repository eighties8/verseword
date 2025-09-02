import React, { useState, useEffect, useRef } from 'react';

interface SettingsConfig {
  maxGuesses: number;
  hideClue: boolean;
  randomPuzzle: boolean;
  lockGreenMatchedLetters: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChange: (settings: SettingsConfig) => void;
  currentSettings: SettingsConfig;
  debugMode: boolean;
  openedFromClue?: boolean;
  puzzleInProgress?: boolean;
}

export default function Settings({ isOpen, onClose, onSettingsChange, currentSettings, debugMode, openedFromClue = false, puzzleInProgress = false }: Props) {
  const [settings, setSettings] = useState<SettingsConfig>({
    ...currentSettings,
    randomPuzzle: currentSettings.randomPuzzle ?? false,
    // Auto-disable Hide Clue if opened from clue link
    hideClue: openedFromClue ? false : currentSettings.hideClue,
    lockGreenMatchedLetters: currentSettings.lockGreenMatchedLetters ?? true,
  });
  
  // Track if this is the initial render to prevent auto-saving on open
  const isInitialRender = React.useRef(true);
  
  // Ref for the modal content to detect clicks outside
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && currentSettings) {
      // Ensure all required properties exist with defaults
      const settingsWithDefaults: SettingsConfig = {
        maxGuesses: currentSettings.maxGuesses,
        hideClue: openedFromClue ? false : currentSettings.hideClue,
        randomPuzzle: currentSettings.randomPuzzle ?? false,
        lockGreenMatchedLetters: currentSettings.lockGreenMatchedLetters ?? true,
      };
      
      setSettings(settingsWithDefaults);
    }
  }, [isOpen, currentSettings, openedFromClue]);

  // Track previous settings to detect actual user changes
  const prevSettingsRef = React.useRef<SettingsConfig | null>(null);
  
  // Auto-save settings when user makes changes (but not on parent updates)
  useEffect(() => {
    if (isOpen && !isInitialRender.current && prevSettingsRef.current) {
      // Only save if the user actually changed something (not just parent update)
      const hasUserChange = JSON.stringify(settings) !== JSON.stringify(prevSettingsRef.current);
      if (hasUserChange) {
        // Save to localStorage
        localStorage.setItem('verseword-settings', JSON.stringify(settings));
        onSettingsChange(settings);
      }
    }
    // Update the ref to track current settings
    prevSettingsRef.current = settings;
  }, [settings, isOpen, onSettingsChange]);
  
  // Mark that we're no longer in initial render after the first effect run
  useEffect(() => {
    if (isOpen) {
      isInitialRender.current = false;
    }
  }, [isOpen]);

  // Handle clicks outside the modal to close it
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  const handleReset = () => {
    setSettings(currentSettings);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={handleBackdropClick}>
      <div ref={modalRef} className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Settings Content */}
        <div className="p-6 space-y-6">
          {/* Puzzle In Progress Note */}
          {puzzleInProgress && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800">
                    Puzzle in Progress
                  </h3>
                  <div className="mt-2 text-sm text-yellow-700">
                    <p>Settings are disabled while you have an active puzzle. Complete or reset the current puzzle to modify settings.</p>
                  </div>
                </div>
              </div>
            </div>
          )}



          {/* Max Guesses */}
          {/* <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Max Guesses
            </label>
            <input
              type="number"
              min="1"
              max="8"
              value={settings.maxGuesses}
              onChange={(e) => setSettings(prev => ({ ...prev, maxGuesses: Number(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div> */}



          {/* Reveal Clue Toggle */}
          <div className={`flex items-center justify-between ${openedFromClue ? 'rounded bg-green-600 p-4 text-white' : ''}`}>
            <div>
              <label className={`block text-sm font-medium mb-1 ${puzzleInProgress ? 'text-gray-400' : ''}`}>
                Disable Clues (Current: {settings.hideClue ? 'ON' : 'OFF'})
              </label>
              <p className={`text-xs ${puzzleInProgress ? 'text-gray-400' : 'opacity-90'}`}>
                {settings.hideClue ? 'Hide clues for a harder challenge' : 'Display a hint for each puzzle'}
              </p>
            </div>
            <button
              onClick={() => setSettings(prev => ({ ...prev, hideClue: !prev.hideClue }))}
              disabled={puzzleInProgress}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.hideClue ? 'bg-green-600' : 'bg-gray-200'
              } ${puzzleInProgress ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.hideClue ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Random Puzzle Toggle */}
          {/* <div className="flex items-center justify-between">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Random Puzzle
              </label>
              <p className="text-xs text-gray-500">New puzzle on each page load</p>
            </div>
            <button
              onClick={() => setSettings(prev => ({ ...prev, randomPuzzle: !prev.randomPuzzle }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.randomPuzzle ? 'bg-green-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.randomPuzzle ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div> */}

          {/* Enable Hard Mode Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <label className={`block text-sm font-medium mb-1 ${puzzleInProgress ? 'text-gray-400' : 'text-gray-700'}`}>
                Enable Hard Mode (Current: {settings.lockGreenMatchedLetters ? 'ON' : 'OFF'})
              </label>
              <p className={`text-xs ${puzzleInProgress ? 'text-gray-400' : 'text-gray-500'}`}>Green letter matches get locked and must be used for each guess</p>
            </div>
            <button
              onClick={() => setSettings(prev => ({ ...prev, lockGreenMatchedLetters: !prev.lockGreenMatchedLetters }))}
              disabled={puzzleInProgress}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.lockGreenMatchedLetters ? 'bg-green-600' : 'bg-gray-200'
              } ${puzzleInProgress ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.lockGreenMatchedLetters ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200">
          {/* <button
            onClick={handleReset}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
          >
            Reset
          </button> */}
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
