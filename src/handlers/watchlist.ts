import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  registerMainMenuItem,
  inlineButton,
  inlineKeyboard,
  confirmKeyboard,
  menuKeyboard,
} from "../toolkit/index.js";
import {
  getWatchlistEntries,
  addWatchlistEntry,
  removeWatchlistEntry,
  generateId,
} from "../store.js";
import { getCommonCoins, lookupTicker, searchCoins } from "../coingecko.js";
import type { Session } from "../bot.js";

interface WatchlistSession extends Session {
  watchlistStep?: "awaiting_ticker";
  removePage?: number;
}

type WlCtx = Ctx & { session: WatchlistSession };

registerMainMenuItem({ label: "📋 Watchlist", data: "watchlist:list", order: 10 });

const composer = new Composer<WlCtx>();

function backRow() {
  return [inlineButton("⬅️ Back to menu", "menu:main")];
}

composer.command(["add", "list", "remove"], async (ctx) => {
  const cmd = ctx.message!.text!.replace(/^\//, "").split(" ")[0].split("@")[0];
  if (cmd === "add") {
    await showAddCoins(ctx, undefined);
  } else if (cmd === "remove") {
    await showRemoveFlow(ctx, undefined);
  } else {
    await showWatchlist(ctx, undefined);
  }
});

composer.callbackQuery("watchlist:list", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showWatchlist(ctx, true);
});

async function showWatchlist(ctx: WlCtx, edit: true | undefined) {
  const entries = await getWatchlistEntries(ctx.from!.id);
  if (entries.length === 0) {
    const text = "Your watchlist is empty. Tap ➕ Add to track a coin.";
    const keyboard = inlineKeyboard([
      [inlineButton("➕ Add", "watchlist:add")],
      backRow(),
    ]);
    if (edit) await ctx.editMessageText(text, { reply_markup: keyboard });
    else await ctx.reply(text, { reply_markup: keyboard });
    return;
  }

  const lines = ["📋 Your Watchlist:"];
  for (const e of entries) {
    const status = e.enabled ? "✅" : "⛔";
    lines.push(`${status} ${e.ticker} — ${e.displayName}`);
  }

  const keyboard = inlineKeyboard([
    [inlineButton("➕ Add", "watchlist:add"), inlineButton("➖ Remove", "watchlist:remove")],
    backRow(),
  ]);

  if (edit) await ctx.editMessageText(lines.join("\n"), { reply_markup: keyboard });
  else await ctx.reply(lines.join("\n"), { reply_markup: keyboard });
}

async function showAddCoins(ctx: WlCtx, edit: true | undefined) {
  const coins = getCommonCoins();
  const rows: { text: string; data: string }[] = coins.map((c) => ({
    text: `${c.ticker} — ${c.name}`,
    data: `watchlist:add_coin:${c.coinId}:${c.ticker}`,
  }));
  rows.push({ text: "🔍 Search custom coin", data: "watchlist:search_prompt" });
  rows.push({ text: "⬅️ Back", data: "watchlist:list" });

  const text = "Select a coin to track, or search for a custom one:";
  const keyboard = menuKeyboard(rows, 2);
  if (edit) await ctx.editMessageText(text, { reply_markup: keyboard });
  else await ctx.reply(text, { reply_markup: keyboard });
}

async function showRemoveFlow(ctx: WlCtx, edit: true | undefined) {
  const entries = await getWatchlistEntries(ctx.from!.id);
  if (entries.length === 0) {
    const text = "Your watchlist is empty — nothing to remove.";
    const keyboard = inlineKeyboard([backRow()]);
    if (edit) await ctx.editMessageText(text, { reply_markup: keyboard });
    else await ctx.reply(text, { reply_markup: keyboard });
    return;
  }

  const rows = entries.map((e) => [
    inlineButton(`❌ ${e.ticker} — ${e.displayName}`, `watchlist:remove_confirm:${e.id}`),
  ]);
  rows.push(backRow());
  const text = "Select a coin to remove from your watchlist:";
  if (edit) await ctx.editMessageText(text, { reply_markup: inlineKeyboard(rows) });
  else await ctx.reply(text, { reply_markup: inlineKeyboard(rows) });
}

