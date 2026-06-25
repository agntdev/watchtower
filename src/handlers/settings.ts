import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  registerMainMenuItem,
  inlineButton,
  inlineKeyboard,
} from "../toolkit/index.js";
import { getUser, saveUser } from "../store.js";
import type { Session } from "../bot.js";

interface SettingsSession extends Session {
  settingsStep?: "awaiting_timezone" | "awaiting_fiat" | "awaiting_cooldown" | "awaiting_summary_time" | "awaiting_quiet_start" | "awaiting_quiet_end";
}

type SCtx = Ctx & { session: SettingsSession };

registerMainMenuItem({ label: "⚙️ Settings", data: "settings:show", order: 80 });

const composer = new Composer<SCtx>();

function backRow() {
  return [inlineButton("⬅️ Back to menu", "menu:main")];
}

function backToSettingsRow() {
  return [inlineButton("⬅️ Back to settings", "settings:show")];
}

composer.command("settings", async (ctx) => {
  await showSettings(ctx, undefined);
});

composer.callbackQuery("settings:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showSettings(ctx, true);
});

async function showSettings(ctx: SCtx, edit: true | undefined) {
  const user = await getUser(ctx.from!.id);
  const tz = user.timezone;
  const fiat = user.defaultFiat.toUpperCase();
  const cooldown = user.cooldownMinutes;
  const quietStart = user.quietHoursStart;
  const quietEnd = user.quietHoursEnd;
  const summary = user.summaryTime ?? "Disabled";

  const text =
    `⚙️ Your Settings:\n\n` +
    `Time zone: ${tz}\n` +
    `Currency: ${fiat}\n` +
    `Cooldown: ${cooldown} min\n` +
    `Quiet hours: ${quietStart} – ${quietEnd}\n` +
    `Morning summary: ${summary}`;

  const keyboard = inlineKeyboard([
    [inlineButton("🌍 Time zone", "settings:timezone")],
    [inlineButton("💱 Currency", "settings:fiat")],
    [inlineButton("⏱ Cooldown", "settings:cooldown")],
    [inlineButton("🤫 Quiet hours", "settings:quiet_hours")],
    [inlineButton("🌅 Morning summary", "settings:summary_time")],
    backRow(),
  ]);

  if (edit) await ctx.editMessageText(text, { reply_markup: keyboard });
  else await ctx.reply(text, { reply_markup: keyboard });
}

composer.callbackQuery("settings:timezone", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.settingsStep = "awaiting_timezone";
  await ctx.editMessageText(
    "Enter your time zone offset (e.g. UTC, UTC+3, UTC-5, EST):",
    { reply_markup: inlineKeyboard([backToSettingsRow()]) },
  );
});

composer.on("message:text").filter(
  (ctx) => (ctx.session as SettingsSession).settingsStep === "awaiting_timezone",
  async (ctx) => {
    ctx.session.settingsStep = undefined;
    const tz = ctx.message.text.trim();
    const user = await getUser(ctx.from!.id);
    user.timezone = tz;
    await saveUser(user);
    await ctx.reply(
      `✅ Time zone set to ${tz}.`,
      { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to settings", "settings:show")], backRow()]) },
    );
  },
);

composer.callbackQuery("settings:fiat", async (ctx) => {
  await ctx.answerCallbackQuery();
  const fiats = [
    { code: "usd", label: "🇺🇸 USD" },
    { code: "eur", label: "🇪🇺 EUR" },
    { code: "gbp", label: "🇬🇧 GBP" },
    { code: "jpy", label: "🇯🇵 JPY" },
    { code: "krw", label: "🇰🇷 KRW" },
    { code: "cny", label: "🇨🇳 CNY" },
    { code: "inr", label: "🇮🇳 INR" },
    { code: "aud", label: "🇦🇺 AUD" },
    { code: "cad", label: "🇨🇦 CAD" },
  ];

  const rows = fiats.map((f) => [
    inlineButton(f.label, `settings:set_fiat:${f.code}`),
  ]);
  rows.push(backToSettingsRow());

  await ctx.editMessageText("Select your default currency:", {
    reply_markup: inlineKeyboard(rows),
  });
});

composer.callbackQuery(/^settings:set_fiat:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const fiat = ctx.match[1];
  const user = await getUser(ctx.from!.id);
  user.defaultFiat = fiat;
  await saveUser(user);
  await ctx.editMessageText(
    `✅ Default currency set to ${fiat.toUpperCase()}.`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back to settings", "settings:show")],
        backRow(),
      ]),
    },
  );
});

