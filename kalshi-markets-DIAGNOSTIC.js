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
    const response = await fetch('https://api.elections.kalshi.com/trade-api/v2/markets?limit=100&status=open');
    const data = await response.json();
    
    // ZERO FILTERS - Return first 30 markets no matter what
    const opportunities = (data.markets || []).slice(0, 30).map((m, i) => {
      const now = new Date();
      const yesAsk = m.yes_ask ? m.yes_ask / 100 : 0.50;
      const yesBid = m.yes_bid ? m.yes_bid / 100 : 0.50;
      const expiryMs = new Date(m.close_time) - now;
      const expiryDays = Math.max(1, Math.ceil(expiryMs / 86400000));
      
      return {
        id: m.ticker || `market-${i}`,
        title: m.title || 'Untitled Market',
        category: 'GENERAL',
        probability: (yesBid + yesAsk) / 2,
        yesPrice: yesAsk,
        volume: m.volume || 0,
        spread: Math.abs(yesAsk - yesBid),
        expiryDays,
        expectedValue: 0.05,
        riskScore: 5,
        marketUrl: m.market_url || 'https://kalshi.com'
      };
    });
    
    res.status(200).json({ 
      success: true,
      opportunities,
      count: opportunities.length,
      totalFromKalshi: data.markets?.length || 0,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: error.stack
    });
  }
}
