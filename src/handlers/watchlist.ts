import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  registerMainMenuItem,
  inlineButton,
  inlineKeyboard,
  type InlineButton,
} from "../toolkit/index.js";
import { store } from "../services/store.js";
import { getPrices, suggestTicker, formatChange, formatPrice } from "../services/prices.js";

registerMainMenuItem({ label: "➕ Watchlist", data: "watchlist:manage", order: 10 });
registerMainMenuItem({ label: "💲 Price", data: "price:check", order: 20 });
registerMainMenuItem({ label: "🔔 Alerts", data: "alerts:list", order: 30 });
registerMainMenuItem({ label: "⚙️ Settings", data: "settings:menu", order: 40 });
registerMainMenuItem({ label: "📊 Admin", data: "admin:panel", order: 90 });

const composer = new Composer<Ctx>();

const backButton = [inlineButton("⬅️ Back to menu", "menu:main")];

// ── Watchlist management ──

composer.callbackQuery("watchlist:manage", async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const wl = await store.getWatchlist(chatId);
  const lines = wl.length
    ? wl.map((e) => `${e.enabled ? "✅" : "⏸️"} ${e.ticker} — ${e.displayName}`)
    : [];
  const text = wl.length
    ? `📋 Your watchlist:\n\n${lines.join("\n")}`
    : "📋 Your watchlist is empty.\n\nTap ➕ Add to add a coin.";
  const rows: InlineButton[][] = [
    [inlineButton("➕ Add", "watchlist:add:mode"), inlineButton("➖ Remove", "watchlist:remove")],
  ];
  if (wl.length > 0) {
    rows.push([inlineButton("💲 Check Prices", "price:watchlist")]);
  }
  rows.push(backButton);
  await ctx.editMessageText(text, { reply_markup: inlineKeyboard(rows) });
});

// ── Add coin flow ──

composer.callbackQuery("watchlist:add:mode", async (ctx) => {
  await ctx.answerCallbackQuery();
  const commonCoins = ["BTC", "ETH", "SOL", "XRP", "DOGE", "ADA", "DOT", "LTC", "AVAX", "LINK"];
  const rows: InlineButton[][] = [];
  for (let i = 0; i < commonCoins.length; i += 2) {
    rows.push(commonCoins.slice(i, i + 2).map((t) => inlineButton(t, `watchlist:add:${t}`)));
  }
  rows.push([inlineButton("🔍 Search...", "watchlist:search")]);
  rows.push(backButton);
  await ctx.editMessageText(
    "Add a coin to your watchlist:\n\nTap a popular coin or use 🔍 Search to find one by ticker.",
    { reply_markup: inlineKeyboard(rows) },
  );
});

for (const coin of ["BTC", "ETH", "SOL", "XRP", "DOGE", "ADA", "DOT", "LTC", "AVAX", "LINK"]) {
  composer.callbackQuery(`watchlist:add:${coin}`, async (ctx) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const entry = await store.addToWatchlist(chatId, coin, coin);
    await ctx.editMessageText(
      `✅ ${entry.ticker} added to your watchlist.`,
      { reply_markup: inlineKeyboard([
        [inlineButton("📋 View Watchlist", "watchlist:manage")],
        backButton,
      ]) },
    );
  });
}

// ── Search flow ──

composer.callbackQuery("watchlist:search", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    "Type the ticker symbol you want to add (e.g. BTC, ETH):",
    { reply_markup: inlineKeyboard([backButton]) },
  );
  ctx.session.watchlistSearching = true;
});

