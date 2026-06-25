const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

const TICKER_MAP: Record<string, { id: string; name: string }> = {
  btc: { id: "bitcoin", name: "Bitcoin" },
  eth: { id: "ethereum", name: "Ethereum" },
  usdt: { id: "tether", name: "Tether" },
  bnb: { id: "binancecoin", name: "BNB" },
  sol: { id: "solana", name: "Solana" },
  usdc: { id: "usd-coin", name: "USD Coin" },
  xrp: { id: "ripple", name: "XRP" },
  ada: { id: "cardano", name: "Cardano" },
  doge: { id: "dogecoin", name: "Dogecoin" },
  dot: { id: "polkadot", name: "Polkadot" },
  avax: { id: "avalanche-2", name: "Avalanche" },
  matic: { id: "matic-network", name: "Polygon" },
  link: { id: "chainlink", name: "Chainlink" },
  uni: { id: "uniswap", name: "Uniswap" },
  atom: { id: "cosmos", name: "Cosmos" },
  ltc: { id: "litecoin", name: "Litecoin" },
  etc: { id: "ethereum-classic", name: "Ethereum Classic" },
  bch: { id: "bitcoin-cash", name: "Bitcoin Cash" },
  trx: { id: "tron", name: "TRON" },
  near: { id: "near", name: "NEAR Protocol" },
  apt: { id: "aptos", name: "Aptos" },
  arb: { id: "arbitrum", name: "Arbitrum" },
  op: { id: "optimism", name: "Optimism" },
  sui: { id: "sui", name: "Sui" },
  stx: { id: "blockstack", name: "Stacks" },
  fil: { id: "filecoin", name: "Filecoin" },
  inj: { id: "injective-protocol", name: "Injective" },
  sei: { id: "sei-network", name: "Sei" },
  aave: { id: "aave", name: "Aave" },
  algo: { id: "algorand", name: "Algorand" },
  ftm: { id: "fantom", name: "Fantom" },
  flow: { id: "flow", name: "Flow" },
  vet: { id: "vechain", name: "VeChain" },
  hbar: { id: "hedera-hashgraph", name: "Hedera" },
  pepe: { id: "pepe", name: "Pepe" },
  shib: { id: "shiba-inu", name: "Shiba Inu" },
  wif: { id: "dogwifcoin", name: "dogwifhat" },
  bonk: { id: "bonk", name: "Bonk" },
  floki: { id: "floki", name: "Floki" },
  ton: { id: "the-open-network", name: "Toncoin" },
  cro: { id: "crypto-com-chain", name: "Cronos" },
  mkr: { id: "maker", name: "Maker" },
  dai: { id: "dai", name: "Dai" },
  snx: { id: "havven", name: "Synthetix" },
  grt: { id: "the-graph", name: "The Graph" },
  sand: { id: "the-sandbox", name: "The Sandbox" },
  mana: { id: "decentraland", name: "Decentraland" },
  axs: { id: "axie-infinity", name: "Axie Infinity" },
  ens: { id: "ethereum-name-service", name: "ENS" },
  ld0: { id: "lido-dao", name: "Lido DAO" },
  rndr: { id: "render-token", name: "Render" },
  imx: { id: "immutable-x", name: "Immutable" },
  xlm: { id: "stellar", name: "Stellar" },
  xtz: { id: "tezos", name: "Tezos" },
  egld: { id: "elrond-erd-2", name: "MultiversX" },
  theta: { id: "theta-token", name: "Theta" },
  icp: { id: "internet-computer", name: "ICP" },
};

export interface CoinInfo {
  coinId: string;
  ticker: string;
  name: string;
}

export interface CoinPrice {
  coinId: string;
  ticker: string;
  name: string;
  price: number;
  change24h: number | null;
}

const COMMON_TICKERS = Object.keys(TICKER_MAP);

export function getCommonCoins(): CoinInfo[] {
  return COMMON_TICKERS.map((t) => ({
    coinId: TICKER_MAP[t].id,
    ticker: t.toUpperCase(),
    name: TICKER_MAP[t].name,
  }));
}

