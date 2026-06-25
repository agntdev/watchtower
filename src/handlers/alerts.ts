import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  registerMainMenuItem,
  inlineButton,
  inlineKeyboard,
  confirmKeyboard,
} from "../toolkit/index.js";
import {
  getWatchlistEntries,
  getThresholdAlerts,
  saveThresholdAlert,
  updateThresholdAlert,
  removeThresholdAlert,
  getPercentMoveRules,
  savePercentMoveRule,
  updatePercentMoveRule,
  removePercentMoveRule,
  generateId,
} from "../store.js";
import { lookupTicker, searchCoins } from "../coingecko.js";
import type { Session } from "../bot.js";

interface AlertsSession extends Session {
  alertsStep?: "threshold_pick_coin" | "threshold_value" | "percent_pick_coin" | "percent_value" | "percent_timeframe" | "percent_direction";
  thresholdTicker?: string;
  thresholdCoinId?: string;
  percentTicker?: string;
  percentCoinId?: string;
}

type ACtx = Ctx & { session: AlertsSession };

registerMainMenuItem({ label: "🔔 Alerts", data: "alerts:list", order: 30 });
registerMainMenuItem({ label: "⚡ Threshold", data: "alerts:threshold_start", order: 31 });
registerMainMenuItem({ label: "📈 % Move", data: "alerts:percent_start", order: 32 });

const composer = new Composer<ACtx>();

function backRow() {
  return [inlineButton("⬅️ Back to menu", "menu:main")];
}

function backToAlertsRow() {
  return [inlineButton("⬅️ Back to alerts", "alerts:list")];
}

composer.command("alerts", async (ctx) => {
  await showAlerts(ctx, undefined);
});

composer.callbackQuery("alerts:list", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showAlerts(ctx, true);
});

async function showAlerts(ctx: ACtx, edit: true | undefined) {
  const thresholdAlerts = await getThresholdAlerts(ctx.from!.id);
  const percentRules = await getPercentMoveRules(ctx.from!.id);

  if (thresholdAlerts.length === 0 && percentRules.length === 0) {
    const text =
      "No alerts configured yet. Set a price threshold or percent-move alert to get notified.";
    const keyboard = inlineKeyboard([
      [inlineButton("⚡ Threshold Alert", "alerts:threshold_start")],
      [inlineButton("📈 % Move Alert", "alerts:percent_start")],
      backRow(),
    ]);
    if (edit) await ctx.editMessageText(text, { reply_markup: keyboard });
    else await ctx.reply(text, { reply_markup: keyboard });
    return;
  }

  const lines: string[] = ["🔔 Your Alerts:"];

  if (thresholdAlerts.length > 0) {
    lines.push("\n⚡ Threshold Alerts:");
    for (const a of thresholdAlerts) {
      const dir = a.direction === "above" ? "↑" : "↓";
      const state = a.enabled ? "✅" : "⛔";
      lines.push(
        `${state} ${a.ticker} ${dir} $${a.threshold.toLocaleString("en")} (${a.direction})`,
      );
    }
  }

  if (percentRules.length > 0) {
    lines.push("\n📈 % Move Alerts:");
    for (const r of percentRules) {
      const state = r.enabled ? "✅" : "⛔";
      const dirStr = r.direction === "up" ? "↑" : r.direction === "down" ? "↓" : "↕";
      const tfStr =
        r.timeframeMinutes >= 60
          ? `${r.timeframeMinutes / 60}h`
          : `${r.timeframeMinutes}m`;
      lines.push(
        `${state} ${r.ticker} ${dirStr} ${r.percentage}% / ${tfStr} (${r.direction})`,
      );
    }
  }

  const keyboardRows = [
    [inlineButton("⚡ Threshold Alert", "alerts:threshold_start")],
    [inlineButton("📈 % Move Alert", "alerts:percent_start")],
  ];

  if (thresholdAlerts.length > 0) {
    keyboardRows.push([inlineButton("⚡ Manage Thresholds", "alerts:manage_threshold")]);
  }
  if (percentRules.length > 0) {
    keyboardRows.push([inlineButton("📈 Manage % Moves", "alerts:manage_percent")]);
  }
  keyboardRows.push(backRow());

  if (edit) await ctx.editMessageText(lines.join("\n"), { reply_markup: inlineKeyboard(keyboardRows) });
  else await ctx.reply(lines.join("\n"), { reply_markup: inlineKeyboard(keyboardRows) });
}

