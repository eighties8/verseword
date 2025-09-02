import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { word } = req.query;

  if (!word || typeof word !== 'string') {
    return res.status(400).json({ error: 'Word parameter is required.' });
  }

  try {
    const filePath = path.join(process.cwd(), 'lib', 'data', 'word-definitions-2025.json');
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const definitionsData = JSON.parse(fileContent);

    const upperWord = word.toUpperCase();
    const wordDefinition = definitionsData.definitions[upperWord];

    if (!wordDefinition) {
      return res.status(404).json({ error: 'Word not found in definitions.' });
    }

    res.status(200).json({
      word: upperWord,
      definitions: wordDefinition
    });
  } catch (error) {
    console.error('Error reading word definitions file:', error);
    res.status(500).json({ error: 'Failed to load word definitions' });
  }
}
