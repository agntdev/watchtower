import type { WatchlistEntry } from "./store.js";

export interface CoinPrice {
  ticker: string;
  price: number;
  change24h: number;
  marketCapRank: number | null;
}

const CG_BASE = "https://api.coingecko.com/api/v3";

let cachedCoinList: Map<string, string> | null = null;
let coinListTimestamp = 0;
const COIN_LIST_TTL = 3600_000;

async function getCoinList(): Promise<Map<string, string>> {
  if (cachedCoinList && Date.now() - coinListTimestamp < COIN_LIST_TTL) {
    return cachedCoinList;
  }
  try {
    const res = await fetch(`${CG_BASE}/coins/list`);
    if (!res.ok) throw new Error(`CoinGecko list failed: ${res.status}`);
    const data = (await res.json()) as { id: string; symbol: string; name: string }[];
    cachedCoinList = new Map<string, string>();
    for (const coin of data) {
      const existing = cachedCoinList.get(coin.symbol);
      if (!existing) {
        cachedCoinList.set(coin.symbol, coin.id);
      }
    }
    coinListTimestamp = Date.now();
    return cachedCoinList;
  } catch {
    if (cachedCoinList) return cachedCoinList;
    throw new Error("Failed to fetch coin list from CoinGecko");
  }
}

async function resolveCoinId(ticker: string): Promise<string | null> {
  const list = await getCoinList();
  const id = list.get(ticker.toLowerCase());
  return id ?? null;
}

export async function resolveCoin(ticker: string): Promise<{ id: string; symbol: string } | null> {
  const id = await resolveCoinId(ticker);
  if (!id) return null;
  return { id, symbol: ticker.toLowerCase() };
}

export async function suggestTicker(query: string): Promise<string[]> {
  const list = await getCoinList();
  const q = query.toLowerCase();
  const matches: string[] = [];
  for (const [symbol, id] of list) {
    if (symbol.startsWith(q) || id.startsWith(q)) {
      if (!matches.includes(symbol.toUpperCase())) {
        matches.push(symbol.toUpperCase());
      }
    }
    if (matches.length >= 5) break;
  }
  return matches;
}

export async function getPrices(tickers: string[]): Promise<CoinPrice[]> {
  const unique = [...new Set(tickers.map((t) => t.toLowerCase()))];
  const coinIds: { ticker: string; id: string }[] = [];

  for (const ticker of unique) {
    const resolved = await resolveCoin(ticker);
    if (resolved) {
      coinIds.push({ ticker: ticker.toUpperCase(), id: resolved.id });
    }
  }

  if (coinIds.length === 0) return [];

  const ids = coinIds.map((c) => c.id).join(",");
  try {
    const res = await fetch(
      `${CG_BASE}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd&include_24hr_change=true&include_market_cap_rank=true`,
    );
    if (!res.ok) throw new Error(`CoinGecko price failed: ${res.status}`);
    const data = (await res.json()) as Record<string, { usd: number; usd_24h_change: number; usd_market_cap_rank?: number }>;
    return coinIds.map(({ ticker, id }) => ({
      ticker,
      price: data[id]?.usd ?? 0,
      change24h: data[id]?.usd_24h_change ?? 0,
      marketCapRank: data[id]?.usd_market_cap_rank ?? null,
    }));
  } catch {
    throw new Error("Failed to fetch prices. Please try again later.");
  }
}

export async function getPriceForTicker(ticker: string): Promise<CoinPrice | null> {
  const prices = await getPrices([ticker]);
  return prices.find((p) => p.ticker.toLowerCase() === ticker.toLowerCase()) ?? null;
}

export function formatPrice(price: number, fiat = "USD"): string {
  const symbol = fiat === "USD" ? "$" : fiat;
  if (price >= 1) return `${symbol}${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (price >= 0.01) return `${symbol}${price.toFixed(4)}`;
  return `${symbol}${price.toFixed(8)}`;
}

export function formatChange(change: number): string {
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(2)}%`;
}

export async function getWatchlistPrices(entries: WatchlistEntry[]): Promise<string[]> {
  const enabled = entries.filter((e) => e.enabled);
  if (enabled.length === 0) return [];
  const tickers = enabled.map((e) => e.ticker);
  const prices = await getPrices(tickers);
  return prices.map((p) => {
    const changeStr = `${p.change24h >= 0 ? "+" : ""}${p.change24h.toFixed(2)}%`;
    const priceStr = p.price >= 1
      ? `$${p.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : p.price >= 0.01
        ? `$${p.price.toFixed(4)}`
        : `$${p.price.toFixed(8)}`;
    return `${p.ticker}: ${priceStr} (${changeStr})`;
  });
}