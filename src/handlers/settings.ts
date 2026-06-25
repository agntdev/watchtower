import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { store } from "../services/store.js";

const backButton = [inlineButton("⬅️ Back to menu", "menu:main")];

const composer = new Composer<Ctx>();

// ── Settings menu ──

composer.callbackQuery("settings:menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const user = await store.getUser(chatId);

  const lines = [
    "⚙️ *Your Settings*",
    "",
    `🕐 Timezone: ${user.timezone}`,
    `💵 Fiat: ${user.defaultFiat}`,
    `🔇 Quiet Hours: ${user.quietHoursStart}–${user.quietHoursEnd}`,
    `📋 Summary: ${user.summaryTime ?? "Disabled"}`,
    `⏱️ Cooldown: ${user.cooldownMinutes}m`,
  ];

  await ctx.editMessageText(lines.join("\n"), {
    reply_markup: inlineKeyboard([
      [inlineButton("🕐 Timezone", "settings:timezone"), inlineButton("💵 Fiat", "settings:fiat")],
      [inlineButton("🔇 Quiet Hours", "settings:quiet_hours"), inlineButton("📋 Summary", "settings:summary_time")],
      [inlineButton("⏱️ Cooldown", "settings:cooldown")],
      backButton,
    ]),
    parse_mode: "Markdown",
  });
});

// ── /settings command ──

composer.command("settings", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const user = await store.getUser(chatId);

  const lines = [
    "⚙️ *Your Settings*",
    "",
    `🕐 Timezone: ${user.timezone}`,
    `💵 Fiat: ${user.defaultFiat}`,
    `🔇 Quiet Hours: ${user.quietHoursStart}–${user.quietHoursEnd}`,
    `📋 Summary: ${user.summaryTime ?? "Disabled"}`,
    `⏱️ Cooldown: ${user.cooldownMinutes}m`,
  ];

  await ctx.reply(lines.join("\n"), {
    reply_markup: inlineKeyboard([
      [inlineButton("🕐 Timezone", "settings:timezone"), inlineButton("💵 Fiat", "settings:fiat")],
      [inlineButton("🔇 Quiet Hours", "settings:quiet_hours"), inlineButton("📋 Summary", "settings:summary_time")],
      [inlineButton("⏱️ Cooldown", "settings:cooldown")],
      backButton,
    ]),
    parse_mode: "Markdown",
  });
});

// ── Timezone ──

composer.callbackQuery("settings:timezone", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.settingTimezone = true;
  const commonTzs = ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Tokyo", "Asia/Shanghai", "Asia/Dubai"];
  const rows = [];
  for (let i = 0; i < commonTzs.length; i += 2) {
    rows.push(commonTzs.slice(i, i + 2).map((tz) => inlineButton(tz, `settings:timezone:set:${tz}`)));
  }
  rows.push([inlineButton("⌨️ Type custom", "settings:timezone:custom")]);
  rows.push(backButton);
  await ctx.editMessageText("Choose your timezone:", { reply_markup: inlineKeyboard(rows) });
});

composer.callbackQuery("settings:timezone:custom", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    "Enter your timezone (e.g. America/New_York, Europe/London):",
    { reply_markup: inlineKeyboard([backButton]) },
  );
  ctx.session.settingTimezone = true;
});

composer.callbackQuery(/^settings:timezone:set:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const tz = ctx.match[1]!;
  ctx.session.settingTimezone = false;
  const user = await store.getUser(chatId);
  user.timezone = tz;
  await store.saveUser(user);
  await ctx.editMessageText(`Timezone set to ${tz}.`, {
    reply_markup: inlineKeyboard([backButton]),
  });
});

composer.on("message:text").filter(
  (ctx) => ctx.session.settingTimezone === true,
  async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    ctx.session.messageHandled = true;
    ctx.session.settingTimezone = false;
    const tz = ctx.message?.text?.trim();
    if (!tz) return ctx.reply("Please enter a valid timezone.", { reply_markup: inlineKeyboard([backButton]) });
    const user = await store.getUser(chatId);
    user.timezone = tz;
    await store.saveUser(user);
    await ctx.reply(`Timezone set to ${tz}.`, { reply_markup: inlineKeyboard([backButton]) });
  },
);

