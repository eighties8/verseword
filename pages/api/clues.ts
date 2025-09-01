import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { year } = req.query;
  
  if (!year || typeof year !== 'string') {
    return res.status(400).json({ error: 'Year parameter is required.' });
  }

  try {
    // Read the clues file from lib/data directory using year-based naming
    const filePath = path.join(process.cwd(), 'lib', 'data', `clues-${year}.json`);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const clues = JSON.parse(fileContent);
    
    res.status(200).json(clues);
  } catch (error) {
    console.error('Error reading clues file:', error);
    res.status(500).json({ error: 'Failed to load clues' });
  }
}