composer.on("message:text").filter(
  (ctx) => ctx.session.watchlistSearching === true,
  async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    ctx.session.watchlistSearching = false;
    ctx.session.messageHandled = true;
    const query = ctx.message?.text?.trim().toUpperCase();
    if (!query) return ctx.reply("Please enter a ticker symbol.", {
      reply_markup: inlineKeyboard([backButton]),
    });

    const suggestions = await suggestTicker(query).catch(() => [] as string[]);
    if (suggestions.length === 0) {
      await ctx.reply(`No coins found matching "${query}". Check the ticker and try again.`, {
        reply_markup: inlineKeyboard([backButton]),
      });
      return;
    }

    if (suggestions.length === 1) {
      const entry = await store.addToWatchlist(chatId, suggestions[0]!, suggestions[0]!);
      await ctx.reply(`✅ ${entry.ticker} added to your watchlist.`, {
        reply_markup: inlineKeyboard([
          [inlineButton("📋 View Watchlist", "watchlist:manage")],
          backButton,
        ]),
      });
      return;
    }

    const rows: InlineButton[][] = suggestions.map((s) => [
      inlineButton(s, `watchlist:add:search:${s}`),
    ]);
    rows.push(backButton);
    await ctx.reply("Multiple matches found. Tap one to add:", {
      reply_markup: inlineKeyboard(rows),
    });
  },
);

composer.callbackQuery(/^watchlist:add:search:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const ticker = ctx.match[1]!;
  const entry = await store.addToWatchlist(chatId, ticker, ticker);
  await ctx.editMessageText(`✅ ${entry.ticker} added to your watchlist.`, {
    reply_markup: inlineKeyboard([
      [inlineButton("📋 View Watchlist", "watchlist:manage")],
      backButton,
    ]),
  });
});

// ── Remove coin ──

composer.callbackQuery("watchlist:remove", async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const wl = await store.getWatchlist(chatId);
  if (wl.length === 0) {
    await ctx.editMessageText("Your watchlist is empty — nothing to remove.", {
      reply_markup: inlineKeyboard([backButton]),
    });
    return;
  }
  const rows: InlineButton[][] = wl.map((e) => [
    inlineButton(`❌ ${e.ticker}`, `watchlist:remove:${e.ticker}`),
  ]);
  rows.push(backButton);
  await ctx.editMessageText("Tap a coin to remove it from your watchlist:", {
    reply_markup: inlineKeyboard(rows),
  });
});

composer.callbackQuery(/^watchlist:remove:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const ticker = ctx.match[1]!;
  await store.removeFromWatchlist(chatId, ticker);
  await ctx.editMessageText(`✅ ${ticker} removed from your watchlist.`, {
    reply_markup: inlineKeyboard([
      [inlineButton("📋 View Watchlist", "watchlist:manage")],
      backButton,
    ]),
  });
});

// ── Price check ──

composer.callbackQuery("price:check", async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const user = await store.getUser(chatId);
  const wl = await store.getWatchlist(chatId);
  const enabled = wl.filter((e) => e.enabled);
  const rows: InlineButton[][] = [];
  if (enabled.length > 0) {
    rows.push([inlineButton("📋 Full Watchlist", "price:watchlist")]);
  }
  rows.push([inlineButton("🔍 Search Ticker", "price:search")]);
  rows.push(backButton);
  await ctx.editMessageText(
    "Check current prices: tap your watchlist or search for a specific coin.",
    { reply_markup: inlineKeyboard(rows) },
  );
});

