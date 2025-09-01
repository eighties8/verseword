# Game Data Files

This directory contains the JSON data files for the Verseword game.

## Required Files

### For all word lengths (5, 6, 7):
- `puzzles-2025.json` - Object of daily puzzles: `{ "2025-01-01": { "word": "MOUTH", "len": 5 } }`
- `clues-2025.json` - Object mapping words to clues: `{ "MOUTH": "sassy lip cave", "MOUNTAIN": "tall rocky peak" }`
- `dictionary5.json`, `dictionary6.json`, `dictionary7.json` - Arrays of allowed guess words: `["HELLO", "WORLD", ...]`

## File Format Examples

### puzzles-2025.json
```json
{
  "2025-01-01": { "word": "MOUTH", "len": 5 },
  "2025-01-02": { "word": "BRAIN", "len": 5 },
  "2025-01-03": { "word": "SPACE", "len": 5 }
}
```

### clues-2025.json
```json
{
  "MOUTH": "sassy lip cave",
  "BRAIN": "thinking organ",
  "SPACE": "cosmic void",
  "MOUNTAIN": "tall rocky peak"
}
```

### dictionary5.json
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
