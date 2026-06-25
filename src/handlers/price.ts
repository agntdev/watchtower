import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  registerMainMenuItem,
  inlineButton,
  inlineKeyboard,
} from "../toolkit/index.js";
import { getWatchlistEntries } from "../store.js";
import { fetchPrices } from "../coingecko.js";
import { getUser } from "../store.js";

registerMainMenuItem({ label: "💰 Price", data: "price:show", order: 20 });

const composer = new Composer<Ctx>();

function backRow() {
  return [inlineButton("⬅️ Back to menu", "menu:main")];
}

composer.command("price", async (ctx) => {
  const msg = ctx.message!;
  const arg = msg.text!.replace(/^\/price/, "").trim();
  if (arg) {
    await showSinglePrice(ctx, arg, false);
  } else {
    await showWatchlistPrices(ctx, undefined);
  }
});

composer.callbackQuery("price:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showWatchlistPrices(ctx, true);
});

async function showWatchlistPrices(ctx: Ctx, edit: true | undefined) {
  const user = await getUser(ctx.from!.id);
  const entries = await getWatchlistEntries(ctx.from!.id);
  if (entries.length === 0) {
    const text = "Your watchlist is empty. Add coins first to check prices.";
    const keyboard = inlineKeyboard([
      [inlineButton("➕ Add Coins", "watchlist:add")],
      backRow(),
    ]);
    if (edit) await ctx.editMessageText(text, { reply_markup: keyboard });
    else await ctx.reply(text, { reply_markup: keyboard });
    return;
  }

  const coinIds = entries.filter((e) => e.enabled).map((e) => e.coinId);
  if (coinIds.length === 0) {
    const text = "No enabled coins in your watchlist.";
    const keyboard = inlineKeyboard([backRow()]);
    if (edit) await ctx.editMessageText(text, { reply_markup: keyboard });
    else await ctx.reply(text, { reply_markup: keyboard });
    return;
  }

  const prices = await fetchPrices(coinIds, user.defaultFiat);
  const fiatLabel = user.defaultFiat.toUpperCase();

  if (prices.size === 0) {
    const text = "Could not fetch prices right now. Please try again later.";
    const keyboard = inlineKeyboard([backRow()]);
    if (edit) await ctx.editMessageText(text, { reply_markup: keyboard });
    else await ctx.reply(text, { reply_markup: keyboard });
    return;
  }

  const lines: string[] = [`💰 Prices (${fiatLabel}):`];
  for (const entry of entries) {
    if (!entry.enabled) continue;
    const price = prices.get(entry.coinId);
    if (price) {
      const changeStr =
        price.change24h !== null
          ? ` (${price.change24h >= 0 ? "+" : ""}${price.change24h.toFixed(2)}%)`
          : "";
      lines.push(`${entry.ticker}: ${formatPrice(price.price, fiatLabel)}${changeStr}`);
    } else {
      lines.push(`${entry.ticker}: unavailable`);
    }
  }

  const keyboard = inlineKeyboard([
    [inlineButton("🔄 Refresh", "price:show")],
    backRow(),
  ]);

  if (edit) await ctx.editMessageText(lines.join("\n"), { reply_markup: keyboard });
  else await ctx.reply(lines.join("\n"), { reply_markup: keyboard });
}

async function showSinglePrice(ctx: Ctx, ticker: string, edit: true | undefined | false) {
  const user = await getUser(ctx.from!.id);
  const fiatLabel = user.defaultFiat.toUpperCase();

  const { lookupTicker, searchCoins, fetchSinglePrice } = await import("../coingecko.js");

  const info = lookupTicker(ticker);
  if (!info) {
    const results = await searchCoins(ticker);
    if (results.length === 0) {
      const text = `No coin found for "${ticker}". Check the ticker and try again.`;
      const keyboard = inlineKeyboard([backRow()]);
      if (edit) await ctx.editMessageText(text, { reply_markup: keyboard });
      else await ctx.reply(text, { reply_markup: keyboard });
      return;
    }
    const price = await fetchSinglePrice(results[0].coinId, user.defaultFiat);
    if (!price) {
      const text = "Could not fetch price right now. Please try again later.";
      const keyboard = inlineKeyboard([backRow()]);
      if (edit) await ctx.editMessageText(text, { reply_markup: keyboard });
      else await ctx.reply(text, { reply_markup: keyboard });
      return;
    }
    const changeStr =
      price.change24h !== null
        ? ` (${price.change24h >= 0 ? "+" : ""}${price.change24h.toFixed(2)}%)`
        : "";
    const text = `💰 ${price.ticker}: ${formatPrice(price.price, fiatLabel)}${changeStr}`;
    const keyboard = inlineKeyboard([backRow()]);
    if (edit) await ctx.editMessageText(text, { reply_markup: keyboard });
    else await ctx.reply(text, { reply_markup: keyboard });
    return;
  }

  const price = await fetchSinglePrice(info.coinId, user.defaultFiat);
  if (!price) {
    const text = "Could not fetch price right now. Please try again later.";
    const keyboard = inlineKeyboard([backRow()]);
    if (edit) await ctx.editMessageText(text, { reply_markup: keyboard });
    else await ctx.reply(text, { reply_markup: keyboard });
    return;
  }
  const changeStr =
    price.change24h !== null
      ? ` (${price.change24h >= 0 ? "+" : ""}${price.change24h.toFixed(2)}%)`
      : "";
  const text = `💰 ${price.ticker}: ${formatPrice(price.price, fiatLabel)}${changeStr}`;
  const keyboard = inlineKeyboard([backRow()]);
  if (edit) await ctx.editMessageText(text, { reply_markup: keyboard });
  else await ctx.reply(text, { reply_markup: keyboard });
}

function formatPrice(price: number, fiat: string): string {
  if (price < 0.01) return `${fiat} ${price.toFixed(6)}`;
  if (price < 1) return `${fiat} ${price.toFixed(4)}`;
  if (price < 100) return `${fiat} ${price.toFixed(2)}`;
  return `${fiat} ${price.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default composer;
