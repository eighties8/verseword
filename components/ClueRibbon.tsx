import { AArrowDown, BadgeInfo, HeartCrack, LifeBuoy, Medal } from "lucide-react";

interface Props {
  clue: string;
  targetWord?: string;
  onRevealLetter?: () => void;
  letterRevealsRemaining?: number;
  letterRevealsAllowed?: boolean;
  onSettingsClick?: () => void;
  variant?: 'clue' | 'error' | 'success' | 'solution';
  guessesText?: string;
  revealClueEnabled?: boolean;
  wordLength?: 5 | 6 | 7;
}

export default function ClueRibbon({ clue, targetWord, onRevealLetter, letterRevealsRemaining, letterRevealsAllowed = true, onSettingsClick, variant = 'clue', guessesText, revealClueEnabled, wordLength }: Props) {
  
  // Helper function to generate tooltip message based on word length and remaining reveals
  const getTooltipMessage = () => {
    if (!letterRevealsAllowed) {
      return "Letter reveals are only available on the first guess!";
    }
    
    if (!letterRevealsRemaining || letterRevealsRemaining <= 0) {
      return "You're all out of letter turns, solve that puzzle!";
    }
    
    // Determine max reveals based on word length
    const maxReveals = wordLength === 5 ? 1 : wordLength === 6 ? 2 : 3;
    
    if (letterRevealsRemaining === maxReveals) {
      // First time use
      if (wordLength === 5) {
        return "Buy a vowel (1st guess only)";
      } else if (wordLength === 6) {
        return "Need help? I can turn up to 2 letters for you";
      } else {
        return "Need help? I can turn up to 3 letters for you";
      }
    } else {
      // Subsequent uses
      if (wordLength === 5) {
        return "You're all out of letter turns, solve that puzzle!";
      } else if (wordLength === 6) {
        if (letterRevealsRemaining === 1) {
          return "Need another? You have 1 left";
        } else {
          return "Need help? I can turn up to 2 letters for you";
        }
      } else {
        // 7 letter puzzles
        if (letterRevealsRemaining === 2) {
          return "Need another? You have 2 left";
        } else if (letterRevealsRemaining === 1) {
          return "Need another? You have 1 left";
        } else {
          return "Need help? I can turn up to 3 letters for you";
        }
      }
    }
  };

  return (
    <div className="flex items-center justify-center mb-6">
      {/* Information/Clue Icon */}
      {/* <div className="w-8 h-8 mr-1 bg-gray-100 rounded-full flex items-center justify-center">
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-gray-500">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
        </svg>
      </div>
       */}
       <LifeBuoy className="w-6 h-6 mr-1 text-gray-400 mr-2" />
      {/* Speech Bubble - Use passed variant for background */}
      <div className={`clue-ribbon !min-h-[30px] flex items-center shadow-md rounded-lg pl-3 transition-all duration-500 ease-in-out relative ${
          variant === 'error' ? 'bg-gray-800 !text-gray-200' : variant === 'success' ? 'bg-green-600 text-white' : 'bg-gray-300 text-gray-500'
        } text-gray-900 `}>
        <div className="text-sm flex items-center justify-between gap-2 pr-3">
          <span className="transition-all duration-500 ease-in-out flex items-center gap-2 pl-1">
            {/* Special cases: show win/loss messages directly */}
            {clue && (clue.startsWith('Solved! Verseword #') || clue.startsWith('Loss:')) ? (
              <>
                {clue.startsWith('Solved! Verseword #') && <Medal className="w-5 h-5 text-white animate-pulse" />}
                {clue.startsWith('Loss:') && <HeartCrack className="w-4 h-4 text-white" />}
                <span className={`transition-all duration-500 ease-in-out whitespace-nowrap ${
                  clue.startsWith('Solved! Verseword #') ? 'animate-fade-in' : ''
                }`}>{clue}</span>
              </>
            ) : variant === 'error' ? (
              // Show error messages prominently
              <span className="whitespace-nowrap">
                {clue}
              </span>
            ) : (
              // Always show guesses text by default, with hover behavior for regular clues
              <button
                onClick={onSettingsClick}
                type="button"
                className="
                  inline-grid items-center gap-1 cursor-pointer group
                  grid-cols-[auto,0fr]
                  transition-[grid-template-columns] duration-300 ease-out
                  hover:grid-cols-[auto,1fr]
                "
              >
                {/* Left: the default/short text - always show guesses */}
                <span className="whitespace-nowrap">
                  {guessesText || 'Click here for clues, vowels & settings'}
                </span>

                {/* Right: the long/hover text - shows clue if enabled, otherwise guidance */}
                <span className="whitespace-nowrap overflow-hidden">
                  {revealClueEnabled && clue ? clue : ''}
                </span>
              </button>
            )}
            {/* {targetWord && (
              <span className="ml-2 opacity-90 whitespace-nowrap">
                • {targetWord}
              </span>
            )} */}
          </span>
          
          {/* clue-letter reveal button - Only show when letter reveals are allowed */}
          {onRevealLetter && letterRevealsAllowed && (
            <button
              onClick={onRevealLetter}
              className={`clue-letter shadow-[inset_4px_0_6px_-2px_rgba(0,0,0,0.2)] px-1.5 !-mr-3 rounded-tr-lg rounded-br-lg flex-shrink-0 p-1 transition-colors duration-200 group relative ${
                letterRevealsAllowed && letterRevealsRemaining && letterRevealsRemaining > 0
                  ? 'bg-green-600 hover:text-white'
                  : 'bg-gray-200 cursor-not-allowed'
              }`}
              title={getTooltipMessage()}
              disabled={!letterRevealsAllowed || !letterRevealsRemaining || letterRevealsRemaining <= 0}
            >
              {(() => {
                if (!letterRevealsAllowed) {
                  return <AArrowDown className="w-5 h-5 text-gray-500" />;
                }
                if (letterRevealsRemaining && letterRevealsRemaining > 0) {
                  return <AArrowDown className="w-5 h-5" />;
                }
                return <AArrowDown className="w-5 h-5 text-gray-800 opacity-50" />;
              })()}

              {/* Tooltip */}
              <div className="absolute bottom-full right-0 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap pointer-events-none z-50">
                {getTooltipMessage()}
                <div className="absolute top-full right-2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-300"></div>
              </div>
            </button>
          )}
        </div>
        
        {/* Speech bubble tail - Change color based on variant */}
        <div className={`absolute -left-[2px] top-1/2 transform -translate-y-1/2 -translate-x-1 w-0 h-0 border-r-8 border-t-8 border-t-transparent border-b-8 border-b-transparent transition-all duration-500 ease-in-out ${
          variant === 'error' ? '!border-r-gray-800' : variant === 'success' ? '!border-r-green-500' : '!border-r-gray-300'
        }`} 
        style={{
          borderRightColor: variant === 'error' ? '#ef4444' : variant === 'success' ? '#16a34a' : '#6b7280'
        }}
        ></div>
      </div>
    </div>
  );
}