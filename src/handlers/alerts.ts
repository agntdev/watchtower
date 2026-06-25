import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, type InlineButton } from "../toolkit/index.js";
import { store } from "../services/store.js";

const backButton = [inlineButton("⬅️ Back to menu", "menu:main")];

const composer = new Composer<Ctx>();

// ── Alerts list ──

composer.callbackQuery("alerts:list", async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const thresholds = await store.getThresholdAlerts(chatId);
  const rules = await store.getPercentRules(chatId);

  if (thresholds.length === 0 && rules.length === 0) {
    await ctx.editMessageText(
      "No alerts configured yet.\n\nTap a button below to create one.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("📈 Threshold Alert", "alerts:threshold:menu"), inlineButton("📊 Percent Move", "alerts:percent:menu")],
          backButton,
        ]),
      },
    );
    return;
  }

  const lines: string[] = [];
  if (thresholds.length > 0) {
    lines.push("📈 *Threshold Alerts:*");
    for (const a of thresholds) {
      const status = a.enabled ? "✅" : "⏸️";
      const dir = a.direction === "above" ? "above" : "below";
      lines.push(`${status} ${a.ticker} ${dir} $${a.threshold.toLocaleString()}`);
    }
  }
  if (rules.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("📊 *Percent Move Alerts:*");
    for (const r of rules) {
      const status = r.enabled ? "✅" : "⏸️";
      lines.push(`${status} ${r.ticker} ${r.direction} ${r.percentage}% / ${r.timeframeMinutes}m`);
    }
  }

  const rows: InlineButton[][] = [
    [inlineButton("📈 New Threshold", "alerts:threshold:menu"), inlineButton("📊 New % Rule", "alerts:percent:menu")],
  ];

  const allAlerts = [
    ...thresholds.map((a) => ({ id: a.id, ticker: a.ticker, enabled: a.enabled, prefix: "toggle:ta" })),
    ...rules.map((r) => ({ id: r.id, ticker: r.ticker, enabled: r.enabled, prefix: "toggle:pr" })),
  ];
  if (allAlerts.length > 0) {
    rows.push([inlineButton("🔘 Toggle Alerts", "alerts:toggle:list")]);
    rows.push([inlineButton("🗑️ Delete Alerts", "alerts:delete:list")]);
  }

  rows.push(backButton);
  await ctx.editMessageText(lines.join("\n"), {
    reply_markup: inlineKeyboard(rows),
    parse_mode: "Markdown",
  });
});

// ── Threshold Alert flow ──

composer.callbackQuery("alerts:threshold:menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const wl = await store.getWatchlist(chatId);
  const enabled = wl.filter((e) => e.enabled);

  if (enabled.length === 0) {
    await ctx.editMessageText(
      "Add coins to your watchlist first, then create alerts for them.",
      { reply_markup: inlineKeyboard([backButton]) },
    );
    return;
  }

  const rows: InlineButton[][] = enabled.map((e) => [
    inlineButton(e.ticker, `alerts:threshold:ticker:${e.ticker}`),
  ]);
  rows.push(backButton);
  await ctx.editMessageText("Choose a coin for the threshold alert:", {
    reply_markup: inlineKeyboard(rows),
  });
});

composer.callbackQuery(/^alerts:threshold:ticker:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const ticker = ctx.match[1]!;
  ctx.session.settingThresholdTicker = ticker;
  ctx.session.settingThresholdDir = undefined;
  await ctx.editMessageText(
    `Alert for ${ticker}: should it fire when the price goes Above or Below the threshold?`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("⬆️ Above", `alerts:threshold:dir:above`), inlineButton("⬇️ Below", `alerts:threshold:dir:below`)],
        backButton,
      ]),
    },
  );
});

