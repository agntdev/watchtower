import { createRequire } from "node:module";

export interface UserRecord {
  chatId: number;
  timezone: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  summaryTime: string | null;
  defaultFiat: string;
  cooldownMinutes: number;
}

export interface WatchlistEntry {
  id: string;
  chatId: number;
  ticker: string;
  displayName: string;
  enabled: boolean;
}

export interface ThresholdAlert {
  id: string;
  chatId: number;
  ticker: string;
  direction: "above" | "below";
  threshold: number;
  enabled: boolean;
  createdAt: number;
}

export interface PercentRule {
  id: string;
  chatId: number;
  ticker: string;
  percentage: number;
  timeframeMinutes: number;
  direction: "up" | "down" | "either";
  enabled: boolean;
  createdAt: number;
}

export interface AlertHistory {
  id: string;
  chatId: number;
  alertType: "threshold" | "percent";
  coin: string;
  oldPrice: number;
  newPrice: number;
  percentChange: number;
  timestamp: number;
}

export interface OwnerRecord {
  chatId: number;
}

function key(prefix: string, id: string): string {
  return `wt:${prefix}:${id}`;
}

export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
  keys(pattern: string): Promise<string[]>;
}

class InMemoryStore {
  private store = new Map<string, string>();
  async get(key: string): Promise<string | null> { return this.store.get(key) ?? null; }
  async set(key: string, value: string): Promise<unknown> { this.store.set(key, value); return "OK"; }
  async del(key: string): Promise<unknown> { this.store.delete(key); return 1; }
  async keys(pattern: string): Promise<string[]> {
    const prefix = pattern.replace("*", "");
    return [...this.store.keys()].filter((k) => k.startsWith(prefix));
  }
}

let client: RedisLike | null = null;

export function _resetStore(): void {
  client = null;
}

function getClient(): RedisLike {
  if (client) return client;
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    const require = createRequire(import.meta.url);
    const ioredis: { default?: new (url: string, opts: object) => RedisLike; Redis?: new (url: string, opts: object) => RedisLike } = require("ioredis");
    const Redis = ioredis.default ?? ioredis.Redis ?? ioredis;
    client = new (Redis as new (url: string, opts: object) => RedisLike)(redisUrl, { maxRetriesPerRequest: null, lazyConnect: false }) as RedisLike;
  } else {
    client = new InMemoryStore();
  }
  return client;
}