composer.callbackQuery("settings:cooldown", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.settingsStep = "awaiting_cooldown";
  await ctx.editMessageText(
    "Enter alert cooldown in minutes (minimum 5, e.g. 30):",
    { reply_markup: inlineKeyboard([backToSettingsRow()]) },
  );
});

composer.on("message:text").filter(
  (ctx) => (ctx.session as SettingsSession).settingsStep === "awaiting_cooldown",
  async (ctx) => {
    const value = parseInt(ctx.message.text.trim(), 10);
    if (isNaN(value) || value < 5) {
      await ctx.reply(
        "Please enter a valid number (minimum 5 minutes):",
        { reply_markup: inlineKeyboard([backToSettingsRow()]) },
      );
      return;
    }
    ctx.session.settingsStep = undefined;
    const user = await getUser(ctx.from!.id);
    user.cooldownMinutes = value;
    await saveUser(user);
    await ctx.reply(
      `✅ Alert cooldown set to ${value} minutes.`,
      { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to settings", "settings:show")], backRow()]) },
    );
  },
);

composer.command("quiet_hours", async (ctx) => {
  await showQuietHours(ctx, undefined);
});

composer.callbackQuery("settings:quiet_hours", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showQuietHours(ctx, true);
});

async function showQuietHours(ctx: SCtx, edit: true | undefined) {
  const user = await getUser(ctx.from!.id);

  const quickPresets = [
    ["🤫 22:00 – 07:00", `settings:quiet_set:22:00_07:00`],
    ["🤫 23:00 – 06:00", `settings:quiet_set:23:00_06:00`],
    ["🤫 00:00 – 06:00", `settings:quiet_set:00:00_06:00`],
    ["🤫 21:00 – 09:00", `settings:quiet_set:21:00_09:00`],
    ["🔕 Disable", `settings:quiet_disable`],
    ["✏️ Custom", "settings:quiet_custom"],
  ];

  const text =
    `🤫 Quiet Hours: ${user.quietHoursStart} – ${user.quietHoursEnd}\n\n` +
    `Alerts are suppressed during these hours. Select a preset or set custom:`;

  const rows = quickPresets.map(([label, data]) => [
    inlineButton(label, data),
  ]);
  rows.push(backToSettingsRow());

  if (edit) await ctx.editMessageText(text, { reply_markup: inlineKeyboard(rows) });
  else await ctx.reply(text, { reply_markup: inlineKeyboard(rows) });
}

composer.callbackQuery(/^settings:quiet_set:(.+)_(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const start = ctx.match[1];
  const end = ctx.match[2];
  const user = await getUser(ctx.from!.id);
  user.quietHoursStart = start;
  user.quietHoursEnd = end;
  await saveUser(user);
  await ctx.editMessageText(
    `✅ Quiet hours set to ${start} – ${end}.`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back to settings", "settings:show")],
        backRow(),
      ]),
    },
  );
});

composer.callbackQuery("settings:quiet_disable", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUser(ctx.from!.id);
  user.quietHoursStart = "00:00";
  user.quietHoursEnd = "00:00";
  await saveUser(user);
  await ctx.editMessageText(
    "✅ Quiet hours disabled. Alerts will fire at any time.",
    {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back to settings", "settings:show")],
        backRow(),
      ]),
    },
  );
});

composer.callbackQuery("settings:quiet_custom", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.settingsStep = "awaiting_quiet_start";
  await ctx.editMessageText(
    "Enter quiet hours START time (HH:MM format, e.g. 22:00):",
    { reply_markup: inlineKeyboard([backToSettingsRow()]) },
  );
});

