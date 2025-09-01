#!/usr/bin/env ts-node

/**
 * Script to build game data files from frequency lists
 * 
 * Usage:
 * npm run build-data
 * 
 * This script will:
 * 1. Filter words by length and ASCII letters
 * 2. Generate dictionary5.json and dictionary6.json in lib/data
 * 3. Build dated puzzles{len}-2025.json in lib/data
 * 4. Generate clues-{year}.json files in lib/data
 */

import * as fs from 'fs';
import * as path from 'path';

interface WordFrequency {
  word: string;
  frequency: number;
}

interface PuzzleData {
  date: string;
  word: string;
}

interface CluesData {
  [word: string]: string;
}

function generateDatesForYear(year: number): string[] {
  const dates: string[] = [];
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31);
  
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split('T')[0]);
  }
  
  return dates;
}

function filterWord(word: string, length: number): boolean {
  return word.length === length && /^[A-Za-z]+$/.test(word);
}

function buildDictionary(words: string[], length: number): string[] {
  return words
    .filter(word => filterWord(word, length))
    .map(word => word.toUpperCase())
    .sort();
}

function buildPuzzles(words: string[], year: number): PuzzleData[] {
  const dates = generateDatesForYear(year);
  const puzzles: PuzzleData[] = [];
  
  // Use a subset of words for puzzles (every 7th word to spread them out)
  const puzzleWords = words.filter((_, index) => index % 7 === 0);
  
  dates.forEach((date, index) => {
    const wordIndex = index % puzzleWords.length;
    puzzles.push({
      date,
      word: puzzleWords[wordIndex]
    });
  });
  
  return puzzles;
}

function buildClues(words: string[]): CluesData {
  const clues: CluesData = {};
  
  // Generate simple clues (you can replace this with real clues)
  words.forEach(word => {
    clues[word] = `clue for ${word.toLowerCase()}`;
  });
  
  return clues;
}

async function main() {
  try {
    console.log('Building game data files...');
    
    // This is a placeholder - you would load your actual frequency list here
    // const frequencyList = await loadFrequencyList('path/to/frequency-list.txt');
    
    // For now, using sample data
    const sampleWords5 = [
      'HELLO', 'WORLD', 'MOUTH', 'BRAIN', 'SPACE', 'DREAM', 'LIGHT', 'WATER',
      'EARTH', 'FIRE', 'MUSIC', 'HAPPY', 'SMILE', 'PEACE', 'LOVE', 'HOPE'
    ];
    
    const sampleWords6 = [
      'MOUNTAIN', 'OCEAN', 'SUNSHINE', 'FRIEND', 'BEAUTY', 'COURAGE', 'WISDOM',
      'FREEDOM', 'JOURNEY', 'MYSTERY', 'HARMONY', 'SILENCE', 'WONDER', 'MAGIC'
    ];
    
    const dataDir = path.join(__dirname, '../lib/data');
    
    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Build 5-letter data
    const dict5 = buildDictionary(sampleWords5, 5);
    const clues5 = buildClues(dict5);
    
    // Build 6-letter data
    const dict6 = buildDictionary(sampleWords6, 6);
    const clues6 = buildClues(dict6);
    
    // Write dictionary files to lib/data
    fs.writeFileSync(path.join(dataDir, 'dictionary5.json'), JSON.stringify(dict5, null, 2));
    fs.writeFileSync(path.join(dataDir, 'dictionary6.json'), JSON.stringify(dict6, null, 2));
    
    // Write clues files to lib/data directory (using current year)
    const currentYear = new Date().getFullYear();
    fs.writeFileSync(path.join(dataDir, `clues-${currentYear}.json`), JSON.stringify({...clues5, ...clues6}, null, 2));
    
    // Note: Puzzle files for multiple years (2025-2030) should be created separately
    // This script now focuses on dictionaries and clues only
    
    console.log('✅ Data files built successfully!');
    console.log(`📁 5-letter: ${dict5.length} words`);
    console.log(`📁 6-letter: ${dict6.length} words`);
    console.log(`📁 Clues: ${Object.keys({...clues5, ...clues6}).length} total clues`);
    console.log('📝 Note: Puzzle files for multiple years (2025-2030) should be created separately');
    
  } catch (error) {
    console.error('❌ Error building data files:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
