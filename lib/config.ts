export const GAME_CONFIG = {
  WORD_LENGTH: 7 as 7 | 6 | 5,              // switch between 5, 6, or 7
  MAX_GUESSES: 6,
  REVEAL_VOWELS: false,                // show vowel positions up-front
  REVEAL_VOWEL_COUNT: 0,                // number of vowels to reveal (0..N)
  HIDE_CLUE: false,                      // hide clue ribbon (default disabled - clues shown)
  RANDOM_PUZZLE: false,                 // random puzzle on each page load
  LOCK_GREEN_MATCHED_LETTERS: false,     // lock exact matched letters in input row
  DAILY_PUZZLE_TIMEZONE: 'America/New_York', // date rollover
  LETTER_REVEALS: {
    5: 1,                               // 1 reveals for 5-letter puzzles
    6: 2,                               // 2 reveals for 6-letter puzzles  
    7: 3,                               // 3 reveals for 7-letter puzzles
  },
};

// Animation timing constants
export const ANIMATION_CONFIG = {
  TILE_FLIP_DELAY: 600,        // ms between each tile starting its flip
  TILE_FLIP_DURATION: 800,     // ms for each tile's flip animation to complete
  COLOR_CHANGE_PERCENT: 0.55,  // when during the flip to change colors (55%)
  FLIP_BACKFACE_COLOR: '#d1d5db', //'#d1d5db', //'#374151', // color shown during tile flip (backface)
};

// Want faster flips? Reduce TILE_FLIP_DELAY from 600ms to 400ms  
// Want slower color changes? Increase COLOR_CHANGE_PERCENT from 0.55 to 0.7
// Want longer flip animations? Increase TILE_FLIP_DURATION from 800ms to 1000ms
