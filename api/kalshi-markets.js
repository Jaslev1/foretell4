// api/kalshi-markets.js
// WORKING VERSION - Minimal filters, returns top 30

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
    
    const response = await fetch(`${KALSHI_API_BASE}/markets?limit=500&status=open`);
    
    if (!response.ok) {
      throw new Error(`Kalshi API returned ${response.status}`);
    }
    
    const data = await response.json();
    const now = new Date();
    
    // Process all markets with real calculations
    const opportunities = (data.markets || [])
      .filter(m => m.yes_bid && m.yes_ask) // Must have pricing
      .map(m => {
        const yesAsk = m.yes_ask / 100;
        const yesBid = m.yes_bid / 100;
        const yesPrice = yesAsk;
        const probability = (yesBid + yesAsk) / 2;
        const spread = yesAsk - yesBid;
        
        const expiryDate = new Date(m.close_time);
        const msToExpiry = expiryDate - now;
        const expiryDays = Math.max(0, Math.ceil(msToExpiry / (1000 * 60 * 60 * 24)));
        
        // Real calculations
        const payout = 1 - yesPrice;
        const risk = yesPrice;
        const fees = yesPrice * 0.07; // 7% total fees
        const expectedValue = (probability * payout) - ((1 - probability) * risk) - fees;
        const edge = probability - yesPrice;
        const riskRewardRatio = yesPrice / (1 - yesPrice);
        
        // Simple risk score
        let riskScore = 5;
        if (m.volume > 100000) riskScore -= 1;
        if (spread < 0.05) riskScore -= 1;
        if (riskRewardRatio > 3) riskScore += 2;
        if (yesPrice > 0.80) riskScore += 1;
        riskScore = Math.max(1, Math.min(10, riskScore));
        
        return {
          id: m.ticker,
          title: (m.title || '').replace(/^yes\s+/i, '').trim(),
          category: categorizeMarket(m.ticker, m.title),
          probability,
          yesPrice,
          payout: 1 / probability,
          volume: m.volume || 0,
          spread,
          expiryDays,
          expectedValue,
          edge,
          riskRewardRatio,
          maxWin: 1 - yesPrice,
          maxLoss: yesPrice,
          riskScore,
          marketUrl: m.market_url || `https://kalshi.com/markets/${m.ticker.toLowerCase()}`
        };
      })
      .sort((a, b) => b.expectedValue - a.expectedValue) // Sort by EV
      .slice(0, 30); // Top 30
    
    res.status(200).json({ 
      success: true,
      opportunities,
      count: opportunities.length,
      timestamp: new Date().toISOString(),
      version: 'working'
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}

function categorizeMarket(ticker = '', title = '') {
  const t = (ticker + ' ' + title).toLowerCase();
  
  if (t.includes('nba') || t.includes('nfl') || t.includes('mlb') || t.includes('nhl') ||
      t.includes('game') || t.includes('match') || t.includes('basketball') || 
      t.includes('football') || t.includes('soccer') || t.includes('tennis')) return 'SPORTS';
  
  if (t.includes('fed') || t.includes('gdp') || t.includes('inflation') || 
      t.includes('cpi') || t.includes('unemployment')) return 'ECONOMICS';
  
  if (t.includes('wheat') || t.includes('corn') || t.includes('oil') ||
      t.includes('gold') || t.includes('silver')) return 'COMMODITIES';
  
  if (t.includes('btc') || t.includes('bitcoin') || t.includes('eth') || 
      t.includes('crypto')) return 'CRYPTO';
  
  if (t.includes('weather') || t.includes('temperature')) return 'WEATHER';
  
  if (t.includes('oscar') || t.includes('movie') || t.includes('netflix') ||
      t.includes('grammy') || t.includes('emmy')) return 'ENTERTAINMENT';
  
  return 'GENERAL';
}
