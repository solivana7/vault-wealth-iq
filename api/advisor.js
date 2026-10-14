export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST required' });
  }

  const API_KEY = process.env.CLAUDE_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const { financialData, question } = req.body || {};
  if (!financialData) {
    return res.status(400).json({ error: 'Financial data required' });
  }

  const systemPrompt = `You are VAULT AI, a personal financial advisor embedded in a wealth tracking dashboard. You have access to the user's complete financial picture. Be specific, actionable, and concise. Use dollar amounts from their actual data. Never give generic advice — reference their specific accounts, balances, and situation. Keep responses under 300 words. Format with bullet points for action items.`;

  const userPrompt = question
    ? `Here is my financial data:\n${JSON.stringify(financialData, null, 2)}\n\nMy question: ${question}`
    : `Here is my complete financial data:\n${JSON.stringify(financialData, null, 2)}\n\nAnalyze my financial situation and give me your top 5 most impactful recommendations. Be specific — reference my actual account names, balances, and numbers. Prioritize by dollar impact.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        thinking: { type: 'disabled' },
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: 'Claude API error: ' + err });
    }

    const data = await response.json();
    const text = data.content?.find((b) => b.type === 'text')?.text || 'No response generated.';

    return res.status(200).json({ advice: text });
  } catch (err) {
    return res.status(500).json({ error: 'Advisor failed: ' + err.message });
  }
}
