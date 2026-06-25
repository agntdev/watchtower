import type { Bot } from "grammy";
import type { Ctx } from "./bot.js";
import {
  getThresholdAlerts,
  updateThresholdAlert,
  getPercentMoveRules,
  updatePercentMoveRule,
  addAlertHistory,
  getAlertHistory,
  getUser,
  getAllUserIds,
  getWatchlistEntries,
} from "./store.js";
import { fetchPrices } from "./coingecko.js";
import { inlineButton, inlineKeyboard } from "./toolkit/index.js";

let pollingInterval: ReturnType<typeof setInterval> | null = null;
let summaryInterval: ReturnType<typeof setInterval> | null = null;
let botInstance: Bot<Ctx> | null = null;

export function startAlertMonitor(bot: Bot<Ctx>) {
  botInstance = bot;
  if (pollingInterval) clearInterval(pollingInterval);
  if (summaryInterval) clearInterval(summaryInterval);

  pollingInterval = setInterval(checkAlerts, 5 * 60 * 1000);
  summaryInterval = setInterval(checkMorningSummaries, 60 * 1000);

  setTimeout(() => void checkAlerts(), 10_000);
}

export function stopAlertMonitor() {
  if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
  if (summaryInterval) { clearInterval(summaryInterval); summaryInterval = null; }
  botInstance = null;
}

const TZ_OFFSETS: Record<string, number> = {
  "UTC": 0, "GMT": 0, "UTC+0": 0, "UTC-0": 0,
  "EST": -300, "EDT": -240, "CST": -360, "CDT": -300,
  "MST": -420, "MDT": -360, "PST": -480, "PDT": -420,
};

function parseTimezoneOffset(tz: string): number {
  const trimmed = tz.trim().toUpperCase();
  if (TZ_OFFSETS[trimmed] !== undefined) return TZ_OFFSETS[trimmed];
  const m = trimmed.match(/^UTC([+-]\d{1,2})(?::(\d{2}))?$/);
  if (m) {
    const h = parseInt(m[1], 10);
    const mins = m[2] ? parseInt(m[2], 10) : 0;
    return (h * 60) + (h >= 0 ? mins : -mins);
  }
  return 0;
}

function getLocalMinutes(tz: string): number {
  const now = new Date();
  const offsetMinutes = parseTimezoneOffset(tz);
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  return (utcMinutes + offsetMinutes + 1440) % 1440;
}

function isInQuietHours(user: { quietHoursStart: string; quietHoursEnd: string; timezone: string }): boolean {
  const currentMinutes = getLocalMinutes(user.timezone);

  const parseTime = (t: string): number => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };

  const start = parseTime(user.quietHoursStart);
  const end = parseTime(user.quietHoursEnd);

  if (start === 0 && end === 0) return false;

  if (start <= end) {
    return currentMinutes >= start && currentMinutes < end;
  }
  return currentMinutes >= start || currentMinutes < end;
}

