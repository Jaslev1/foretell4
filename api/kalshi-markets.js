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
    
    if (!response.ok) {
      throw new Error(`Kalshi API error: ${response.status}`);
    }
    
    const data = await response.json();
    const now = new Date();
    
    const opportunities = (data.markets || [])
      .filter(m => m.yes_bid && m.yes_ask && m.yes_ask > m.yes_bid)
      .map(m => {
        const yesAsk = m.yes_ask / 100;
        const yesBid = m.yes_bid / 100;
        const yesPrice = yesAsk;
        const probability = (yesBid + yesAsk) / 2;
        const spread = yesAsk - yesBid;
        
        const expiryMs = new Date(m.close_time) - now;
        const expiryDays = Math.max(0, Math.ceil(expiryMs / 86400000));
        
        const payout = 1 - yesPrice;
        const risk = yesPrice;
        const fees = yesPrice * 0.07;
        const expectedValue = (probability * payout) - ((1 - probability) * risk) - fees;
        const edge = probability - yesPrice;
        const rrr = yesPrice / (1 - yesPrice);
        
        let riskScore = 5;
        if (m.volume > 100000) riskScore -= 1;
        if (spread < 0.05) riskScore -= 1;
        if (rrr > 3) riskScore += 2;
        if (yesPrice > 0.80) riskScore += 1;
        riskScore = Math.max(1, Math.min(10, riskScore));
        
        const t = (m.ticker + ' ' + (m.title || '')).toLowerCase();
        let category = 'GENERAL';
        if (t.includes('nba') || t.includes('nfl') || t.includes('mlb') || t.includes('nhl') || t.includes('game') || t.includes('match')) category = 'SPORTS';
        else if (t.includes('fed') || t.includes('gdp') || t.includes('inflation') || t.includes('cpi')) category = 'ECONOMICS';
        else if (t.includes('wheat') || t.includes('corn') || t.includes('oil') || t.includes('gold')) category = 'COMMODITIES';
        else if (t.includes('weather') || t.includes('temperature')) category = 'WEATHER';
        else if (t.includes('oscar') || t.includes('movie') || t.includes('emmy')) category = 'ENTERTAINMENT';
        
        return {
          id: m.ticker,
          title: (m.title || '').replace(/^yes\s+/i, '').trim(),
          category,
          probability,
          yesPrice,
          payout: 1 / probability,
          volume: m.volume || 0,
          spread,
          expiryDays,
          expectedValue,
          edge,
          riskRewardRatio: rrr,
          maxWin: 1 - yesPrice,
          maxLoss: yesPrice,
          riskScore,
          marketUrl: m.market_url || `https://kalshi.com/markets/${m.ticker.toLowerCase()}`
        };
      })
      .sort((a, b) => b.expectedValue - a.expectedValue)
      .slice(0, 30);
    
    res.status(200).json({ 
      success: true,
      opportunities,
      count: opportunities.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}
