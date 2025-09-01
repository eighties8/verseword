import React, { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Eye } from 'lucide-react';

interface SplashScreenProps {
  onStartGame: () => void;
  onOpenSettings: () => void;
}

// Set your first puzzle date here (UTC): Aug 25, 2025
const START_UTC = Date.UTC(2025, 7, 25); // months are 0-based (7 = August)

function getTodayPuzzleNumber(): number {
  const now = new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.floor((todayUTC - START_UTC) / 86_400_000);
  return days + 1; // #1 on start day
}

export default function SplashScreen({ onStartGame, onOpenSettings }: SplashScreenProps) {
  const router = useRouter();
  const puzzleNumber = useMemo(getTodayPuzzleNumber, []);

  return (
    // removed min-h-screen to avoid stacking overflow with layout header/footer
    <div className="splashscreen flex flex-col items-center justify-center p-6">
      <div className="text-center max-w-md mx-auto">
        
        {/* Logo */}
        <div className="mb-6">         
          <div className="p-0 w-28 h-28 rounded-2xl mx-auto mb-6 flex items-center justify-center">
            
            {/* <svg viewBox="0 0 256 256">
              <rect x="16" y="16" width="224" height="224" rx="40" fill="#16a34a"/>
              <path d="M32 128c36-54 88-82 96-82s60 28 96 82c-36 54-88 82-96 82s-60-28-96-82Z" fill="#F8FAFC"/>
              <circle cx="128" cy="128" r="36" fill="#16a34a"/>
              <circle cx="128" cy="128" r="14" fill="#0B4D2A"/>
            </svg> */}

            <img src="/logo-cross.webp" alt="Verseword" />

          </div>


        </div>

        <h1 className="text-5xl mb-4">Verseword</h1>

        <h2 className="text-lg mb-8">
          Get 6 chances to guess a 5-7 letter word from the Bible.
        </h2>

        {/* Action */}
        <div className="space-y-2">
          {/* inline, green button */}
          <button
            onClick={onStartGame}
            className="inline-flex items-center justify-center px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-500 transition-colors"
          >
            PLAY
          </button>

          {/* Puzzle number */}
          <div className="text-sm title">Puzzle #{puzzleNumber}</div>
        </div>

        {/* Links */}
        <div className="mt-10 space-y-2">
          <div className="flex justify-center space-x-4">
            <button onClick={() => router.push('/how-to-play')} className="hover:text-gray-700 transition-colors title">
              How to Play
            </button>
            <button onClick={() => router.push('/stats')} className="hover:text-gray-700 transition-colors title">
              Statistics
            </button>
            <button onClick={() => router.push('/archive')} className="hover:text-gray-700 transition-colors title">
              Archive
            </button>
          </div>
        </div>

        {/* <div className="mt-12 text-xs text-gray-400">
          <div className="mb-1">Verseword – A word guessing game with clues</div>
          <div>Challenge your vocabulary and deduction skills</div>
        </div> */}
      </div>
    </div>
  );
}