composer.callbackQuery(/^alerts:threshold:dir:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const dir = ctx.match[1]! as "above" | "below";
  ctx.session.settingThresholdDir = dir;
  const ticker = ctx.session.settingThresholdTicker;
  if (!ticker) {
    await ctx.editMessageText("Something went wrong. Please try again.", {
      reply_markup: inlineKeyboard([backButton]),
    });
    return;
  }
  await ctx.editMessageText(
    `Set the threshold price for ${ticker} (${dir}):\n\nType the price in USD, e.g. 50000:`,
    { reply_markup: inlineKeyboard([backButton]) },
  );
  ctx.session.priceSearching = undefined;
});

composer.on("message:text").filter(
  (ctx) => ctx.session.settingThresholdTicker !== undefined && ctx.session.settingThresholdDir !== undefined && !ctx.session.watchlistSearching && !ctx.session.priceSearching && !ctx.session.settingPercentRuleTicker && !ctx.session.settingPercentRulePct,
  async (ctx) => {
    ctx.session.messageHandled = true;
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const ticker = ctx.session.settingThresholdTicker!;
    const dir = ctx.session.settingThresholdDir! as "above" | "below";
    ctx.session.settingThresholdTicker = undefined;
    ctx.session.settingThresholdDir = undefined;

    const val = parseFloat(ctx.message?.text?.trim() ?? "");
    if (isNaN(val) || val <= 0) {
      await ctx.reply("Please enter a valid positive number for the price.", {
        reply_markup: inlineKeyboard([backButton]),
      });
      ctx.session.settingThresholdTicker = ticker;
      ctx.session.settingThresholdDir = dir;
      return;
    }

    await store.addThresholdAlert(chatId, ticker, dir, val);
    await ctx.reply(
      `✅ Threshold alert set: ${ticker} ${dir} $${val.toLocaleString()}`,
      { reply_markup: inlineKeyboard([
        [inlineButton("📋 View Alerts", "alerts:list")],
        backButton,
      ]) },
    );
  },
);

// ── /set_threshold command ──

composer.command("set_threshold", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const wl = await store.getWatchlist(chatId);
  const enabled = wl.filter((e) => e.enabled);

  if (enabled.length === 0) {
    await ctx.reply(
      "Add coins to your watchlist first, then create alerts for them.",
      { reply_markup: inlineKeyboard([backButton]) },
    );
    return;
  }

  const rows: InlineButton[][] = enabled.map((e) => [
    inlineButton(e.ticker, `alerts:threshold:ticker:${e.ticker}`),
  ]);
  rows.push(backButton);
  await ctx.reply("Choose a coin for the threshold alert:", {
    reply_markup: inlineKeyboard(rows),
  });
});

// ── Percent Move Rule flow ──

composer.callbackQuery("alerts:percent:menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const wl = await store.getWatchlist(chatId);
  const enabled = wl.filter((e) => e.enabled);

  if (enabled.length === 0) {
    await ctx.editMessageText(
      "Add coins to your watchlist first, then create percent-move alerts.",
      { reply_markup: inlineKeyboard([backButton]) },
    );
    return;
  }

  const rows: InlineButton[][] = enabled.map((e) => [
    inlineButton(e.ticker, `alerts:percent:ticker:${e.ticker}`),
  ]);
  rows.push(backButton);
  await ctx.editMessageText("Choose a coin for the percent-move alert:", {
    reply_markup: inlineKeyboard(rows),
  });
});

composer.callbackQuery(/^alerts:percent:ticker:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const ticker = ctx.match[1]!;
  ctx.session.settingPercentRuleTicker = ticker;
  ctx.session.settingPercentRuleDir = undefined;
  ctx.session.settingPercentRulePct = undefined;
  await ctx.editMessageText(
    `Alert direction for ${ticker}?`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("⬆️ Up only", `alerts:percent:dir:up`), inlineButton("⬇️ Down only", `alerts:percent:dir:down`)],
        [inlineButton("↕️ Either", `alerts:percent:dir:either`)],
        backButton,
      ]),
    },
  );
});

