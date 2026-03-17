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
    const response = await fetch('https://api.elections.kalshi.com/trade-api/v2/markets?limit=500&status=open');
    const data = await response.json();
    const now = new Date();
    
    const opportunities = (data.markets || [])
      .filter(m => m.yes_ask || m.yes_bid) // Accept ANY market with any pricing
      .map(m => {
        const yesAsk = (m.yes_ask || 50) / 100;
        const yesBid = (m.yes_bid || 50) / 100;
        const yesPrice = yesAsk;
        const probability = (yesBid + yesAsk) / 2;
        const spread = Math.abs(yesAsk - yesBid);
        
        const expiryMs = new Date(m.close_time) - now;
        const expiryDays = Math.max(1, Math.ceil(expiryMs / 86400000));
        
        const payout = Math.max(0.01, 1 - yesPrice);
        const risk = yesPrice;
        const fees = yesPrice * 0.07;
        const expectedValue = (probability * payout) - ((1 - probability) * risk) - fees;
        
        const t = (m.ticker + ' ' + (m.title || '')).toLowerCase();
        let category = 'GENERAL';
        if (t.match(/nba|nfl|mlb|nhl|game|match|basketball|football|hockey|soccer/)) category = 'SPORTS';
        else if (t.match(/fed|gdp|inflation|cpi|unemployment|economy/)) category = 'ECONOMICS';
        else if (t.match(/wheat|corn|oil|gold|silver|commodity/)) category = 'COMMODITIES';
        else if (t.match(/weather|temperature|rain|snow/)) category = 'WEATHER';
        else if (t.match(/oscar|movie|emmy|grammy|entertainment/)) category = 'ENTERTAINMENT';
        
        return {
          id: m.ticker,
          title: (m.title || 'Untitled').replace(/^yes\s+/i, ''),
          category,
          probability,
          yesPrice,
          volume: m.volume || 0,
          spread,
          expiryDays,
          expectedValue,
          riskScore: 5,
          marketUrl: m.market_url || `https://kalshi.com/markets/${m.ticker.toLowerCase()}`
        };
      })
      .sort((a, b) => b.volume - a.volume) // Sort by volume (most liquid first)
      .slice(0, 30);
    
    res.status(200).json({ 
      success: true,
      opportunities,
      count: opportunities.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}