composer.callbackQuery("price:watchlist", async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const wl = await store.getWatchlist(chatId);
  const enabled = wl.filter((e) => e.enabled);
  if (enabled.length === 0) {
    await ctx.editMessageText(
      "Your watchlist is empty. Add coins first using ➕ Watchlist.",
      { reply_markup: inlineKeyboard([backButton]) },
    );
    return;
  }

  try {
    const tickers = enabled.map((e) => e.ticker);
    const prices = await getPrices(tickers);
    const lines = prices.map((p) => {
      const changeStr = `${p.change24h >= 0 ? "+" : ""}${p.change24h.toFixed(2)}%`;
      const priceStr = p.price >= 1
        ? `$${p.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : p.price >= 0.01
          ? `$${p.price.toFixed(4)}`
          : `$${p.price.toFixed(8)}`;
      return `${p.ticker}: ${priceStr} (${changeStr})`;
    });
    if (lines.length === 0) {
      lines.push("No price data available right now.");
    }
    await ctx.editMessageText(`📊 Prices:\n\n${lines.join("\n")}`, {
      reply_markup: inlineKeyboard([backButton]),
    });
  } catch {
    await ctx.editMessageText(
      "Could not fetch prices right now. Please try again in a moment.",
      { reply_markup: inlineKeyboard([backButton]) },
    );
  }
});

composer.callbackQuery("price:search", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("Type a ticker symbol to check its price:", {
    reply_markup: inlineKeyboard([backButton]),
  });
  ctx.session.priceSearching = true;
});

composer.on("message:text").filter(
  (ctx) => ctx.session.priceSearching === true,
  async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    ctx.session.priceSearching = false;
    ctx.session.messageHandled = true;
    const query = ctx.message?.text?.trim().toUpperCase();
    if (!query) {
      await ctx.reply("Please enter a ticker symbol.", {
        reply_markup: inlineKeyboard([backButton]),
      });
      return;
    }

    try {
      const prices = await getPrices([query]);
      if (prices.length === 0 || prices[0]!.price === 0) {
        await ctx.reply(`No price data found for "${query}". Check the ticker symbol.`, {
          reply_markup: inlineKeyboard([backButton]),
        });
        return;
      }
      const p = prices[0]!;
      const changeStr = `${p.change24h >= 0 ? "+" : ""}${p.change24h.toFixed(2)}%`;
      const priceStr = p.price >= 1
        ? `$${p.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : p.price >= 0.01
          ? `$${p.price.toFixed(4)}`
          : `$${p.price.toFixed(8)}`;
      await ctx.reply(`${p.ticker}: ${priceStr} (24h: ${changeStr})`, {
        reply_markup: inlineKeyboard([backButton]),
      });
    } catch {
      await ctx.reply("Could not fetch prices right now. Please try again in a moment.", {
        reply_markup: inlineKeyboard([backButton]),
      });
    }
  },
);

// ── /list command ──

composer.command("list", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const wl = await store.getWatchlist(chatId);
  if (wl.length === 0) {
    await ctx.reply("Your watchlist is empty. Tap the menu to add coins.", {
      reply_markup: inlineKeyboard([
        [inlineButton("➕ Add Coins", "watchlist:add:mode")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
    return;
  }
  const lines = wl.map((e) => `${e.enabled ? "✅" : "⏸️"} ${e.ticker} — ${e.displayName}`);
  await ctx.reply(`📋 Your watchlist:\n\n${lines.join("\n")}`, {
    reply_markup: inlineKeyboard([
      [inlineButton("➕ Add", "watchlist:add:mode"), inlineButton("➖ Remove", "watchlist:remove")],
      [inlineButton("💲 Check Prices", "price:watchlist")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

// ── /price command ──

composer.command("price", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const arg = ctx.message?.text?.split(/\s+/)[1]?.trim().toUpperCase();
  if (arg) {
    try {
      const prices = await getPrices([arg]);
      if (prices.length === 0 || prices[0]!.price === 0) {
        await ctx.reply(`No price data found for "${arg}". Check the ticker.`, {
          reply_markup: inlineKeyboard([backButton]),
        });
        return;
      }
      const p = prices[0]!;
      const changeStr = `${p.change24h >= 0 ? "+" : ""}${p.change24h.toFixed(2)}%`;
      const priceStr = p.price >= 1
        ? `$${p.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : p.price >= 0.01
          ? `$${p.price.toFixed(4)}`
          : `$${p.price.toFixed(8)}`;
      await ctx.reply(`${p.ticker}: ${priceStr} (24h: ${changeStr})`, {
        reply_markup: inlineKeyboard([backButton]),
      });
      return;
    } catch {
      await ctx.reply("Could not fetch price. Please try again.", {
        reply_markup: inlineKeyboard([backButton]),
      });
      return;
    }
  }

  const wl = await store.getWatchlist(chatId);
  const enabled = wl.filter((e) => e.enabled);
  if (enabled.length === 0) {
    await ctx.reply(
      "Your watchlist is empty. Tap the menu to add coins, or use /price TICKER to check one.",
      { reply_markup: inlineKeyboard([backButton]) },
    );
    return;
  }
  try {
    const tickers = enabled.map((e) => e.ticker);
    const prices = await getPrices(tickers);
    const lines = prices.map((p) => {
      const changeStr = `${p.change24h >= 0 ? "+" : ""}${p.change24h.toFixed(2)}%`;
      const priceStr = p.price >= 1
        ? `$${p.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : p.price >= 0.01
          ? `$${p.price.toFixed(4)}`
          : `$${p.price.toFixed(8)}`;
      return `${p.ticker}: ${priceStr} (${changeStr})`;
    });
    if (lines.length === 0) lines.push("No price data available right now.");
    await ctx.reply(`📊 Prices:\n\n${lines.join("\n")}`, {
      reply_markup: inlineKeyboard([backButton]),
    });
  } catch {
    await ctx.reply("Could not fetch prices right now. Please try again.", {
      reply_markup: inlineKeyboard([backButton]),
    });
  }
});

// ── /add command ──

composer.command("add", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const arg = ctx.message?.text?.split(/\s+/)[1]?.trim().toUpperCase();
  if (!arg) {
    const commonCoins = ["BTC", "ETH", "SOL", "XRP", "DOGE", "ADA", "DOT", "LTC", "AVAX", "LINK"];
    const rows: InlineButton[][] = [];
    for (let i = 0; i < commonCoins.length; i += 2) {
      rows.push(commonCoins.slice(i, i + 2).map((t) => inlineButton(t, `watchlist:add:${t}`)));
    }
    rows.push([inlineButton("⬅️ Back to menu", "menu:main")]);
    await ctx.reply(
      "Add a coin to your watchlist. Tap a popular coin or type /add TICKER:",
      { reply_markup: inlineKeyboard(rows) },
    );
    return;
  }
  const suggestions = await suggestTicker(arg).catch(() => [] as string[]);
  if (suggestions.length === 0) {
    await ctx.reply(`No coins found matching "${arg}". Check the ticker and try again.`, {
      reply_markup: inlineKeyboard([backButton]),
    });
    return;
  }
  const ticker = suggestions[0]!;
  await store.addToWatchlist(chatId, ticker, ticker);
  await ctx.reply(`✅ ${ticker} added to your watchlist.`, {
    reply_markup: inlineKeyboard([backButton]),
  });
});

// ── /remove command ──

composer.command("remove", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const arg = ctx.message?.text?.split(/\s+/)[1]?.trim().toUpperCase();
  const wl = await store.getWatchlist(chatId);

  if (arg) {
    const removed = await store.removeFromWatchlist(chatId, arg);
    if (removed) {
      await ctx.reply(`✅ ${arg} removed from your watchlist.`, {
        reply_markup: inlineKeyboard([backButton]),
      });
    } else {
      await ctx.reply(`${arg} is not in your watchlist.`, {
        reply_markup: inlineKeyboard([backButton]),
      });
    }
    return;
  }

  if (wl.length === 0) {
    await ctx.reply("Your watchlist is empty — nothing to remove.", {
      reply_markup: inlineKeyboard([backButton]),
    });
    return;
  }
  const rows: InlineButton[][] = wl.map((e) => [
    inlineButton(`❌ ${e.ticker}`, `watchlist:remove:${e.ticker}`),
  ]);
  rows.push(backButton);
  await ctx.reply("Tap a coin to remove it from your watchlist:", {
    reply_markup: inlineKeyboard(rows),
  });
});

export default composer;