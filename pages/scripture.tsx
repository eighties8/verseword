import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { ArrowLeft, Share2, Check, X } from 'lucide-react';
import { loadStats, StatsSnapshot, GameResult } from '../lib/stats';
import { loadAll } from '../lib/storage';
import { evaluateGuess } from '../lib/gameLogic';

interface WordDefinition {
  partOfSpeech: string;
  definitions: string[];
  examples: string[];
}

interface ScripturePageProps {
  word?: string;
  definitions?: WordDefinition[];
}

export default function ScripturePage({ word, definitions }: ScripturePageProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wordData, setWordData] = useState<{ word: string; definitions: WordDefinition[] } | null>(null);
  const [stats, setStats] = useState<StatsSnapshot | null>(null);
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    // If no word provided via props, get it from query params
    if (!word && router.query.word) {
      const queryWord = router.query.word as string;
      fetchWordDefinitions(queryWord);
    } else if (word && definitions) {
      setWordData({ word, definitions });
    }
    
    // Load stats for recent results
    setStats(loadStats());
  }, [router.query.word, word, definitions]);

  const fetchWordDefinitions = async (searchWord: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/word-definitions?word=${encodeURIComponent(searchWord)}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          setError('Word not found in scripture definitions.');
        } else {
          setError('Failed to load word definitions.');
        }
        return;
      }
      
      const data = await response.json();
      setWordData(data);
    } catch (err) {
      setError('Failed to load word definitions.');
      console.error('Error fetching word definitions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackClick = () => {
    router.back();
  };

  // Calculate puzzle number based on days since start date
  const getPuzzleNumber = (dateISO: string): number => {
    const startDate = new Date('2025-08-25'); // Puzzle start date
    const puzzleDate = new Date(dateISO);
    const diffTime = puzzleDate.getTime() - startDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays + 1; // Start from puzzle #1
  };

  // Get puzzle number from localStorage for the actual solved puzzle
  const getCurrentPuzzleNumber = () => {
    if (!wordData?.word) return null;
    
    try {
      const puzzles = localStorage.getItem('verseword:puzzles:v2');
      if (puzzles) {
        const puzzlesData = JSON.parse(puzzles);
        const puzzleIds = Object.keys(puzzlesData);
        
        // Find the puzzle that contains this word
        for (const puzzleId of puzzleIds) {
          const puzzle = puzzlesData[puzzleId];
          if (puzzle.secretWord === wordData.word) {
            return getPuzzleNumber(puzzleId.split(':')[0]);
          }
        }
      }
      return null;
    } catch (error) {
      console.error('Error getting puzzle number:', error);
      return null;
    }
  };

  // Check if the current puzzle was won (for showing share button)
  const isCurrentPuzzleWon = () => {
    if (!wordData?.word || !stats?.results) return false;
    
    const currentPuzzleNumber = getCurrentPuzzleNumber();
    if (!currentPuzzleNumber) return false;
    
    // Find the most recent result for this puzzle
    const currentResult = stats.results.find(result => 
      getPuzzleNumber(result.dateISO) === currentPuzzleNumber && 
      result.solution === wordData.word
    );
    
    return currentResult?.won || false;
  };

  // Generate and share emoji grid using actual evaluation logic
  const generateAndShareEmojiGrid = () => {
    if (!wordData?.word) return;

    try {
      const allPuzzles = loadAll();

      // Find the most recent completed puzzle for this word
      let latest: any = null;
      for (const state of Object.values(allPuzzles)) {
        if (state && state.secretWord === wordData.word && (state.gameStatus === 'won' || state.gameStatus === 'lost')) {
          if (!latest || state.dateISO > latest.dateISO) {
            latest = state;
          }
        }
      }

      if (!latest || latest.gameStatus !== 'won') return; // share only for wins

      const puzzleNumber = getPuzzleNumber(latest.dateISO);
      const guessesUsed = (typeof latest.attemptIndex === 'number' ? latest.attemptIndex + 1 : latest.attempts.length);

      let emojiGrid = `Verseword #${puzzleNumber} ${guessesUsed}/6\nhttps://verseword.com\n`;

      const mapping: Record<string, string> = {
        correct: '🟩',
        present: '🟨',
        absent: '⬛',
      };

      latest.attempts.forEach((attempt: string, attemptIndex: number) => {
        const states = evaluateGuess(attempt, latest.secretWord);
        const row = states.map(s => mapping[s]).join('');
        if (attemptIndex < latest.attempts.length - 1) {
          emojiGrid += row + '\n';
        } else {
          emojiGrid += row;
        }
      });

      navigator.clipboard.writeText(emojiGrid).then(() => {
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
      }).catch(() => {
        const textArea = document.createElement('textarea');
        textArea.value = emojiGrid;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
      });
    } catch (error) {
      console.error('Error generating share grid:', error);
    }
  };

  // Deprecated placeholder retained for reference (no longer used)
  const generatePlaceholderGrid = (guesses: number, wordLength: number) => {
    let grid = '';
    for (let i = 0; i < guesses; i++) {
      let row = '';
      for (let j = 0; j < wordLength; j++) {
        row += i === guesses - 1 ? '🟩' : '⬛';
      }
      grid += i < guesses - 1 ? row + '\n' : row;
    }
    return grid;
  };

  // Format definition text with paragraph breaks for long definitions
  const formatDefinition = (text: string) => {
    // Count sentences by looking for periods followed by space and capital letter
    const sentences = text.split(/(?<=\.)\s+(?=[A-Z])/);
    
    // If 8 or more sentences, add paragraph breaks every 5 sentences
    if (sentences.length >= 8) {
      const paragraphs = [];
      for (let i = 0; i < sentences.length; i += 5) {
        const paragraphSentences = sentences.slice(i, i + 5);
        paragraphs.push(paragraphSentences.join(' '));
      }
      return paragraphs;
    }
    
    // Return as single paragraph for shorter definitions
    return [text];
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-lg text-gray-600">Loading scripture...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <h1 className="text-2xl mb-2">Scripture Not Found</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={handleBackClick}
            className="flex items-center gap-2 pr-2 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors mx-auto"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!wordData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-gray-600">No word specified</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Toast notification */}
      {showToast && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-lg z-50">
          Results copied to clipboard!
        </div>
      )}

      {/* Header */}
      <div className="border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="grid items-center grid-cols-[auto,1fr,auto] gap-2 relative">
            {/* Left: Back */}
            <div className="justify-self-start">
              <button
                aria-label="Back"
                onClick={handleBackClick}
                className="flex items-center gap-2 pr-2 py-2 text-gray-500 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="hidden sm:inline">Back</span>
              </button>
            </div>

            {/* Center: Recent Results */}
            <div className="" />

            {/* Right: Share */}
            <div className="justify-self-end">
              {isCurrentPuzzleWon() && (
                <button
                  onClick={generateAndShareEmojiGrid}
                  className="flex items-center gap-2 px-3 py-1 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors"
                >
                  <Share2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Share</span>
                </button>
              )}
            </div>

            {/* Absolute centered results spanning between back and share */}
            {stats?.results && stats.results.length > 0 && (
              <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 w-full px-12 sm:px-16 text-center">
                <div className="inline-flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm md:text-base lg:text-lg text-gray-600">
                  {stats.results.slice(-1).map((result, index) => (
                    <React.Fragment key={index}>
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center mr-2 shrink-0 ${
                        result.won ? 'bg-green-600' : 'bg-red-500'
                      }`}>
                        {result.won ? (
                          <Check className="w-3 h-3 text-white" />
                        ) : (
                          <X className="w-3 h-3 text-white" />
                        )}
                      </div>
                      <span className="whitespace-normal sm:whitespace-normal md:whitespace-nowrap">
                        <span className="hidden sm:inline">Verseword </span>#{getPuzzleNumber(result.dateISO)} • {result.solution || 'Unknown'} • {result.won ? 'Won:' : 'Lost:'} {result.won ? `${result.guesses}/6` : 'X/6'}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <hr className="border-gray-400" />
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Word Header */}
        <div className="my-4 mb-8">
          <h2 className="text-4xl mb-3 flex items-center">
            {wordData.word} 
            {getCurrentPuzzleNumber() && (
              <span className="text-2xl text-gray-500 font-normal ml-3">
                : <span className="hidden sm:inline">Verseword </span>#{getCurrentPuzzleNumber()}
              </span>
            )}
          </h2>
        </div>

        {/* Definitions */}
        <div className="mb-8">
          {/* <h3 className="text-xl font-semibold text-gray-900 mb-6">
            Definitions
          </h3> */}
          <div className="space-y-8">
            {wordData.definitions.map((definition, index) => (
              <div key={index}>
                {definition.partOfSpeech && (
                  <h4 className="text-lg font-medium text-gray-800 mb-3">
                    {definition.partOfSpeech}
                  </h4>
                )}
                <div className="space-y-4">
                  {definition.definitions.map((def, defIndex) => {
                    // Format the definition with paragraph breaks if needed
                    const formattedParagraphs = formatDefinition(def);
                    
                    return formattedParagraphs.map((paragraph, paragraphIndex) => {
                      // Replace the word with bold version in the paragraph text
                      const boldParagraph = paragraph.replace(
                        new RegExp(`\\b${wordData.word}\\b`, 'gi'),
                        `<strong>${wordData.word}</strong>`
                      );
                      
                      return (
                        <p 
                          key={`${defIndex}-${paragraphIndex}`}
                          className="text-gray-700 leading-relaxed text-base"
                          dangerouslySetInnerHTML={{ __html: boldParagraph }}
                        />
                      );
                    });
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Verse References */}
        <div>
          <h3 className="text-xl font-semibold text-gray-900 mb-6">
            Verse References
          </h3>
          <div className="space-y-6">
            {wordData.definitions.map((definition, index) => (
              definition.examples && definition.examples.length > 0 && (
                <div key={index}>
                  {definition.partOfSpeech && (
                    <h4 className="text-lg font-medium text-gray-800 mb-3">
                      {definition.partOfSpeech}
                    </h4>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {definition.examples.map((verse, verseIndex) => {
                      // Create Bible Gateway URL for the verse
                      const bibleGatewayUrl = `https://www.biblegateway.com/passage/?search=${encodeURIComponent(verse)}&version=NIV`;
                      
                      return (
                        <a
                          key={verseIndex}
                          href={bibleGatewayUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block px-4 py-3 text-gray-700 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-100 hover:border-gray-300 hover:text-gray-900 transition-all duration-200 cursor-pointer"
                          title={`View ${verse} on Bible Gateway`}
                        >
                          {verse}
                        </a>
                      );
                    })}
                  </div>
                </div>
              )
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

ScripturePage.title = "Scripture";
ScripturePage.narrow = false;