composer.callbackQuery(/^alerts:percent:dir:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const dir = ctx.match[1]! as "up" | "down" | "either";
  ctx.session.settingPercentRuleDir = dir;
  ctx.session.settingPercentRulePct = true;
  const ticker = ctx.session.settingPercentRuleTicker;
  if (!ticker) {
    await ctx.editMessageText("Something went wrong. Please try again.", {
      reply_markup: inlineKeyboard([backButton]),
    });
    return;
  }
  await ctx.editMessageText(
    `Enter the percentage threshold for ${ticker} (e.g. 5 for 5%):`,
    { reply_markup: inlineKeyboard([backButton]) },
  );
});

composer.on("message:text").filter(
  (ctx) => ctx.session.settingPercentRulePct === true && !ctx.session.watchlistSearching && !ctx.session.priceSearching,
  async (ctx) => {
    ctx.session.messageHandled = true;
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const ticker = ctx.session.settingPercentRuleTicker;
    const dir = ctx.session.settingPercentRuleDir as "up" | "down" | "either";
    ctx.session.settingPercentRuleTicker = undefined;
    ctx.session.settingPercentRuleDir = undefined;
    ctx.session.settingPercentRulePct = undefined;

    if (!ticker || !dir) {
      await ctx.reply("Something went wrong. Please try again.", {
        reply_markup: inlineKeyboard([backButton]),
      });
      return;
    }

    const pct = parseFloat(ctx.message?.text?.trim() ?? "");
    if (isNaN(pct) || pct <= 0) {
      await ctx.reply("Please enter a valid positive percentage number.", {
        reply_markup: inlineKeyboard([backButton]),
      });
      ctx.session.settingPercentRuleTicker = ticker;
      ctx.session.settingPercentRuleDir = dir;
      ctx.session.settingPercentRulePct = true;
      return;
    }

    await store.addPercentRule(chatId, ticker, pct, 60, dir);
    await ctx.reply(
      `✅ Percent-move alert set: ${ticker} ${dir} ${pct}% / 60m`,
      { reply_markup: inlineKeyboard([
        [inlineButton("📋 View Alerts", "alerts:list")],
        backButton,
      ]) },
    );
  },
);

// ── /set_percent_rule command ──

composer.command("set_percent_rule", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const wl = await store.getWatchlist(chatId);
  const enabled = wl.filter((e) => e.enabled);

  if (enabled.length === 0) {
    await ctx.reply(
      "Add coins to your watchlist first, then create percent-move alerts.",
      { reply_markup: inlineKeyboard([backButton]) },
    );
    return;
  }

  const rows: InlineButton[][] = enabled.map((e) => [
    inlineButton(e.ticker, `alerts:percent:ticker:${e.ticker}`),
  ]);
  rows.push(backButton);
  await ctx.reply("Choose a coin for the percent-move alert:", {
    reply_markup: inlineKeyboard(rows),
  });
});

// ── Delete alerts ──

composer.callbackQuery("alerts:delete:list", async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const thresholds = await store.getThresholdAlerts(chatId);
  const rules = await store.getPercentRules(chatId);

  if (thresholds.length === 0 && rules.length === 0) {
    await ctx.editMessageText("No alerts to delete.", {
      reply_markup: inlineKeyboard([backButton]),
    });
    return;
  }

  const rows: InlineButton[][] = [
    ...thresholds.map((a) => [
      inlineButton(`🗑️ ${a.ticker} ${a.direction} $${a.threshold}`, `alerts:delete:ta:${a.id}`),
    ]),
    ...rules.map((r) => [
      inlineButton(`🗑️ ${r.ticker} ${r.direction} ${r.percentage}%`, `alerts:delete:pr:${r.id}`),
    ]),
  ];
  rows.push(backButton);
  await ctx.editMessageText("Tap an alert to delete it:", {
    reply_markup: inlineKeyboard(rows),
  });
});