composer.command("set_threshold", async (ctx) => {
  await showThresholdPickCoin(ctx, undefined);
});

composer.callbackQuery("alerts:threshold_start", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showThresholdPickCoin(ctx, true);
});

async function showThresholdPickCoin(ctx: ACtx, edit: true | undefined) {
  const entries = await getWatchlistEntries(ctx.from!.id);
  if (entries.length === 0) {
    const text = "Add coins to your watchlist first, then set alerts for them.";
    const keyboard = inlineKeyboard([
      [inlineButton("➕ Add Coins", "watchlist:add")],
      backRow(),
    ]);
    if (edit) await ctx.editMessageText(text, { reply_markup: keyboard });
    else await ctx.reply(text, { reply_markup: keyboard });
    return;
  }

  const rows = entries.map((e) => [
    inlineButton(`${e.ticker}`, `alerts:threshold_coin:${e.coinId}:${e.ticker}`),
  ]);
  rows.push([inlineButton("🔍 Custom ticker", "alerts:threshold_custom")]);
  rows.push(backToAlertsRow());

  const text = "Select a coin for the threshold alert:";
  if (edit) await ctx.editMessageText(text, { reply_markup: inlineKeyboard(rows) });
  else await ctx.reply(text, { reply_markup: inlineKeyboard(rows) });
}

composer.callbackQuery(/^alerts:threshold_coin:(.+):(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.alertsStep = "threshold_value";
  ctx.session.thresholdCoinId = ctx.match[1];
  ctx.session.thresholdTicker = ctx.match[2];
  await ctx.editMessageText(
    `Set a price threshold for ${ctx.match[2].toUpperCase()}. Enter the price (e.g. 50000):`,
    { reply_markup: inlineKeyboard([backToAlertsRow()]) },
  );
});

composer.callbackQuery("alerts:threshold_custom", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.alertsStep = "threshold_pick_coin";
  await ctx.editMessageText(
    "Enter the coin ticker for the threshold alert (e.g. BTC):",
    { reply_markup: inlineKeyboard([backToAlertsRow()]) },
  );
});

composer.on("message:text").filter(
  (ctx) => (ctx.session as AlertsSession).alertsStep === "threshold_pick_coin",
  async (ctx) => {
    const query = ctx.message.text.trim();
    const results = await searchCoins(query);
    if (results.length === 0) {
      ctx.session.alertsStep = undefined;
      await ctx.reply(
        `No coin found for "${query}". Try again.`,
        { reply_markup: inlineKeyboard([backToAlertsRow()]) },
      );
      return;
    }
    if (results.length === 1) {
      ctx.session.thresholdCoinId = results[0].coinId;
      ctx.session.thresholdTicker = results[0].ticker;
      ctx.session.alertsStep = "threshold_value";
      await ctx.reply(
        `Set a price threshold for ${results[0].ticker}. Enter the price (e.g. 50000):`,
        { reply_markup: inlineKeyboard([backToAlertsRow()]) },
      );
      return;
    }
    ctx.session.alertsStep = undefined;
    const rows = results.map((c) => [
      inlineButton(
        `${c.ticker} — ${c.name}`,
        `alerts:threshold_coin:${c.coinId}:${c.ticker}`,
      ),
    ]);
    rows.push(backToAlertsRow());
    await ctx.reply(`Multiple matches for "${query}". Select one:`, {
      reply_markup: inlineKeyboard(rows),
    });
  },
);

composer.on("message:text").filter(
  (ctx) => (ctx.session as AlertsSession).alertsStep === "threshold_value",
  async (ctx) => {
    const text = ctx.message.text.trim();
    const value = parseFloat(text);
    if (isNaN(value) || value <= 0) {
      await ctx.reply(
        "Please enter a valid positive number for the price threshold:",
        { reply_markup: inlineKeyboard([backToAlertsRow()]) },
      );
      return;
    }

    const ticker = ctx.session.thresholdTicker!;
    ctx.session.alertsStep = undefined;

    const alert = {
      id: generateId(),
      telegramId: ctx.from!.id,
      coinId: ctx.session.thresholdCoinId!,
      ticker,
      direction: "below" as const,
      threshold: value,
      enabled: true,
      createdAt: Date.now(),
      lastTriggeredAt: null,
    };

    await saveThresholdAlert(ctx.from!.id, alert);

    await ctx.reply(
      `⚡ Threshold alert set: ${ticker} at $${value.toLocaleString("en")}`,
      {
        reply_markup: inlineKeyboard([
          [inlineButton("Set Direction", `alerts:threshold_dir:${alert.id}`)],
          [inlineButton("📋 View Alerts", "alerts:list")],
          backRow(),
        ]),
      },
    );
  },
);

