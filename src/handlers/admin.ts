import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { store } from "../services/store.js";
import { getPrices } from "../services/prices.js";

const backButton = [inlineButton("⬅️ Back to menu", "menu:main")];

const composer = new Composer<Ctx>();

function generateClaimCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function isOwner(chatId: number): Promise<boolean> {
  const owner = await store.getOwner();
  return owner !== null && owner.chatId === chatId;
}

// ── Admin panel ──

composer.callbackQuery("admin:panel", async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const owner = await isOwner(chatId);

  if (!owner) {
    await ctx.editMessageText(
      "This area is reserved for the bot owner.\n\nUse /claim_owner to claim ownership if you are the owner.",
      { reply_markup: inlineKeyboard([backButton]) },
    );
    return;
  }

  const users = await store.getAllUsers();
  const allThresholds = await store.getAllThresholdAlerts();
  const allRules = await store.getAllPercentRules();
  const history = await store.getAllAlertHistory(50);

  const activeThresholds = allThresholds.filter((a) => a.enabled).length;
  const activeRules = allRules.filter((r) => r.enabled).length;
  const totalAlerts = activeThresholds + activeRules;

  const lines = [
    "📊 *Admin Dashboard*",
    "",
    `👥 Users with settings: ${users.length}`,
    `🔔 Active alerts: ${totalAlerts} (${activeThresholds} threshold, ${activeRules} percent)`,
    `📜 Total alert events: ${history.length}`,
    "",
    "*Recent Activity:*",
  ];

  if (history.length === 0) {
    lines.push("No alerts triggered yet.");
  } else {
    for (const h of history.slice(0, 5)) {
      const sign = h.percentChange >= 0 ? "+" : "";
      const date = new Date(h.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
      lines.push(`${date} — ${h.coin}: ${sign}${h.percentChange.toFixed(2)}%`);
    }
  }

  await ctx.editMessageText(lines.join("\n"), {
    reply_markup: inlineKeyboard([backButton]),
    parse_mode: "Markdown",
  });
});

// ── /admin command ──

composer.command("admin", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const owner = await isOwner(chatId);

  if (!owner) {
    await ctx.reply(
      "This area is reserved for the bot owner.\n\nUse /claim_owner to claim ownership.",
      { reply_markup: inlineKeyboard([backButton]) },
    );
    return;
  }

  const users = await store.getAllUsers();
  const allThresholds = await store.getAllThresholdAlerts();
  const allRules = await store.getAllPercentRules();
  const history = await store.getAllAlertHistory(50);

  const activeThresholds = allThresholds.filter((a) => a.enabled).length;
  const activeRules = allRules.filter((r) => r.enabled).length;
  const totalAlerts = activeThresholds + activeRules;

  const lines = [
    "📊 *Admin Dashboard*",
    "",
    `👥 Users with settings: ${users.length}`,
    `🔔 Active alerts: ${totalAlerts} (${activeThresholds} threshold, ${activeRules} percent)`,
    `📜 Total alert events: ${history.length}`,
    "",
    "*Recent Activity:*",
  ];

  if (history.length === 0) {
    lines.push("No alerts triggered yet.");
  } else {
    for (const h of history.slice(0, 5)) {
      const sign = h.percentChange >= 0 ? "+" : "";
      const date = new Date(h.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
      lines.push(`${date} — ${h.coin}: ${sign}${h.percentChange.toFixed(2)}%`);
    }
  }

  await ctx.reply(lines.join("\n"), {
    reply_markup: inlineKeyboard([backButton]),
    parse_mode: "Markdown",
  });
});

// ── /claim_owner flow ──

composer.command("claim_owner", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const existingOwner = await store.getOwner();
  if (existingOwner && existingOwner.chatId === chatId) {
    await ctx.reply("You are already the owner.", {
      reply_markup: inlineKeyboard([backButton]),
    });
    return;
  }

  if (existingOwner) {
    await ctx.reply(
      "Ownership is already claimed. Contact the current owner to transfer.",
      { reply_markup: inlineKeyboard([backButton]) },
    );
    return;
  }

  const code = generateClaimCode();
  ctx.session.claimOwnerCode = code;
  await ctx.reply(
    `To claim ownership, send the following code:\n\n\`${code}\`\n\nType it back exactly to confirm.`,
    { reply_markup: inlineKeyboard([backButton]) },
  );
});

composer.on("message:text").filter(
  (ctx) => typeof ctx.session.claimOwnerCode === "string",
  async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    ctx.session.messageHandled = true;
    const code = ctx.session.claimOwnerCode!;
    ctx.session.claimOwnerCode = undefined;

    const text = ctx.message?.text?.trim() ?? "";
    if (text === code) {
      await store.setOwner(chatId);
      await ctx.reply("✅ You are now the bot owner. Use /admin to view analytics.", {
        reply_markup: inlineKeyboard([backButton]),
      });
    } else {
      await ctx.reply("Code did not match. Use /claim_owner to try again.", {
        reply_markup: inlineKeyboard([backButton]),
      });
    }
  },
);

export default composer;