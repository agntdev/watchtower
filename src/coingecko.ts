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

  try {
    const resp = await fetch(
      `${COINGECKO_BASE}/simple/price?ids=${coinIds.join(",")}&vs_currencies=${fiat}&include_24hr_change=true`,
    );
    if (!resp.ok) throw new Error(`CoinGecko price fetch failed: ${resp.status}`);
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

export async function fetchSinglePrice(coinId: string, fiat: string): Promise<CoinPrice | null> {
  const prices = await fetchPrices([coinId], fiat);
  return prices.get(coinId) ?? null;
}