composer.callbackQuery(/^alerts:threshold_dir:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const alertId = ctx.match[1];
  await ctx.editMessageText(
    "Alert triggers when price goes:",
    {
      reply_markup: inlineKeyboard([
        [inlineButton("↑ Above threshold", `alerts:set_dir:${alertId}:above`)],
        [inlineButton("↓ Below threshold", `alerts:set_dir:${alertId}:below`)],
        backToAlertsRow(),
      ]),
    },
  );
});

composer.callbackQuery(/^alerts:set_dir:(.+):(above|below)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const alertId = ctx.match[1];
  const direction = ctx.match[2] as "above" | "below";
  await updateThresholdAlert(ctx.from!.id, alertId, { direction });
  const dirLabel = direction === "above" ? "↑ above" : "↓ below";
  await ctx.editMessageText(
    `✅ Threshold alert updated: triggers when price goes ${dirLabel}.`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("📋 View Alerts", "alerts:list")],
        backRow(),
      ]),
    },
  );
});

composer.callbackQuery("alerts:manage_threshold", async (ctx) => {
  await ctx.answerCallbackQuery();
  const alerts = await getThresholdAlerts(ctx.from!.id);
  if (alerts.length === 0) {
    await ctx.editMessageText("No threshold alerts to manage.", {
      reply_markup: inlineKeyboard([backToAlertsRow()]),
    });
    return;
  }

  const rows = alerts.map((a) => {
    const label = `${a.enabled ? "✅" : "⛔"} ${a.ticker} ${a.direction === "above" ? "↑" : "↓"} $${a.threshold.toLocaleString("en")}`;
    return [inlineButton(label, `alerts:threshold_detail:${a.id}`)];
  });
  rows.push(backToAlertsRow());
  await ctx.editMessageText("Manage your threshold alerts:", {
    reply_markup: inlineKeyboard(rows),
  });
});

composer.callbackQuery(/^alerts:threshold_detail:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const alertId = ctx.match[1];
  const alerts = await getThresholdAlerts(ctx.from!.id);
  const alert = alerts.find((a) => a.id === alertId);
  if (!alert) {
    await ctx.editMessageText("Alert not found.", {
      reply_markup: inlineKeyboard([backToAlertsRow()]),
    });
    return;
  }

  const dirLabel = alert.direction === "above" ? "↑ above" : "↓ below";
  const toggleLabel = alert.enabled ? "⛔ Disable" : "✅ Enable";

  await ctx.editMessageText(
    `⚡ ${alert.ticker} — ${dirLabel} $${alert.threshold.toLocaleString("en")}\nStatus: ${alert.enabled ? "Active" : "Disabled"}`,
    {
      reply_markup: inlineKeyboard([
        [
          inlineButton(toggleLabel, `alerts:toggle_threshold:${alert.id}`),
          inlineButton("🗑 Delete", `alerts:delete_threshold_confirm:${alert.id}`),
        ],
        backToAlertsRow(),
      ]),
    },
  );
});

composer.callbackQuery(/^alerts:toggle_threshold:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const alertId = ctx.match[1];
  const alerts = await getThresholdAlerts(ctx.from!.id);
  const alert = alerts.find((a) => a.id === alertId);
  if (!alert) {
    await ctx.editMessageText("Alert not found.", {
      reply_markup: inlineKeyboard([backToAlertsRow()]),
    });
    return;
  }
  await updateThresholdAlert(ctx.from!.id, alertId, { enabled: !alert.enabled });
  await ctx.editMessageText(
    `${alert.enabled ? "⛔ Disabled" : "✅ Enabled"} threshold alert for ${alert.ticker}.`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("📋 View Alerts", "alerts:manage_threshold")],
        backToAlertsRow(),
      ]),
    },
  );
});