// ── Fiat ──

composer.callbackQuery("settings:fiat", async (ctx) => {
  await ctx.answerCallbackQuery();
  const fiats = ["USD", "EUR", "GBP", "JPY", "KRW", "AUD", "CAD", "CHF", "SGD", "BRL"];
  const rows = [];
  for (let i = 0; i < fiats.length; i += 2) {
    rows.push(fiats.slice(i, i + 2).map((f) => inlineButton(f, `settings:fiat:set:${f}`)));
  }
  rows.push(backButton);
  await ctx.editMessageText("Choose your display currency:", { reply_markup: inlineKeyboard(rows) });
});

composer.callbackQuery(/^settings:fiat:set:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const fiat = ctx.match[1]!;
  const user = await store.getUser(chatId);
  user.defaultFiat = fiat;
  await store.saveUser(user);
  await ctx.editMessageText(`Currency set to ${fiat}.`, {
    reply_markup: inlineKeyboard([backButton]),
  });
});

// ── Quiet Hours ──

composer.callbackQuery("settings:quiet_hours", async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const user = await store.getUser(chatId);
  await ctx.editMessageText(
    `Current quiet hours: ${user.quietHoursStart}–${user.quietHoursEnd}\n\nChoose an option:`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("✏️ Change Start", "settings:qh:start"), inlineButton("✏️ Change End", "settings:qh:end")],
        [inlineButton("🚫 Disable", "settings:qh:disable")],
        backButton,
      ]),
    },
  );
});

composer.callbackQuery("settings:qh:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.settingQuietHoursStart = true;
  await ctx.editMessageText(
    "Enter quiet hours start time (HH:MM, 24h format, e.g. 22:00):",
    { reply_markup: inlineKeyboard([backButton]) },
  );
});

composer.callbackQuery("settings:qh:end", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.settingQuietHoursEnd = true;
  await ctx.editMessageText(
    "Enter quiet hours end time (HH:MM, 24h format, e.g. 07:00):",
    { reply_markup: inlineKeyboard([backButton]) },
  );
});

composer.callbackQuery("settings:qh:disable", async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const user = await store.getUser(chatId);
  user.quietHoursStart = "00:00";
  user.quietHoursEnd = "00:00";
  await store.saveUser(user);
  await ctx.editMessageText("Quiet hours disabled.", {
    reply_markup: inlineKeyboard([backButton]),
  });
});

composer.on("message:text").filter(
  (ctx) => ctx.session.settingQuietHoursStart === true || ctx.session.settingQuietHoursEnd === true,
  async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    ctx.session.messageHandled = true;
    const isStart = ctx.session.settingQuietHoursStart === true;
    ctx.session.settingQuietHoursStart = false;
    ctx.session.settingQuietHoursEnd = false;

    const time = ctx.message?.text?.trim() ?? "";
    if (!/^\d{2}:\d{2}$/.test(time)) {
      await ctx.reply("Invalid format. Please use HH:MM (24h), e.g. 22:00.", {
        reply_markup: inlineKeyboard([backButton]),
      });
      return;
    }

    const user = await store.getUser(chatId);
    if (isStart) user.quietHoursStart = time;
    else user.quietHoursEnd = time;
    await store.saveUser(user);
    await ctx.reply(
      `Quiet hours set to ${user.quietHoursStart}–${user.quietHoursEnd}.`,
      { reply_markup: inlineKeyboard([backButton]) },
    );
  },
);

// ── /quiet_hours command ──

composer.command("quiet_hours", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const user = await store.getUser(chatId);
  const args = ctx.message?.text?.split(/\s+/);
  if (args && args.length === 3) {
    const start = args[1]!;
    const end = args[2]!;
    if (/^\d{2}:\d{2}$/.test(start) && /^\d{2}:\d{2}$/.test(end)) {
      user.quietHoursStart = start;
      user.quietHoursEnd = end;
      await store.saveUser(user);
      await ctx.reply(`Quiet hours set to ${start}–${end}.`, {
        reply_markup: inlineKeyboard([backButton]),
      });
      return;
    }
  }
  await ctx.reply(
    `Current quiet hours: ${user.quietHoursStart}–${user.quietHoursEnd}\n\nUse /quiet_hours HH:MM HH:MM to change, or use the menu.`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("✏️ Change Start", "settings:qh:start"), inlineButton("✏️ Change End", "settings:qh:end")],
        backButton,
      ]),
    },
  );
});