composer.callbackQuery(/^alerts:delete:ta:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const id = ctx.match[1]!;
  await store.deleteAlert("ta", chatId, id);
  await ctx.editMessageText("Alert deleted.", {
    reply_markup: inlineKeyboard([
      [inlineButton("📋 View Alerts", "alerts:list")],
      backButton,
    ]),
  });
});

composer.callbackQuery(/^alerts:delete:pr:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const id = ctx.match[1]!;
  await store.deleteAlert("pr", chatId, id);
  await ctx.editMessageText("Alert deleted.", {
    reply_markup: inlineKeyboard([
      [inlineButton("📋 View Alerts", "alerts:list")],
      backButton,
    ]),
  });
});

// ── Toggle alerts ──

composer.callbackQuery("alerts:toggle:list", async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const thresholds = await store.getThresholdAlerts(chatId);
  const rules = await store.getPercentRules(chatId);

  const rows: InlineButton[][] = [
    ...thresholds.map((a) => [
      inlineButton(
        `${a.enabled ? "🟢" : "🔴"} ${a.ticker} ${a.direction} $${a.threshold}`,
        `alerts:toggle:ta:${a.id}`,
      ),
    ]),
    ...rules.map((r) => [
      inlineButton(
        `${r.enabled ? "🟢" : "🔴"} ${r.ticker} ${r.direction} ${r.percentage}%`,
        `alerts:toggle:pr:${r.id}`,
      ),
    ]),
  ];
  rows.push(backButton);
  await ctx.editMessageText("Tap an alert to toggle it on/off:", {
    reply_markup: inlineKeyboard(rows),
  });
});

composer.callbackQuery(/^alerts:toggle:ta:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const id = ctx.match[1]!;
  const enabled = await store.toggleAlert("ta", chatId, id);
  await ctx.editMessageText(
    `Alert ${enabled ? "enabled 🟢" : "disabled 🔴"}.`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("📋 View Alerts", "alerts:list")],
        backButton,
      ]),
    },
  );
});

composer.callbackQuery(/^alerts:toggle:pr:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const id = ctx.match[1]!;
  const enabled = await store.toggleAlert("pr", chatId, id);
  await ctx.editMessageText(
    `Alert ${enabled ? "enabled 🟢" : "disabled 🔴"}.`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("📋 View Alerts", "alerts:list")],
        backButton,
      ]),
    },
  );
});

// ── /alerts command ──

composer.command("alerts", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const thresholds = await store.getThresholdAlerts(chatId);
  const rules = await store.getPercentRules(chatId);

  if (thresholds.length === 0 && rules.length === 0) {
    await ctx.reply(
      "No alerts configured yet. Tap a button below to create one.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("📈 Threshold Alert", "alerts:threshold:menu"), inlineButton("📊 Percent Move", "alerts:percent:menu")],
          backButton,
        ]),
      },
    );
    return;
  }

  const lines: string[] = [];
  if (thresholds.length > 0) {
    lines.push("📈 Threshold Alerts:");
    for (const a of thresholds) {
      const status = a.enabled ? "✅" : "⏸️";
      lines.push(`${status} ${a.ticker} ${a.direction} $${a.threshold.toLocaleString()}`);
    }
  }
  if (rules.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("📊 Percent Move Alerts:");
    for (const r of rules) {
      const status = r.enabled ? "✅" : "⏸️";
      lines.push(`${status} ${r.ticker} ${r.direction} ${r.percentage}% / ${r.timeframeMinutes}m`);
    }
  }

  await ctx.reply(lines.join("\n"), {
    reply_markup: inlineKeyboard([
      [inlineButton("📈 New Threshold", "alerts:threshold:menu"), inlineButton("📊 New % Rule", "alerts:percent:menu")],
      [inlineButton("🔘 Toggle", "alerts:toggle:list"), inlineButton("🗑️ Delete", "alerts:delete:list")],
      backButton,
    ]),
  });
});

export default composer;