composer.callbackQuery(/^alerts:delete_threshold_confirm:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const alertId = ctx.match[1];
  const alerts = await getThresholdAlerts(ctx.from!.id);
  const alert = alerts.find((a) => a.id === alertId);
  if (!alert) {
    await ctx.editMessageText("Alert not found.", {
      reply_markup: inlineKeyboard([backToAlertsRow()]),
    });
    return;
  }
  await ctx.editMessageText(
    `Delete threshold alert for ${alert.ticker}?`,
    { reply_markup: confirmKeyboard(`alerts:do_delete_threshold:${alertId}`) },
  );
});

composer.callbackQuery(/^alerts:do_delete_threshold:(.+):yes$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await removeThresholdAlert(ctx.from!.id, ctx.match[1]);
  await ctx.editMessageText("✅ Threshold alert deleted.", {
    reply_markup: inlineKeyboard([backToAlertsRow(), backRow()]),
  });
});

composer.callbackQuery(/^alerts:do_delete_threshold:(.+):no$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("Cancelled.", {
    reply_markup: inlineKeyboard([backToAlertsRow()]),
  });
});

// --- Percent Move Rules ---

composer.command("set_percent_rule", async (ctx) => {
  await showPercentPickCoin(ctx, undefined);
});

composer.callbackQuery("alerts:percent_start", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showPercentPickCoin(ctx, true);
});

async function showPercentPickCoin(ctx: ACtx, edit: true | undefined) {
  const entries = await getWatchlistEntries(ctx.from!.id);
  if (entries.length === 0) {
    const text = "Add coins to your watchlist first, then set alerts for them.";
    const keyboard = inlineKeyboard([
      [inlineButton("➕ Add Coins", "watchlist:add")],
      backRow(),
    ]);
    if (edit) await ctx.editMessageText(text, { reply_markup: keyboard });
    else await ctx.reply(text, { reply_markup: keyboard });
    return;
  }

  const rows = entries.map((e) => [
    inlineButton(`${e.ticker}`, `alerts:percent_coin:${e.coinId}:${e.ticker}`),
  ]);
  rows.push([inlineButton("🔍 Custom ticker", "alerts:percent_custom")]);
  rows.push(backToAlertsRow());

  const text = "Select a coin for the % move alert:";
  if (edit) await ctx.editMessageText(text, { reply_markup: inlineKeyboard(rows) });
  else await ctx.reply(text, { reply_markup: inlineKeyboard(rows) });
}

composer.callbackQuery(/^alerts:percent_coin:(.+):(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.alertsStep = "percent_value";
  ctx.session.percentCoinId = ctx.match[1];
  ctx.session.percentTicker = ctx.match[2];
  await ctx.editMessageText(
    `Set a % move alert for ${ctx.match[2].toUpperCase()}. Enter the percentage (e.g. 5):`,
    { reply_markup: inlineKeyboard([backToAlertsRow()]) },
  );
});

composer.callbackQuery("alerts:percent_custom", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.alertsStep = "percent_pick_coin";
  await ctx.editMessageText(
    "Enter the coin ticker (e.g. BTC):",
    { reply_markup: inlineKeyboard([backToAlertsRow()]) },
  );
});

composer.on("message:text").filter(
  (ctx) => (ctx.session as AlertsSession).alertsStep === "percent_pick_coin",
  async (ctx) => {
    const query = ctx.message.text.trim();
    const results = await searchCoins(query);
    if (results.length === 0) {
      ctx.session.alertsStep = undefined;
      await ctx.reply(
        `No coin found for "${query}". Try again.`,
        { reply_markup: inlineKeyboard([backToAlertsRow()]) },
      );
      return;
    }
    if (results.length === 1) {
      ctx.session.percentCoinId = results[0].coinId;
      ctx.session.percentTicker = results[0].ticker;
      ctx.session.alertsStep = "percent_value";
      await ctx.reply(
        `Set a % move alert for ${results[0].ticker}. Enter the percentage (e.g. 5):`,
        { reply_markup: inlineKeyboard([backToAlertsRow()]) },
      );
      return;
    }
    ctx.session.alertsStep = undefined;
    const rows = results.map((c) => [
      inlineButton(
        `${c.ticker} — ${c.name}`,
        `alerts:percent_coin:${c.coinId}:${c.ticker}`,
      ),
    ]);
    rows.push(backToAlertsRow());
    await ctx.reply(`Multiple matches. Select one:`, {
      reply_markup: inlineKeyboard(rows),
    });
  },
);

