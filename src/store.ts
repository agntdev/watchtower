import { createRequire } from "node:module";
import type {
  User,
  WatchlistEntry,
  PriceThresholdAlert,
  PercentMoveRule,
  AlertHistoryRecord,
} from "./types.js";

interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
  keys(pattern: string): Promise<string[]>;
}

let client: RedisLike | null = null;
let store: Map<string, string>;
let useRedis = false;

function redisClient(): RedisLike {
  if (client) return client;
  const url = process.env.REDIS_URL;
  if (url) {
    const require = createRequire(import.meta.url);
    const ioredis: any = require("ioredis");
    const Redis = ioredis.default ?? ioredis.Redis ?? ioredis;
    client = new Redis(url, { maxRetriesPerRequest: null, lazyConnect: false }) as RedisLike;
    useRedis = true;
    store = new Map();
    return client;
  }
  store = new Map();
  client = {
    async get(key: string) { return store.get(key) ?? null; },
    async set(key: string, value: string) { store.set(key, value); },
    async del(key: string) { store.delete(key); },
    async keys(pattern: string) {
      const prefix = pattern.replace("*", "");
      return [...store.keys()].filter((k) => k.startsWith(prefix));
    },
  };
  return client;
}

async function get(key: string): Promise<string | null> {
  return redisClient().get(key);
}

async function set(key: string, value: string): Promise<void> {
  await redisClient().set(key, value);
}

async function del(key: string): Promise<void> {
  await redisClient().del(key);
}

export async function storeKeys(pattern: string): Promise<string[]> {
  return redisClient().keys(pattern);
}

async function keys(pattern: string): Promise<string[]> {
  return storeKeys(pattern);
}

const USR = "usr:";
const WL = "wl:";
const TA = "ta:";
const PM = "pm:";
const AH = "ah:";
const OWNER = "owner:identity";

export async function getOwnerId(): Promise<number | null> {
  const raw = await get(OWNER);
  return raw ? Number(raw) : null;
}

export async function setOwnerId(telegramId: number): Promise<void> {
  await set(OWNER, String(telegramId));
}

export async function getUser(telegramId: number): Promise<User> {
  const raw = await get(`${USR}${telegramId}`);
  if (raw) return JSON.parse(raw) as User;
  return {
    telegramId,
    timezone: "UTC",
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
    summaryTime: null,
    defaultFiat: "usd",
    cooldownMinutes: 60,
  };
}

export async function saveUser(user: User): Promise<void> {
  await set(`${USR}${user.telegramId}`, JSON.stringify(user));
}

export async function getUserCount(): Promise<number> {
  const all = await keys(`${USR}*`);
  return all.length;
}

export async function getWatchlistEntries(telegramId: number): Promise<WatchlistEntry[]> {
  const raw = await get(`${WL}${telegramId}`);
  return raw ? (JSON.parse(raw) as WatchlistEntry[]) : [];
}

export async function saveWatchlistEntries(telegramId: number, entries: WatchlistEntry[]): Promise<void> {
  await set(`${WL}${telegramId}`, JSON.stringify(entries));
}

export async function addWatchlistEntry(telegramId: number, entry: WatchlistEntry): Promise<void> {
  const entries = await getWatchlistEntries(telegramId);
  const existing = entries.findIndex(
    (e) => e.coinId === entry.coinId || e.ticker.toUpperCase() === entry.ticker.toUpperCase(),
  );
  if (existing >= 0) {
    entries[existing] = { ...entries[existing], ...entry, enabled: true };
  } else {
    entries.push(entry);
  }
  await saveWatchlistEntries(telegramId, entries);
}

export async function removeWatchlistEntry(telegramId: number, entryId: string): Promise<boolean> {
  const entries = await getWatchlistEntries(telegramId);
  const idx = entries.findIndex((e) => e.id === entryId);
  if (idx < 0) return false;
  entries.splice(idx, 1);
  await saveWatchlistEntries(telegramId, entries);
  return true;
}

export async function getThresholdAlerts(telegramId: number): Promise<PriceThresholdAlert[]> {
  const raw = await get(`${TA}${telegramId}`);
  return raw ? (JSON.parse(raw) as PriceThresholdAlert[]) : [];
}

export async function saveThresholdAlert(telegramId: number, alert: PriceThresholdAlert): Promise<void> {
  const alerts = await getThresholdAlerts(telegramId);
  alerts.push(alert);
  await set(`${TA}${telegramId}`, JSON.stringify(alerts));
}