async function checkAlerts() {
  if (!botInstance) return;

  const allUserIds = await getAllUserIds();
  const coinSet = new Set<string>();

  for (const uid of allUserIds) {
    const thresholds = await getThresholdAlerts(uid);
    const percents = await getPercentMoveRules(uid);
    for (const a of thresholds) { if (a.enabled) coinSet.add(a.coinId); }
    for (const p of percents) { if (p.enabled) coinSet.add(p.coinId); }
  }

  if (coinSet.size === 0) return;

  const coinIds = [...coinSet];
  const prices = await fetchPrices(coinIds, "usd");
  if (prices.size === 0) return;

  for (const uid of allUserIds) {
    const user = await getUser(uid);
    const thresholds = await getThresholdAlerts(uid);
    const percents = await getPercentMoveRules(uid);

    const now = Date.now();
    const quiet = isInQuietHours(user);

    for (const alert of thresholds) {
      if (!alert.enabled) continue;
      const price = prices.get(alert.coinId);
      if (!price || price.price == null) continue;

      const triggered =
        (alert.direction === "above" && price.price > alert.threshold) ||
        (alert.direction === "below" && price.price < alert.threshold);
      if (!triggered) continue;

      const ago = alert.lastTriggeredAt ? now - alert.lastTriggeredAt : Infinity;
      if (ago < user.cooldownMinutes * 60 * 1000) continue;

      await updateThresholdAlert(uid, alert.id, { lastTriggeredAt: now });

      const oldPrice = alert.threshold;
      const pctChange = ((price.price - oldPrice) / oldPrice) * 100;
      const dirLabel = alert.direction === "above" ? "↑ above" : "↓ below";

      await addAlertHistory({
        id: `ah_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        telegramId: uid,
        alertType: "threshold",
        coinId: alert.coinId,
        ticker: alert.ticker,
        oldPrice,
        newPrice: price.price,
        percentChange: pctChange,
        timestamp: now,
      });

      if (quiet) continue;

      try {
        await botInstance.api.sendMessage(
          uid,
          `🚨 ${alert.ticker} is ${dirLabel} $${alert.threshold.toLocaleString("en")}\n` +
          `Current price: $${price.price.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ` +
          `(${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(2)}%)`,
          {
            reply_markup: inlineKeyboard([[
              inlineButton("🔕 Snooze 1h", `alert:snooze:threshold:${alert.id}`),
              inlineButton("⛔ Disable", `alert:disable:threshold:${alert.id}`),
            ]]),
          },
        );
      } catch {
        // User may have blocked bot
      }
    }

    for (const rule of percents) {
      if (!rule.enabled) continue;
      const price = prices.get(rule.coinId);
      if (!price || price.price == null) continue;

      if (rule.basePrice === null) {
        await updatePercentMoveRule(uid, rule.id, {
          basePrice: price.price,
          basePriceSetAt: now,
        });
        continue;
      }

      const elapsed = now - (rule.basePriceSetAt ?? 0);
      if (elapsed < rule.timeframeMinutes * 60 * 1000 && elapsed > 0) continue;

      const pctChange = ((price.price - rule.basePrice) / rule.basePrice) * 100;
      const absPct = Math.abs(pctChange);

      let triggered = false;
      if (rule.direction === "up" && pctChange >= rule.percentage) triggered = true;
      else if (rule.direction === "down" && pctChange <= -rule.percentage) triggered = true;
      else if (rule.direction === "both" && absPct >= rule.percentage) triggered = true;

      if (!triggered) {
        await updatePercentMoveRule(uid, rule.id, {
          basePrice: price.price,
          basePriceSetAt: now,
        });
        continue;
      }

      const ago = rule.lastTriggeredAt ? now - rule.lastTriggeredAt : Infinity;
      if (ago < user.cooldownMinutes * 60 * 1000) {
        await updatePercentMoveRule(uid, rule.id, {
          basePrice: price.price,
          basePriceSetAt: now,
        });
        continue;
      }

      await updatePercentMoveRule(uid, rule.id, {
        basePrice: price.price,
        basePriceSetAt: now,
        lastTriggeredAt: now,
      });

      const dirLabel = pctChange >= 0 ? "↑ up" : "↓ down";

      await addAlertHistory({
        id: `ah_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        telegramId: uid,
        alertType: "percent_move",
        coinId: rule.coinId,
        ticker: rule.ticker,
        oldPrice: rule.basePrice,
        newPrice: price.price,
        percentChange: pctChange,
        timestamp: now,
      });

      if (quiet) continue;

      try {
        const tfLabel = rule.timeframeMinutes >= 60
          ? `${rule.timeframeMinutes / 60}h`
          : `${rule.timeframeMinutes}m`;
        await botInstance.api.sendMessage(
          uid,
          `🚨 ${rule.ticker} moved ${dirLabel} ${absPct.toFixed(1)}% in ${tfLabel}\n` +
          `Current price: $${price.price.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`,
          {
            reply_markup: inlineKeyboard([[
              inlineButton("🔕 Snooze 1h", `alert:snooze:percent:${rule.id}`),
              inlineButton("⛔ Disable", `alert:disable:percent:${rule.id}`),
            ]]),
          },
        );
      } catch {
        // User may have blocked bot
      }
    }
  }
}

async function checkMorningSummaries() {
  if (!botInstance) return;

  const allUserIds = await getAllUserIds();

  for (const uid of allUserIds) {
    const user = await getUser(uid);
    if (!user.summaryTime) continue;

    const localMinutes = getLocalMinutes(user.timezone);
    const localH = Math.floor(localMinutes / 60);
    const localM = localMinutes % 60;
    const localTime = `${String(localH).padStart(2, "0")}:${String(localM).padStart(2, "0")}`;
    if (user.summaryTime !== localTime) continue;

    const entries = await getWatchlistEntries(uid);
    if (entries.length === 0) continue;

    const coinIds = entries.filter((e) => e.enabled).map((e) => e.coinId);
    if (coinIds.length === 0) continue;

    const prices = await fetchPrices(coinIds, user.defaultFiat);
    if (prices.size === 0) continue;

    const history = await getAlertHistory(uid, 5);
    const fiatLabel = user.defaultFiat.toUpperCase();

    const lines: string[] = [`🌅 Morning Summary — ${fiatLabel}`];

    for (const entry of entries) {
      if (!entry.enabled) continue;
      const price = prices.get(entry.coinId);
      if (price) {
        const changeStr =
          price.change24h !== null
            ? ` (${price.change24h >= 0 ? "+" : ""}${price.change24h.toFixed(2)}%)`
            : "";
        const priceNum = price.price;
        lines.push(
          `${entry.ticker}: ${fiatLabel} ${priceNum < 0.01 ? priceNum.toFixed(6) : priceNum < 1 ? priceNum.toFixed(4) : priceNum.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${changeStr}`,
        );
      }
    }

    if (history.length > 0) {
      lines.push("\n📊 Recent alerts:");
      for (const h of history.slice(0, 3)) {
        const type = h.alertType === "threshold" ? "⚡" : "📈";
        const dir = h.newPrice > h.oldPrice ? "↑" : "↓";
        lines.push(`${type} ${h.ticker} ${dir} ${Math.abs(h.percentChange).toFixed(1)}%`);
      }
    }

    lines.push("\nHave a great day! ☀️");

    try {
      await botInstance.api.sendMessage(uid, lines.join("\n"));
    } catch {
      // User may have blocked bot
    }
  }
}