composer.on("message:text").filter(
  (ctx) => (ctx.session as AlertsSession).alertsStep === "percent_value",
  async (ctx) => {
    const text = ctx.message.text.trim();
    const value = parseFloat(text);
    if (isNaN(value) || value <= 0) {
      await ctx.reply(
        "Please enter a valid positive percentage (e.g. 5):",
        { reply_markup: inlineKeyboard([backToAlertsRow()]) },
      );
      return;
    }

    ctx.session.alertsStep = "percent_timeframe";
    await ctx.reply(
      `% move: ${value}% for ${ctx.session.percentTicker}. Now set the timeframe:`,
      {
        reply_markup: inlineKeyboard([
          [inlineButton("🕐 1 hour", `alerts:percent_tf:${ctx.session.percentCoinId}:${ctx.session.percentTicker}:${value}:60`)],
          [inlineButton("🕐 4 hours", `alerts:percent_tf:${ctx.session.percentCoinId}:${ctx.session.percentTicker}:${value}:240`)],
          [inlineButton("🕐 24 hours", `alerts:percent_tf:${ctx.session.percentCoinId}:${ctx.session.percentTicker}:${value}:1440`)],
          backToAlertsRow(),
        ]),
      },
    );
  },
);

composer.callbackQuery(/^alerts:percent_tf:(.+):(.+):([\d.]+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const coinId = ctx.match[1];
  const ticker = ctx.match[2];
  const pct = parseFloat(ctx.match[3]);
  const tf = parseInt(ctx.match[4]);

  ctx.session.percentCoinId = coinId;
  ctx.session.percentTicker = ticker;
  ctx.session.alertsStep = "percent_direction";

  await ctx.editMessageText(
    `${ticker.toUpperCase()}: ${pct}% over ${tf >= 60 ? `${tf / 60}h` : `${tf}m`}. Direction?`,
    {
      reply_markup: inlineKeyboard([
        [
          inlineButton("↑ Up", `alerts:percent_dir_set:${coinId}:${ticker}:${pct}:${tf}:up`),
          inlineButton("↓ Down", `alerts:percent_dir_set:${coinId}:${ticker}:${pct}:${tf}:down`),
        ],
        [inlineButton("↕ Both", `alerts:percent_dir_set:${coinId}:${ticker}:${pct}:${tf}:both`)],
        backToAlertsRow(),
      ]),
    },
  );
});

composer.callbackQuery(/^alerts:percent_dir_set:(.+):(.+):([\d.]+):(\d+):(up|down|both)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const coinId = ctx.match[1];
  const ticker = ctx.match[2];
  const pct = parseFloat(ctx.match[3]);
  const tf = parseInt(ctx.match[4]);
  const direction = ctx.match[5] as "up" | "down" | "both";

  ctx.session.alertsStep = undefined;

  const rule = {
    id: generateId(),
    telegramId: ctx.from!.id,
    coinId,
    ticker,
    percentage: pct,
    timeframeMinutes: tf,
    direction,
    enabled: true,
    createdAt: Date.now(),
    lastTriggeredAt: null,
    basePrice: null,
    basePriceSetAt: null,
  };

  await savePercentMoveRule(ctx.from!.id, rule);

  const dirLabel = direction === "up" ? "↑" : direction === "down" ? "↓" : "↕";
  const tfLabel = tf >= 60 ? `${tf / 60}h` : `${tf}m`;

  await ctx.editMessageText(
    `📈 % Move alert set: ${ticker.toUpperCase()} ${dirLabel} ${pct}% / ${tfLabel}`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("📋 View Alerts", "alerts:list")],
        backRow(),
      ]),
    },
  );
});

composer.callbackQuery("alerts:manage_percent", async (ctx) => {
  await ctx.answerCallbackQuery();
  const rules = await getPercentMoveRules(ctx.from!.id);
  if (rules.length === 0) {
    await ctx.editMessageText("No % move alerts to manage.", {
      reply_markup: inlineKeyboard([backToAlertsRow()]),
    });
    return;
  }

  const rows = rules.map((r) => {
    const label = `${r.enabled ? "✅" : "⛔"} ${r.ticker} ${r.direction === "up" ? "↑" : r.direction === "down" ? "↓" : "↕"} ${r.percentage}%`;
    return [inlineButton(label, `alerts:percent_detail:${r.id}`)];
  });
  rows.push(backToAlertsRow());
  await ctx.editMessageText("Manage your % move alerts:", {
    reply_markup: inlineKeyboard(rows),
  });
});

