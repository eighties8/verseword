# Game Data Files

This directory contains the JSON data files for the Verseword game.

## Required Files

### For 5-letter mode:
- `puzzles5-2025.json` - Array of daily puzzles: `[{ "date": "2025-01-01", "word": "MOUTH" }]`
- `clues5.json` - Object mapping words to clues: `{ "MOUTH": "sassy lip cave" }`
- `dict5.json` - Array of allowed guess words: `["HELLO", "WORLD", ...]`

### For 6-letter mode:
- `puzzles6-2025.json` - Array of daily puzzles: `[{ "date": "2025-01-01", "word": "MOUNTAIN" }]`
- `clues6.json` - Object mapping words to clues: `{ "MOUNTAIN": "tall rocky peak" }`
- `dict6.json` - Array of allowed guess words: `["HELLO", "WORLD", ...]`

## File Format Examples

### puzzles5-2025.json
```json
[
  { "date": "2025-01-01", "word": "MOUTH" },
  { "date": "2025-01-02", "word": "BRAIN" },
  { "date": "2025-01-03", "word": "SPACE" }
]
```

### clues5.json
```json
{
  "MOUTH": "sassy lip cave",
  "BRAIN": "thinking organ",
  "SPACE": "cosmic void"
}
```

### dict5.json
```json
[
  "HELLO",
  "WORLD",
  "MOUTH",
  "BRAIN",
  "SPACE"
]
```

The game will automatically load the appropriate files based on the `WORD_LENGTH` setting in `lib/config.ts`.