export function lookupTicker(ticker: string): CoinInfo | null {
  const entry = TICKER_MAP[ticker.toLowerCase()];
  if (!entry) return null;
  return { coinId: entry.id, ticker: ticker.toUpperCase(), name: entry.name };
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

function fuzzyMatchCoins(query: string): CoinInfo[] {
  const q = query.toLowerCase();
  const scored: { info: CoinInfo; score: number }[] = [];

  for (const [ticker, info] of Object.entries(TICKER_MAP)) {
    const tickerDist = levenshtein(q, ticker);
    const nameDist = levenshtein(q, info.name.toLowerCase());
    const minDist = Math.min(tickerDist, nameDist);

    const maxLen = Math.max(q.length, ticker.length, info.name.length);
    const similarity = 1 - minDist / maxLen;

    if (similarity >= 0.5) {
      scored.push({
        info: { coinId: info.id, ticker: ticker.toUpperCase(), name: info.name },
        score: similarity,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.info);
}

export async function searchCoins(query: string): Promise<CoinInfo[]> {
  const q = query.toLowerCase().trim();
  const direct = lookupTicker(q);
  if (direct) return [direct];

  const results: CoinInfo[] = [];
  for (const [ticker, info] of Object.entries(TICKER_MAP)) {
    if (ticker.startsWith(q) || info.name.toLowerCase().includes(q)) {
      results.push({ coinId: info.id, ticker: ticker.toUpperCase(), name: info.name });
    }
  }
  if (results.length > 0) return results.slice(0, 10);

  const fuzzy = fuzzyMatchCoins(q);
  if (fuzzy.length > 0) return fuzzy.slice(0, 10);

  try {
    const resp = await fetch(`${COINGECKO_BASE}/search?query=${encodeURIComponent(q)}`);
    if (!resp.ok) throw new Error(`CoinGecko search failed: ${resp.status}`);
    const data = (await resp.json()) as { coins: { id: string; symbol: string; name: string }[] };
    return (data.coins || []).slice(0, 10).map((c) => ({
      coinId: c.id,
      ticker: c.symbol.toUpperCase(),
      name: c.name,
    }));
  } catch {
    return [];
  }
}

export async function fetchPrices(
  coinIds: string[],
  fiat: string,
): Promise<Map<string, CoinPrice>> {
  const result = new Map<string, CoinPrice>();
  if (coinIds.length === 0) return result;

  const url = `${COINGECKO_BASE}/simple/price?ids=${coinIds.join(",")}&vs_currencies=${fiat}&include_24hr_change=true`;

  const resp = await fetchWithRetry(url, 3);
  if (!resp) return result;

  try {
    const data = (await resp.json()) as Record<string, Record<string, number>>;

    for (const coinId of coinIds) {
      const priceData = data[coinId];
      if (!priceData || typeof priceData[fiat] !== "number") continue;
      let change24h: number | null = null;
      const changeKey = `${fiat}_24h_change`;
      if (typeof priceData[changeKey] === "number") change24h = priceData[changeKey];

      const entry = Object.entries(TICKER_MAP).find(([, v]) => v.id === coinId);
      const ticker = entry ? entry[0].toUpperCase() : coinId.toUpperCase();
      const name = entry ? entry[1].name : coinId;

      result.set(coinId, {
        coinId,
        ticker,
        name,
        price: priceData[fiat],
        change24h,
      });
    }
  } catch {
    // Silent error — caller handles empty results
  }

  return result;
}

async function fetchWithRetry(url: string, retries: number): Promise<Response | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 10_000);
      try {
        const resp = await fetch(url, { signal: ctrl.signal });
        clearTimeout(timeout);
        if (resp.ok) return resp;
        if (resp.status >= 500 && attempt < retries - 1) {
          await sleep((attempt + 1) * 2000);
          continue;
        }
        return null;
      } catch (inner) {
        clearTimeout(timeout);
        throw inner;
      }
    } catch {
      if (attempt < retries - 1) {
        await sleep((attempt + 1) * 2000);
        continue;
      }
      return null;
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchSinglePrice(coinId: string, fiat: string): Promise<CoinPrice | null> {
  const prices = await fetchPrices([coinId], fiat);
  return prices.get(coinId) ?? null;
}