composer.on("message:text").filter(
  (ctx) => (ctx.session as SettingsSession).settingsStep === "awaiting_quiet_start",
  async (ctx) => {
    const time = ctx.message.text.trim();
    if (!/^\d{1,2}:\d{2}$/.test(time)) {
      await ctx.reply(
        "Please enter a valid time in HH:MM format (e.g. 22:00):",
        { reply_markup: inlineKeyboard([backToSettingsRow()]) },
      );
      return;
    }
    ctx.session.settingsStep = "awaiting_quiet_end";
    const user = await getUser(ctx.from!.id);
    user.quietHoursStart = time;
    await saveUser(user);
    await ctx.reply(
      "Enter quiet hours END time (HH:MM format, e.g. 07:00):",
      { reply_markup: inlineKeyboard([backToSettingsRow()]) },
    );
  },
);

composer.on("message:text").filter(
  (ctx) => (ctx.session as SettingsSession).settingsStep === "awaiting_quiet_end",
  async (ctx) => {
    const time = ctx.message.text.trim();
    if (!/^\d{1,2}:\d{2}$/.test(time)) {
      await ctx.reply(
        "Please enter a valid time in HH:MM format (e.g. 07:00):",
        { reply_markup: inlineKeyboard([backToSettingsRow()]) },
      );
      return;
    }
    ctx.session.settingsStep = undefined;
    const user = await getUser(ctx.from!.id);
    user.quietHoursEnd = time;
    await saveUser(user);
    await ctx.reply(
      `✅ Quiet hours set to ${user.quietHoursStart} – ${user.quietHoursEnd}.`,
      { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to settings", "settings:show")], backRow()]) },
    );
  },
);

composer.command("summary_time", async (ctx) => {
  await showSummaryTime(ctx, undefined);
});

composer.callbackQuery("settings:summary_time", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showSummaryTime(ctx, true);
});

async function showSummaryTime(ctx: SCtx, edit: true | undefined) {
  const user = await getUser(ctx.from!.id);
  const current = user.summaryTime ?? "Disabled";

  const presets = [
    ["🌅 07:00", `settings:summary_set:07:00`],
    ["🌅 08:00", `settings:summary_set:08:00`],
    ["🌅 09:00", `settings:summary_set:09:00`],
    ["🌅 10:00", `settings:summary_set:10:00`],
    ["🔕 Disable", `settings:summary_disable`],
    ["✏️ Custom time", "settings:summary_custom"],
  ];

  const text = `🌅 Morning Summary: ${current}\n\nSet a time to receive daily price summaries:`;

  const rows = presets.map(([label, data]) => [
    inlineButton(label, data),
  ]);
  rows.push(backToSettingsRow());

  if (edit) await ctx.editMessageText(text, { reply_markup: inlineKeyboard(rows) });
  else await ctx.reply(text, { reply_markup: inlineKeyboard(rows) });
}

composer.callbackQuery(/^settings:summary_set:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const time = ctx.match[1];
  const user = await getUser(ctx.from!.id);
  user.summaryTime = time;
  await saveUser(user);
  await ctx.editMessageText(
    `✅ Morning summary set to ${time} daily.`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back to settings", "settings:show")],
        backRow(),
      ]),
    },
  );
});

composer.callbackQuery("settings:summary_disable", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUser(ctx.from!.id);
  user.summaryTime = null;
  await saveUser(user);
  await ctx.editMessageText(
    "✅ Morning summary disabled.",
    {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back to settings", "settings:show")],
        backRow(),
      ]),
    },
  );
});

composer.callbackQuery("settings:summary_custom", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.settingsStep = "awaiting_summary_time";
  await ctx.editMessageText(
    "Enter your summary time in HH:MM format (e.g. 06:30):",
    { reply_markup: inlineKeyboard([backToSettingsRow()]) },
  );
});

composer.on("message:text").filter(
  (ctx) => (ctx.session as SettingsSession).settingsStep === "awaiting_summary_time",
  async (ctx) => {
    const time = ctx.message.text.trim();
    if (!/^\d{1,2}:\d{2}$/.test(time)) {
      await ctx.reply(
        "Please enter a valid time in HH:MM format (e.g. 06:30):",
        { reply_markup: inlineKeyboard([backToSettingsRow()]) },
      );
      return;
    }
    ctx.session.settingsStep = undefined;
    const user = await getUser(ctx.from!.id);
    user.summaryTime = time;
    await saveUser(user);
    await ctx.reply(
      `✅ Morning summary set to ${time} daily.`,
      { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to settings", "settings:show")], backRow()]) },
    );
  },
);

export default composer;