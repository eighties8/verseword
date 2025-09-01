import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { random } = req.query;

  try {
    // Get current year and try to load the unified puzzle file
    const currentYear = new Date().getFullYear();
    let puzzlesData: any = {};
    let loadedYear = currentYear;

    // Try to load puzzles for current year, fall back to 2025 if not found
    for (let year = currentYear; year >= 2025; year--) {
      try {
        const filePath = path.join(process.cwd(), 'lib', 'data', `puzzles-${year}.json`);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        puzzlesData = JSON.parse(fileContent);
        loadedYear = year;
        break; // Successfully loaded, exit loop
      } catch (yearError) {
        // Continue to next year if this one fails
        continue;
      }
    }

    if (Object.keys(puzzlesData).length === 0) {
      return res.status(500).json({ error: 'No puzzle data available for any year' });
    }

    // Convert the object format to array format for compatibility
    const puzzles = Object.entries(puzzlesData).map(([date, puzzle]: [string, any]) => ({
      date,
      word: puzzle.word,
      len: puzzle.len
    }));

    // If random mode is requested, return a single random puzzle
    if (random === 'true') {
      const randomIndex = Math.floor(Math.random() * puzzles.length);
      const randomPuzzle = puzzles[randomIndex];

      return res.status(200).json([randomPuzzle]); // Return as array to maintain compatibility
    }

    res.status(200).json(puzzles);
  } catch (error) {
    console.error('Error reading puzzles file:', error);
    res.status(500).json({ error: 'Failed to load puzzles' });
  }
}
