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
    const now = new Date();
    
    function cleanTitle(title) {
      if (!title) return 'Untitled Market';
      
      // Remove leading "yes " or "no "
      let clean = title.replace(/^(yes|no)\s+/i, '');
      
      // Split on common separators
      const parts = clean.split(/,yes |,no |;yes |;no /i);
      
      // Take first 3 parts max to keep readable
      const shortened = parts.slice(0, 3).join(' + ');
      
      // If still too long, truncate
      if (shortened.length > 100) {
        return shortened.substring(0, 97) + '...';
      }
      
      return shortened;
    }
    
    function categorize(ticker, title) {
      const t = (ticker + ' ' + title).toLowerCase();
      if (t.match(/nba|nfl|mlb|nhl|basketball|football|hockey|baseball|game|match|sport/)) return 'SPORTS';
      if (t.match(/fed|gdp|inflation|cpi|unemployment|economy|treasury/)) return 'ECONOMICS';
      if (t.match(/wheat|corn|oil|gold|silver|commodity|crop/)) return 'COMMODITIES';
      if (t.match(/weather|temperature|rain|snow|storm|climate/)) return 'WEATHER';
      if (t.match(/oscar|movie|emmy|grammy|entertainment|film|actor/)) return 'ENTERTAINMENT';
      return 'GENERAL';
    }
    
    const opportunities = (data.markets || []).slice(0, 30).map((m, i) => {
      const yesAsk = m.yes_ask ? m.yes_ask / 100 : 0.50;
      const yesBid = m.yes_bid ? m.yes_bid / 100 : 0.50;
      const expiryMs = new Date(m.close_time) - now;
      const expiryDays = Math.max(1, Math.ceil(expiryMs / 86400000));
      
      const probability = (yesBid + yesAsk) / 2;
      const payout = Math.max(0.01, 1 - yesAsk);
      const expectedValue = (probability * payout) - ((1 - probability) * yesAsk) - (yesAsk * 0.07);
      
      return {
        id: m.ticker || `market-${i}`,
        title: cleanTitle(m.title),
        category: categorize(m.ticker, m.title),
        probability,
        yesPrice: yesAsk,
        volume: m.volume || 0,
        spread: Math.abs(yesAsk - yesBid),
        expiryDays,
        expectedValue,
        riskScore: 5,
        marketUrl: m.market_url || `https://kalshi.com/markets/${m.ticker}`
      };
    });
    
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
