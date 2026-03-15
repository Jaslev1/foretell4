// api/kalshi-markets.js
// v2.2 - LOOSE FILTERS (allows low volume markets)

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
    
    const response = await fetch(`${KALSHI_API_BASE}/markets?limit=1000&status=open`);
    
    if (!response.ok) {
      throw new Error(`Kalshi API returned ${response.status}`);
    }
    
    const data = await response.json();
    
    const opportunities = processMarkets(data.markets || []);
    
    res.status(200).json({ 
      success: true,
      opportunities,
      count: opportunities.length,
      timestamp: new Date().toISOString(),
      version: '2.2-loose-filters'
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}

function processMarkets(markets) {
  const now = new Date();
  
  return markets
    .filter(m => {
      if (!m.yes_bid || !m.yes_ask) return false;
      const spread = (m.yes_ask - m.yes_bid) / 100;
      if (spread > 0.50) return false; // Very wide spreads
      return true;
    })
    .map(m => {
      const yesPrice = m.yes_ask / 100;
      const probability = ((m.yes_bid + m.yes_ask) / 2) / 100;
      const spread = (m.yes_ask - m.yes_bid) / 100;
      
      const expiryDate = new Date(m.close_time);
      const msToExpiry = expiryDate - now;
      const expiryDays = Math.max(0, Math.ceil(msToExpiry / (1000 * 60 * 60 * 24)));
      const hoursToExpiry = Math.max(0, msToExpiry / (1000 * 60 * 60));
      
      const ev = calculateExpectedValue(probability, yesPrice);
      const riskRewardRatio = calculateRiskRewardRatio(yesPrice);
      const edge = probability - yesPrice;
      
      return {
        id: m.ticker,
        title: m.title.replace(/^yes\s+/i, '').trim(),
        category: categorizeMarket(m.ticker, m.title),
        probability,
        yesPrice,
        payout: probability > 0 ? 1 / probability : 0,
        volume: m.volume || 0,
        spread,
        expiryDays,
        hoursToExpiry,
        expectedValue: ev,
        edge,
        riskRewardRatio,
        maxWin: 1 - yesPrice,
        maxLoss: yesPrice,
        riskScore: calculateRiskScore(m, spread, probability, yesPrice, hoursToExpiry, edge),
        marketUrl: m.market_url || `https://kalshi.com/markets/${m.ticker.toLowerCase()}`
      };
    })
    .filter(opp => {
      // VERY LOOSE FILTERS
      
      // Filter 1: EV > 0% (just needs to be positive)
      if (opp.expectedValue < 0) return false;
      
      // Filter 2: Risk/reward < 10 (very loose)
      if (opp.riskRewardRatio > 10) return false;
      
      // Filter 3: NO volume filter - allow everything
      
      return true;
    })
    .sort((a, b) => {
      // Sort by volume first (show liquid markets first)
      if (a.volume !== b.volume) return b.volume - a.volume;
      
      const evDiff = b.expectedValue - a.expectedValue;
      if (Math.abs(evDiff) > 0.01) return evDiff;
      
      return a.riskScore - b.riskScore;
    })
    .slice(0, 100);
}

function categorizeMarket(ticker, title) {
  const t = (ticker + ' ' + title).toLowerCase();
  
  if (t.includes('nba') || t.includes('nfl') || t.includes('mlb') || t.includes('nhl') ||
      t.includes('game') || t.includes('match') || t.includes('tennis') ||
      t.includes('basketball') || t.includes('football') || t.includes('soccer')) return 'Sports';
  
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

function calculateExpectedValue(probability, price, feeRate = 0.035) {
  const payout = 1 - price;
  const risk = price;
  const expectedReturn = (probability * payout) - ((1 - probability) * risk);
  const fees = price * feeRate;
  return expectedReturn - fees;
}

function calculateRiskRewardRatio(price) {
  const maxLoss = price;
  const maxWin = 1 - price;
  if (maxWin === 0) return 999;
  return maxLoss / maxWin;
}

function calculateRiskScore(market, spread, probability, yesPrice, hoursToExpiry, edge) {
  const { volume = 0 } = market;
  
  let risk = 5;
  
  if (volume > 200000) risk -= 2;
  else if (volume > 100000) risk -= 1;
  else if (volume < 20000) risk += 1;
  
  if (spread < 0.05) risk -= 1;
  else if (spread > 0.30) risk += 2;
  
  const riskRewardRatio = yesPrice / (1 - yesPrice);
  if (riskRewardRatio > 4) risk += 2;
  else if (riskRewardRatio > 3) risk += 1;
  
  if (yesPrice > 0.80 && probability > 0.80) risk += 2;
  
  if (yesPrice < 0.40 && edge > 0.10) risk -= 1;
  
  if (hoursToExpiry >= 6 && hoursToExpiry <= 24) risk -= 1;
  else if (hoursToExpiry >= 1 && hoursToExpiry < 6) risk += 1;
  
  return Math.max(1, Math.min(10, Math.round(risk * 2) / 2));
}