// ── Summary Time ──

composer.callbackQuery("settings:summary_time", async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const user = await store.getUser(chatId);
  const current = user.summaryTime ?? "Disabled";
  await ctx.editMessageText(
    `Current summary time: ${current}\n\nChoose an option:`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("✏️ Set Time", "settings:summary:set"), inlineButton("🚫 Disable", "settings:summary:disable")],
        backButton,
      ]),
    },
  );
});

composer.callbackQuery("settings:summary:set", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.settingSummaryTime = true;
  await ctx.editMessageText(
    "Enter your morning summary time (HH:MM, 24h format, e.g. 08:00):",
    { reply_markup: inlineKeyboard([backButton]) },
  );
});

composer.callbackQuery("settings:summary:disable", async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const user = await store.getUser(chatId);
  user.summaryTime = null;
  await store.saveUser(user);
  await ctx.editMessageText("Morning summary disabled.", {
    reply_markup: inlineKeyboard([backButton]),
  });
});

composer.on("message:text").filter(
  (ctx) => ctx.session.settingSummaryTime === true,
  async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    ctx.session.messageHandled = true;
    ctx.session.settingSummaryTime = false;
    const time = ctx.message?.text?.trim() ?? "";
    if (!/^\d{2}:\d{2}$/.test(time)) {
      await ctx.reply("Invalid format. Please use HH:MM (24h), e.g. 08:00.", {
        reply_markup: inlineKeyboard([backButton]),
      });
      return;
    }
    const user = await store.getUser(chatId);
    user.summaryTime = time;
    await store.saveUser(user);
    await ctx.reply(`Morning summary set to ${time}.`, {
      reply_markup: inlineKeyboard([backButton]),
    });
  },
);

// ── /summary_time command ──

composer.command("summary_time", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const user = await store.getUser(chatId);
  const args = ctx.message?.text?.split(/\s+/);
  if (args && args.length === 2) {
    const time = args[1]!;
    if (time.toLowerCase() === "off" || time.toLowerCase() === "disable") {
      user.summaryTime = null;
      await store.saveUser(user);
      await ctx.reply("Morning summary disabled.", { reply_markup: inlineKeyboard([backButton]) });
      return;
    }
    if (/^\d{2}:\d{2}$/.test(time)) {
      user.summaryTime = time;
      await store.saveUser(user);
      await ctx.reply(`Morning summary set to ${time}.`, { reply_markup: inlineKeyboard([backButton]) });
      return;
    }
  }
  await ctx.reply(
    `Current summary time: ${user.summaryTime ?? "Disabled"}\n\nUse /summary_time HH:MM to set, or /summary_time off to disable.`,
    { reply_markup: inlineKeyboard([backButton]) },
  );
});

// ── Cooldown ──

composer.callbackQuery("settings:cooldown", async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const user = await store.getUser(chatId);
  await ctx.editMessageText(
    `Current alert cooldown: ${user.cooldownMinutes}m\n\nChoose a new cooldown:`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("15m", "settings:cooldown:set:15"), inlineButton("30m", "settings:cooldown:set:30"), inlineButton("60m", "settings:cooldown:set:60")],
        [inlineButton("120m", "settings:cooldown:set:120"), inlineButton("240m", "settings:cooldown:set:240")],
        backButton,
      ]),
    },
  );
});

composer.callbackQuery(/^settings:cooldown:set:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const mins = parseInt(ctx.match[1]!, 10);
  const user = await store.getUser(chatId);
  user.cooldownMinutes = mins;
  await store.saveUser(user);
  await ctx.editMessageText(`Alert cooldown set to ${mins} minutes.`, {
    reply_markup: inlineKeyboard([backButton]),
  });
});

export default composer;