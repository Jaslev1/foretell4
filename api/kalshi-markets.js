// api/kalshi-markets.js
// NO FILTERS VERSION - Just return everything from Kalshi

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const KALSHI_API_BASE = 'https://api.elections.kalshi.com/trade-api/v2';
    
    const response = await fetch(`${KALSHI_API_BASE}/markets?limit=100&status=open`);
    
    if (!response.ok) {
      throw new Error(`Kalshi API returned ${response.status}`);
    }
    
    const data = await response.json();
    
    // Just return first 20 markets with minimal processing - NO FILTERS
    const opportunities = (data.markets || []).slice(0, 20).map(m => {
      const yesPrice = (m.yes_ask || 50) / 100;
      const probability = ((m.yes_bid + m.yes_ask) / 2) / 100 || 0.5;
      
      const expiryDate = new Date(m.close_time);
      const now = new Date();
      const expiryDays = Math.max(0, Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24)));
      
      return {
        id: m.ticker,
        title: m.title || 'Untitled',
        category: 'Test',
        probability,
        yesPrice,
        payout: 2,
        volume: m.volume || 0,
        riskScore: 5,
        spread: 0.1,
        expiryDays,
        expectedValue: 0.05,
        edge: 0.05,
        riskRewardRatio: 2,
        maxWin: 0.5,
        maxLoss: 0.5,
        marketUrl: m.market_url || 'https://kalshi.com'
      };
    });
    
    res.status(200).json({ 
      success: true,
      opportunities,
      count: opportunities.length,
      totalFromKalshi: data.markets?.length || 0,
      timestamp: new Date().toISOString(),
      version: 'unfiltered-test'
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: error.stack
    });
  }
}