composer.callbackQuery(/^alerts:percent_detail:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const ruleId = ctx.match[1];
  const rules = await getPercentMoveRules(ctx.from!.id);
  const rule = rules.find((r) => r.id === ruleId);
  if (!rule) {
    await ctx.editMessageText("Alert not found.", {
      reply_markup: inlineKeyboard([backToAlertsRow()]),
    });
    return;
  }

  const dirLabel = rule.direction === "up" ? "↑" : rule.direction === "down" ? "↓" : "↕";
  const tfLabel = rule.timeframeMinutes >= 60 ? `${rule.timeframeMinutes / 60}h` : `${rule.timeframeMinutes}m`;
  const toggleLabel = rule.enabled ? "⛔ Disable" : "✅ Enable";

  await ctx.editMessageText(
    `📈 ${rule.ticker} — ${dirLabel} ${rule.percentage}% / ${tfLabel}\nStatus: ${rule.enabled ? "Active" : "Disabled"}`,
    {
      reply_markup: inlineKeyboard([
        [
          inlineButton(toggleLabel, `alerts:toggle_percent:${rule.id}`),
          inlineButton("🗑 Delete", `alerts:delete_percent_confirm:${rule.id}`),
        ],
        backToAlertsRow(),
      ]),
    },
  );
});

composer.callbackQuery(/^alerts:toggle_percent:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const ruleId = ctx.match[1];
  const rules = await getPercentMoveRules(ctx.from!.id);
  const rule = rules.find((r) => r.id === ruleId);
  if (!rule) {
    await ctx.editMessageText("Alert not found.", {
      reply_markup: inlineKeyboard([backToAlertsRow()]),
    });
    return;
  }
  await updatePercentMoveRule(ctx.from!.id, ruleId, { enabled: !rule.enabled });
  await ctx.editMessageText(
    `${rule.enabled ? "⛔ Disabled" : "✅ Enabled"} % move rule for ${rule.ticker}.`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("📋 View Alerts", "alerts:manage_percent")],
        backToAlertsRow(),
      ]),
    },
  );
});

composer.callbackQuery(/^alerts:delete_percent_confirm:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const ruleId = ctx.match[1];
  const rules = await getPercentMoveRules(ctx.from!.id);
  const rule = rules.find((r) => r.id === ruleId);
  if (!rule) {
    await ctx.editMessageText("Alert not found.", {
      reply_markup: inlineKeyboard([backToAlertsRow()]),
    });
    return;
  }
  await ctx.editMessageText(
    `Delete % move alert for ${rule.ticker}?`,
    { reply_markup: confirmKeyboard(`alerts:do_delete_percent:${ruleId}`) },
  );
});

composer.callbackQuery(/^alerts:do_delete_percent:(.+):yes$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await removePercentMoveRule(ctx.from!.id, ctx.match[1]);
  await ctx.editMessageText("✅ % Move alert deleted.", {
    reply_markup: inlineKeyboard([backToAlertsRow(), backRow()]),
  });
});

composer.callbackQuery(/^alerts:do_delete_percent:(.+):no$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("Cancelled.", {
    reply_markup: inlineKeyboard([backToAlertsRow()]),
  });
});

composer.callbackQuery(/^alert:disable:(threshold|percent):(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Alert disabled." });
  const type = ctx.match[1];
  const id = ctx.match[2];
  try {
    if (type === "threshold") {
      await updateThresholdAlert(ctx.from!.id, id, { enabled: false });
    } else {
      await updatePercentMoveRule(ctx.from!.id, id, { enabled: false });
    }
  } catch {
    // alert may have been deleted
  }
});

composer.callbackQuery(/^alert:snooze:(threshold|percent):(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Alert snoozed for 1 hour." });
  const type = ctx.match[1];
  const id = ctx.match[2];
  const snoozeUntil = Date.now() + 60 * 60 * 1000;
  try {
    if (type === "threshold") {
      await updateThresholdAlert(ctx.from!.id, id, { lastTriggeredAt: snoozeUntil });
    } else {
      await updatePercentMoveRule(ctx.from!.id, id, { lastTriggeredAt: snoozeUntil });
    }
  } catch {
    // alert may have been deleted
  }
});

export default composer;