export async function updateThresholdAlert(telegramId: number, alertId: string, patch: Partial<PriceThresholdAlert>): Promise<void> {
  const alerts = await getThresholdAlerts(telegramId);
  const idx = alerts.findIndex((a) => a.id === alertId);
  if (idx >= 0) {
    alerts[idx] = { ...alerts[idx], ...patch };
    await set(`${TA}${telegramId}`, JSON.stringify(alerts));
  }
}

export async function removeThresholdAlert(telegramId: number, alertId: string): Promise<boolean> {
  const alerts = await getThresholdAlerts(telegramId);
  const idx = alerts.findIndex((a) => a.id === alertId);
  if (idx < 0) return false;
  alerts.splice(idx, 1);
  await set(`${TA}${telegramId}`, JSON.stringify(alerts));
  return true;
}

export async function getPercentMoveRules(telegramId: number): Promise<PercentMoveRule[]> {
  const raw = await get(`${PM}${telegramId}`);
  return raw ? (JSON.parse(raw) as PercentMoveRule[]) : [];
}

export async function savePercentMoveRule(telegramId: number, rule: PercentMoveRule): Promise<void> {
  const rules = await getPercentMoveRules(telegramId);
  rules.push(rule);
  await set(`${PM}${telegramId}`, JSON.stringify(rules));
}

export async function updatePercentMoveRule(telegramId: number, ruleId: string, patch: Partial<PercentMoveRule>): Promise<void> {
  const rules = await getPercentMoveRules(telegramId);
  const idx = rules.findIndex((r) => r.id === ruleId);
  if (idx >= 0) {
    rules[idx] = { ...rules[idx], ...patch };
    await set(`${PM}${telegramId}`, JSON.stringify(rules));
  }
}

export async function removePercentMoveRule(telegramId: number, ruleId: string): Promise<boolean> {
  const rules = await getPercentMoveRules(telegramId);
  const idx = rules.findIndex((r) => r.id === ruleId);
  if (idx < 0) return false;
  rules.splice(idx, 1);
  await set(`${PM}${telegramId}`, JSON.stringify(rules));
  return true;
}

export async function getAlertHistory(telegramId: number, limit = 50): Promise<AlertHistoryRecord[]> {
  const raw = await get(`${AH}${telegramId}`);
  const history: AlertHistoryRecord[] = raw ? (JSON.parse(raw) as AlertHistoryRecord[]) : [];
  return history.slice(-limit).reverse();
}

export async function addAlertHistory(record: AlertHistoryRecord): Promise<void> {
  const key = `${AH}${record.telegramId}`;
  const raw = await get(key);
  const history: AlertHistoryRecord[] = raw ? (JSON.parse(raw) as AlertHistoryRecord[]) : [];
  history.push(record);
  if (history.length > 200) history.splice(0, history.length - 200);
  await set(key, JSON.stringify(history));
}

export async function getTotalAlertCount(): Promise<number> {
  const alertKeys = await storeKeys(`${AH}*`);
  let total = 0;
  for (const k of alertKeys) {
    const raw = await get(k);
    if (raw) {
      try { total += (JSON.parse(raw) as unknown[]).length; } catch { /* skip corrupt */ }
    }
  }
  return total;
}

export async function getTopAlertTickers(limit = 5): Promise<{ ticker: string; count: number }[]> {
  const alertKeys = await storeKeys(`${AH}*`);
  const counts = new Map<string, number>();
  for (const k of alertKeys) {
    const raw = await get(k);
    if (raw) {
      try {
        const records = JSON.parse(raw) as AlertHistoryRecord[];
        for (const r of records) {
          counts.set(r.ticker, (counts.get(r.ticker) ?? 0) + 1);
        }
      } catch { /* skip corrupt */ }
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([ticker, count]) => ({ ticker, count }));
}

export async function getAllUserIds(): Promise<number[]> {
  const userKeys = await storeKeys(`${USR}*`);
  return userKeys.map((k) => parseInt(k.slice(USR.length), 10)).filter((n) => !isNaN(n));
}

let _idCounter = 0;
export function generateId(): string {
  _idCounter++;
  return `${Date.now()}_${_idCounter}_${Math.random().toString(36).slice(2, 8)}`;
}
