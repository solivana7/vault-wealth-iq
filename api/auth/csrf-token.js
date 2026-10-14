import { generateToken } from '../../lib/csrf.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'GET required' });
  }

  const token = generateToken();
  
  return res.status(200).json({ 
    token,
    expiresIn: 24 * 60 * 60 // 24 hours in seconds
  });
}
