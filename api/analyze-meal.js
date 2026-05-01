export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { description, quantity } = req.body || {};
  if (!description) return res.status(400).json({ error: 'Missing description' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const prompt = `You are a nutrition expert. Estimate the calories and macros for this food item.

Food: "${description}"
Quantity/serving: "${quantity || '1 serving'}"

Return ONLY a valid JSON object with no explanation, markdown, or extra text:
{
  "name": "short readable food name",
  "calories": <integer>,
  "protein_g": <integer>,
  "carbs_g": <integer>,
  "fat_g": <integer>
}

Base your estimates on standard nutritional databases. Be realistic and precise.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(502).json({ error: 'Claude API error', detail: err });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text?.trim() || '';

    // Extract JSON even if there's surrounding whitespace
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(502).json({ error: 'Could not parse nutrition data', raw: text });

    const nutrition = JSON.parse(jsonMatch[0]);
    return res.status(200).json(nutrition);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
