# Verseword - Crack the daily word with clever clues, vowel vibes, or pure brain dazzle!

A refined Wordle-style game built with Next.js, TypeScript, and Tailwind CSS. With a focus on UX and player friendly features: switchable 5, 6, or 7 letter modes, option for clues, intelligent cursor management, and vowel reveals.

## Features

- **Switchable Word Lengths**: Toggle between 5, 6, or 7 letter modes
- **Smart Input Management**: Only type in the top active row
- **Locked Letters**: Green (correct) letters remain locked and read-only
- **Intelligent Focus**: Always focuses on the first available (unlocked) cell
- **Vowel Reveals**: Optionally reveal vowel positions at game start
- **Daily Puzzles**: Load puzzles by date with fallback support
- **Clue System**: Optional hints for each puzzle
- **Mobile-Friendly**: Responsive design with touch-friendly inputs
- **Toast Notifications**: User feedback for validation and game status

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: React hooks
- **Data**: JSON files (no database required)

## Project Structure

```
verseword/
├── components/          # React components
│   ├── Game.tsx        # Main game orchestrator
│   ├── GuessInputRow.tsx # Smart input row with cursor management
│   ├── RowHistory.tsx  # Past guesses with Wordle coloring
│   ├── ClueRibbon.tsx  # Clue display component
│   └── Toast.tsx       # Notification component
├── lib/                # Game logic and utilities
│   ├── config.ts       # Game configuration
│   ├── types.ts        # TypeScript type definitions
│   ├── daily.ts        # Daily puzzle loader
│   ├── gameLogic.ts    # Game evaluation and utilities
│   ├── clues-2025.json # All clues for 2025
│   ├── clues-2026.json # All clues for 2026
│   └── data/           # Game data files
│       ├── dictionary5.json      # 5-letter dictionary
│       ├── dictionary6.json      # 6-letter dictionary
│       ├── dictionary7.json      # 7-letter dictionary
│       ├── puzzles-2025.json    # All daily puzzles (2025)
│       ├── puzzles-2026.json    # All daily puzzles (2026)
│       ├── puzzles-2027.json    # All daily puzzles (2027)
│       ├── puzzles-2028.json    # All daily puzzles (2028)
│       ├── puzzles-2029.json    # All daily puzzles (2029)
│       └── puzzles-2030.json    # All daily puzzles (2030)
├── scripts/            # Build scripts
│   └── buildData.ts    # Data file generator
├── styles/             # Global styles
│   └── globals.css     # Tailwind imports
└── pages/              # Next.js pages
    ├── _app.tsx        # App wrapper
    └── index.tsx       # Main game page
```

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd verseword
```

2. Install dependencies:
```bash
npm install
```

3. Build the data files:
```bash
npm run build-data
```

4. Start the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Game Configuration

Edit `lib/config.ts` to customize the game:

```typescript
export const GAME_CONFIG = {
  WORD_LENGTH: 5 as 5 | 6 | 7,          // Switch between 5, 6, or 7
  MAX_GUESSES: 6,                        // Maximum attempts allowed
  REVEAL_VOWELS: false,                  // Show vowel positions up-front
  REVEAL_VOWEL_COUNT: 0,                 // Number of vowels to reveal
  REVEAL_CLUE: true,                     // Show clue ribbon
  DAILY_PUZZLE_TIMEZONE: 'America/New_York', // Date rollover timezone
};
```

## How to Use GuessInputRow

The `GuessInputRow` component handles all input logic with intelligent cursor management:

```typescript
import { computeRevealsForWord } from '../lib/gameLogic';

// Example: 6-letter mode with 2 vowels revealed at start
const REVEAL_VOWELS = true;
const REVEAL_VOWEL_COUNT = 2;
const WORD_LENGTH: 5 | 6 = 6;

const revealedMask = computeRevealsForWord(targetWord, {
  revealVowels: REVEAL_VOWELS,
  vowelCount: REVEAL_VOWEL_COUNT,
}); // boolean[] length = WORD_LENGTH (true where locked)

<GuessInputRow
  wordLength={WORD_LENGTH}
  locked={revealedMask}
  initialCells={targetWord
    .toUpperCase()
    .split("")
    .map((ch, i) => (revealedMask[i] ? ch : ""))}
  onChange={(letters) => {
    // letters = user-typed editable values only (locked are returned as "")
    // store current guess state here
  }}
/>
```

### Key Features

- **Locked cells** are truly read-only and automatically skipped
- **Focus management** always lands on the first editable cell
- **Race-free focusing** uses `requestAnimationFrame` for reliable DOM updates
- **Smart navigation** with arrow keys, backspace, and delete
- **Paste support** fills only editable slots, skips locked cells

## Data Files

The game loads data from JSON files in `/lib` and `/lib/data`. You'll need to provide:

### For all word lengths (5, 6, 7):
- `lib/data/puzzles-2025.json` → Object of `{ "2025-01-01": { "word": "MOUTH", "len": 5 } }`
- `lib/clues-2025.json` → Object `{ "MOUTH": "sassy lip cave", "MOUNTAIN": "tall rocky peak", ... }`
- `lib/data/dictionary5.json`, `dictionary6.json`, `dictionary7.json` → Arrays of allowed guess words

## Building Data Files

Use the included script to generate data files:

```bash
npm run build-data
```

This creates sample data files. Replace the sample words in `scripts/buildData.ts` with your actual frequency list or curated word lists.

## Game Rules

- **Standard Wordle scoring**: Green (correct), Yellow (present), Gray (absent)
- **Double-count logic**: Respects letter frequency in the secret word
- **Daily puzzles**: Same word for everyone on a given date
- **Fallback support**: Uses first available puzzle if today's is missing

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript compiler
- `npm run build-data` - Generate data files

### Code Quality

- ESLint configuration for Next.js
- Prettier for code formatting
- TypeScript for type safety
- Tailwind CSS for styling

## Deployment

The app can be deployed to any platform that supports Next.js:

- Vercel (recommended)
- Netlify
- AWS Amplify
- Self-hosted

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the **Business Source License 1.1 (BUSL-1.1)**.

- **Non-Production Use (now until 2028-01-01)**:  
  You may use, modify, and self-host Verseword for **personal, educational, or non-commercial evaluation purposes**.

- **Production Use**:  
  Requires a **commercial license** from the Licensor (Scott Blanchard, eighties8) until the Change Date.

- **Change Date**:  
  On **2028-01-01**, this project will automatically convert to the **Apache License, Version 2.0**, permitting full commercial and production use.

See the [LICENSE](LICENSE) file for details.


## Acknowledgments

- Inspired by Wordle
- Built with modern web technologies
- Focus on accessibility and user experience
# verseword