composer.callbackQuery("watchlist:add", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showAddCoins(ctx, true);
});

composer.callbackQuery(/^watchlist:add_coin:(.+):(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const coinId = ctx.match[1];
  const ticker = ctx.match[2];

  const commonCoin = lookupTicker(ticker);
  const entry = {
    id: generateId(),
    telegramId: ctx.from!.id,
    coinId,
    ticker: ticker.toUpperCase(),
    displayName: commonCoin?.name ?? coinId,
    enabled: true,
    createdAt: Date.now(),
  };

  await addWatchlistEntry(ctx.from!.id, entry);
  await ctx.editMessageText(
    `✅ Added ${ticker.toUpperCase()} to your watchlist.`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("📋 View Watchlist", "watchlist:list")],
        [inlineButton("➕ Add Another", "watchlist:add")],
        backRow(),
      ]),
    },
  );
});

composer.callbackQuery("watchlist:search_prompt", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.watchlistStep = "awaiting_ticker";
  await ctx.editMessageText(
    "Enter a coin ticker or name (e.g. PEPE, SHIB):",
    { reply_markup: inlineKeyboard([backRow()]) },
  );
});

composer.on("message:text").filter(
  (ctx) => (ctx.session as WatchlistSession).watchlistStep === "awaiting_ticker",
  async (ctx) => {
    const query = ctx.message.text.trim();
    ctx.session.watchlistStep = undefined;

    const results = await searchCoins(query);
    if (results.length === 0) {
      await ctx.reply(
        `No coins found for "${query}". Try a different ticker.`,
        { reply_markup: inlineKeyboard([[inlineButton("🔍 Try Again", "watchlist:search_prompt")], backRow()]) },
      );
      return;
    }

    if (results.length === 1) {
      const c = results[0];
      const entry = {
        id: generateId(),
        telegramId: ctx.from!.id,
        coinId: c.coinId,
        ticker: c.ticker,
        displayName: c.name,
        enabled: true,
        createdAt: Date.now(),
      };
      await addWatchlistEntry(ctx.from!.id, entry);
      await ctx.reply(
        `✅ Added ${c.ticker} (${c.name}) to your watchlist.`,
        {
          reply_markup: inlineKeyboard([
            [inlineButton("📋 View Watchlist", "watchlist:list")],
            backRow(),
          ]),
        },
      );
      return;
    }

    const rows = results.map((c) => [
      inlineButton(
        `${c.ticker} — ${c.name}`,
        `watchlist:add_coin:${c.coinId}:${c.ticker}`,
      ),
    ]);
    await ctx.reply(
      `Multiple matches for "${query}". Select the right one:`,
      { reply_markup: inlineKeyboard([...rows, backRow()]) },
    );
  },
);

composer.callbackQuery("watchlist:remove", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showRemoveFlow(ctx, true);
});

composer.callbackQuery(/^watchlist:remove_confirm:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const entryId = ctx.match[1];
  const entries = await getWatchlistEntries(ctx.from!.id);
  const entry = entries.find((e) => e.id === entryId);
  if (!entry) {
    await ctx.editMessageText(
      "Coin not found in your watchlist.",
      { reply_markup: inlineKeyboard([backRow()]) },
    );
    return;
  }

  await ctx.editMessageText(
    `Remove ${entry.ticker} (${entry.displayName}) from your watchlist?`,
    { reply_markup: confirmKeyboard(`watchlist:do_remove:${entryId}`) },
  );
});

composer.callbackQuery(/^watchlist:do_remove:(.+):yes$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const entryId = ctx.match[1];
  await removeWatchlistEntry(ctx.from!.id, entryId);
  await ctx.editMessageText(
    "✅ Removed from your watchlist.",
    {
      reply_markup: inlineKeyboard([
        [inlineButton("📋 View Watchlist", "watchlist:list")],
        backRow(),
      ]),
    },
  );
});

composer.callbackQuery(/^watchlist:do_remove:(.+):no$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    "Cancelled — coin was not removed.",
    { reply_markup: inlineKeyboard([backRow()]) },
  );
});

export default composer;