function nextId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const store = {
  async getUser(chatId: number): Promise<UserRecord> {
    const c = getClient();
    const raw = await c.get(key("user", String(chatId)));
    if (raw) return JSON.parse(raw) as UserRecord;
    const defaults: UserRecord = {
      chatId,
      timezone: "UTC",
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
      summaryTime: null,
      defaultFiat: "USD",
      cooldownMinutes: 60,
    };
    await c.set(key("user", String(chatId)), JSON.stringify(defaults));
    return defaults;
  },

  async saveUser(user: UserRecord): Promise<void> {
    const c = getClient();
    await c.set(key("user", String(user.chatId)), JSON.stringify(user));
  },

  async getWatchlist(chatId: number): Promise<WatchlistEntry[]> {
    const c = getClient();
    const keys = await c.keys(key("wl", `${chatId}:*`));
    const entries: WatchlistEntry[] = [];
    for (const k of keys) {
      const raw = await c.get(k);
      if (raw) entries.push(JSON.parse(raw) as WatchlistEntry);
    }
    return entries.sort((a, b) => a.ticker.localeCompare(b.ticker));
  },

  async addToWatchlist(chatId: number, ticker: string, displayName: string): Promise<WatchlistEntry> {
    const c = getClient();
    const existing = await this.getWatchlist(chatId);
    const found = existing.find((e) => e.ticker.toLowerCase() === ticker.toLowerCase());
    if (found) {
      found.enabled = true;
      found.displayName = displayName;
      await c.set(key("wl", found.id), JSON.stringify(found));
      return found;
    }
    const entry: WatchlistEntry = {
      id: key("wl", `${chatId}:${nextId()}`),
      chatId,
      ticker: ticker.toUpperCase(),
      displayName,
      enabled: true,
    };
    await c.set(entry.id, JSON.stringify(entry));
    return entry;
  },

  async removeFromWatchlist(chatId: number, ticker: string): Promise<boolean> {
    const c = getClient();
    const wl = await this.getWatchlist(chatId);
    const entry = wl.find((e) => e.ticker.toLowerCase() === ticker.toLowerCase());
    if (!entry) return false;
    await c.del(entry.id);
    return true;
  },

  async getThresholdAlerts(chatId: number): Promise<ThresholdAlert[]> {
    const c = getClient();
    const keys = await c.keys(key("ta", `${chatId}:*`));
    const alerts: ThresholdAlert[] = [];
    for (const k of keys) {
      const raw = await c.get(k);
      if (raw) alerts.push(JSON.parse(raw) as ThresholdAlert);
    }
    return alerts;
  },

  async addThresholdAlert(chatId: number, ticker: string, direction: "above" | "below", threshold: number): Promise<ThresholdAlert> {
    const c = getClient();
    const alert: ThresholdAlert = {
      id: key("ta", `${chatId}:${nextId()}`),
      chatId,
      ticker: ticker.toUpperCase(),
      direction,
      threshold,
      enabled: true,
      createdAt: Date.now(),
    };
    await c.set(alert.id, JSON.stringify(alert));
    return alert;
  },

  async getPercentRules(chatId: number): Promise<PercentRule[]> {
    const c = getClient();
    const keys = await c.keys(key("pr", `${chatId}:*`));
    const rules: PercentRule[] = [];
    for (const k of keys) {
      const raw = await c.get(k);
      if (raw) rules.push(JSON.parse(raw) as PercentRule);
    }
    return rules;
  },

  async addPercentRule(chatId: number, ticker: string, percentage: number, timeframeMinutes: number, direction: "up" | "down" | "either"): Promise<PercentRule> {
    const c = getClient();
    const rule: PercentRule = {
      id: key("pr", `${chatId}:${nextId()}`),
      chatId,
      ticker: ticker.toUpperCase(),
      percentage,
      timeframeMinutes,
      direction,
      enabled: true,
      createdAt: Date.now(),
    };
    await c.set(rule.id, JSON.stringify(rule));
    return rule;
  },

  async getAllThresholdAlerts(): Promise<ThresholdAlert[]> {
    const c = getClient();
    const keys = await c.keys(key("ta", "*"));
    const alerts: ThresholdAlert[] = [];
    for (const k of keys) {
      const raw = await c.get(k);
      if (raw) alerts.push(JSON.parse(raw) as ThresholdAlert);
    }
    return alerts;
  },

  async getAllPercentRules(): Promise<PercentRule[]> {
    const c = getClient();
    const keys = await c.keys(key("pr", "*"));
    const rules: PercentRule[] = [];
    for (const k of keys) {
      const raw = await c.get(k);
      if (raw) rules.push(JSON.parse(raw) as PercentRule);
    }
    return rules;
  },

  async getAllUsers(): Promise<UserRecord[]> {
    const c = getClient();
    const keys = await c.keys(key("user", "*"));
    const users: UserRecord[] = [];
    for (const k of keys) {
      const raw = await c.get(k);
      if (raw) users.push(JSON.parse(raw) as UserRecord);
    }
    return users;
  },

  async addAlertHistory(chatId: number, alertType: "threshold" | "percent", coin: string, oldPrice: number, newPrice: number, percentChange: number): Promise<AlertHistory> {
    const c = getClient();
    const record: AlertHistory = {
      id: key("ah", `${chatId}:${nextId()}`),
      chatId,
      alertType,
      coin,
      oldPrice,
      newPrice,
      percentChange,
      timestamp: Date.now(),
    };
    await c.set(record.id, JSON.stringify(record));
    return record;
  },

  async getAlertHistory(chatId: number, limit = 20): Promise<AlertHistory[]> {
    const c = getClient();
    const keys = await c.keys(key("ah", `${chatId}:*`));
    const records: AlertHistory[] = [];
    for (const k of keys) {
      const raw = await c.get(k);
      if (raw) records.push(JSON.parse(raw) as AlertHistory);
    }
    return records.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  },

  async getAllAlertHistory(limit = 50): Promise<AlertHistory[]> {
    const c = getClient();
    const keys = await c.keys(key("ah", "*"));
    const records: AlertHistory[] = [];
    for (const k of keys) {
      const raw = await c.get(k);
      if (raw) records.push(JSON.parse(raw) as AlertHistory);
    }
    return records.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  },

  async getOwner(): Promise<OwnerRecord | null> {
    const c = getClient();
    const raw = await c.get("wt:owner");
    if (raw) return JSON.parse(raw) as OwnerRecord;
    return null;
  },

  async setOwner(chatId: number): Promise<void> {
    const c = getClient();
    await c.set("wt:owner", JSON.stringify({ chatId }));
  },

  async deleteAlert(prefix: string, chatId: number, alertId: string): Promise<boolean> {
    const c = getClient();
    const raw = await c.get(alertId);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { chatId: number };
    if (parsed.chatId !== chatId) return false;
    await c.del(alertId);
    return true;
  },

  async toggleAlert(prefix: string, chatId: number, alertId: string): Promise<boolean> {
    const c = getClient();
    const raw = await c.get(alertId);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { chatId: number; enabled: boolean };
    if (parsed.chatId !== chatId) return false;
    parsed.enabled = !parsed.enabled;
    await c.set(alertId, JSON.stringify(parsed));
    return parsed.enabled;
  },
};