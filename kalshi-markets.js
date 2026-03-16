// api/kalshi-markets.js
// v2.3 - ZERO FILTERS - Just return raw Kalshi data

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
    
    const response = await fetch(`${KALSHI_API_BASE}/markets?limit=200&status=open`);
    
    if (!response.ok) {
      throw new Error(`Kalshi API returned ${response.status}`);
    }
    
    const data = await response.json();
    const now = new Date();
    
    // NO FILTERS - Just map and return everything
    const opportunities = (data.markets || []).map(m => {
      // Use defaults if data is missing
      const yesAsk = m.yes_ask || 50;
      const yesBid = m.yes_bid || 50;
      const yesPrice = yesAsk / 100;
      const probability = ((yesBid + yesAsk) / 2) / 100;
      
      const expiryDate = new Date(m.close_time);
      const msToExpiry = expiryDate - now;
      const expiryDays = Math.max(0, Math.ceil(msToExpiry / (1000 * 60 * 60 * 24)));
      
      return {
        id: m.ticker || Math.random().toString(),
        title: (m.title || 'Untitled Market').replace(/^yes\s+/i, '').trim(),
        category: categorizeMarket(m.ticker, m.title),
        probability,
        yesPrice,
        payout: probability > 0 ? 1 / probability : 2,
        volume: m.volume || 0,
        spread: Math.abs(yesAsk - yesBid) / 100,
        expiryDays,
        expectedValue: 0.05,
        edge: 0.05,
        riskRewardRatio: yesPrice / (1 - yesPrice),
        maxWin: 1 - yesPrice,
        maxLoss: yesPrice,
        riskScore: 5,
        marketUrl: m.market_url || `https://kalshi.com/markets/${(m.ticker || '').toLowerCase()}`
      };
    }).slice(0, 100); // Just take first 100
    
    res.status(200).json({ 
      success: true,
      opportunities,
      count: opportunities.length,
      totalFromKalshi: data.markets?.length || 0,
      timestamp: new Date().toISOString(),
      version: '2.3-no-filters'
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: error.stack
    });
  }
}

function categorizeMarket(ticker = '', title = '') {
  const t = (ticker + ' ' + title).toLowerCase();
  
  if (t.includes('nba') || t.includes('nfl') || t.includes('mlb') || t.includes('nhl') ||
      t.includes('game') || t.includes('match') || t.includes('basketball') || 
      t.includes('football') || t.includes('soccer') || t.includes('tennis')) return 'Sports';
  
  if (t.includes('fed') || t.includes('gdp') || t.includes('inflation') || 
      t.includes('cpi') || t.includes('unemployment')) return 'Economics';
  
  if (t.includes('btc') || t.includes('bitcoin') || t.includes('eth') || 
      t.includes('crypto')) return 'Crypto';
  
  if (t.includes('stock') || t.includes('earnings') || t.includes('nvidia') ||
      t.includes('tesla') || t.includes('s&p')) return 'Stocks';
  
  if (t.includes('ai ') || t.includes('tech') || t.includes('openai')) return 'Tech';
  
  if (t.includes('election') || t.includes('congress') || t.includes('trump') ||
      t.includes('president')) return 'Politics';
  
  if (t.includes('weather') || t.includes('temperature')) return 'Weather';
  
  if (t.includes('oscar') || t.includes('movie') || t.includes('netflix')) return 'Entertainment';
  
  return 'Other';
}
