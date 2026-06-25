import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  registerMainMenuItem,
  inlineButton,
  inlineKeyboard,
} from "../toolkit/index.js";
import {
  getOwnerId,
  setOwnerId,
  getUserCount,
  getTotalAlertCount,
  getTopAlertCoins,
  getAllAlertHistoryRecords,
  getAllUserIds,
} from "../store.js";

registerMainMenuItem({ label: "🔐 Admin", data: "admin:show", order: 90 });

const composer = new Composer<Ctx>();

const botStartedAt = Date.now();

function backRow() {
  return [inlineButton("⬅️ Back to menu", "menu:main")];
}

composer.command("admin", async (ctx) => {
  const ownerId = await getOwnerId();
  if (ownerId !== ctx.from!.id) {
    await ctx.reply(
      "This command is only available to the bot owner.",
      { reply_markup: inlineKeyboard([backRow()]) },
    );
    return;
  }
  await showAdmin(ctx, undefined);
});

composer.callbackQuery("admin:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  const ownerId = await getOwnerId();
  if (ownerId !== ctx.from!.id) {
    await ctx.editMessageText(
      "This section is only available to the bot owner.",
      { reply_markup: inlineKeyboard([backRow()]) },
    );
    return;
  }
  await showAdmin(ctx, true);
});

async function showAdmin(ctx: Ctx, edit: true | undefined) {
  const userCount = await getUserCount();
  const alertCount = await getTotalAlertCount();
  const topCoins = await getTopAlertCoins(5);

  const uptimeMs = Date.now() - botStartedAt;
  const uptimeHours = Math.floor(uptimeMs / 3600000);
  const uptimeMinutes = Math.floor((uptimeMs % 3600000) / 60000);

  const memUsage = process.memoryUsage();
  const memMB = Math.round(memUsage.heapUsed / 1024 / 1024);

  let text =
    `🔐 Owner Dashboard\n\n` +
    `Total users: ${userCount}\n` +
    `Total alerts triggered: ${alertCount}\n` +
    `Uptime: ${uptimeHours}h ${uptimeMinutes}m\n` +
    `Memory: ${memMB} MB\n`;

  if (topCoins.length > 0) {
    text += "\n📊 Top Alert Coins:\n";
    for (const c of topCoins) {
      text += `${c.ticker}: ${c.count} alerts\n`;
    }
  } else {
    text += "\n📊 Top Alert Coins:\nNo alerts yet.";
  }

  const allRecords = await getAllAlertHistoryRecords();
  const thresholdCount = allRecords.filter((r) => r.alertType === "threshold").length;
  const percentCount = allRecords.filter((r) => r.alertType === "percent_move").length;
  text += `\nThreshold alerts: ${thresholdCount}\n% Move alerts: ${percentCount}`;

  const userIds = await getAllUserIds();
  const now = Date.now();
  const recent24h = allRecords.filter((r) => now - r.timestamp < 86400000).length;
  text += `\nAlerts last 24h: ${recent24h}`;
  text += `\nActive users: ${userIds.length}`;

  text += "\n\nBot status: running";

  const keyboard = inlineKeyboard([
    [inlineButton("🔄 Refresh", "admin:show")],
    backRow(),
  ]);

  if (edit) await ctx.editMessageText(text, { reply_markup: keyboard });
  else await ctx.reply(text, { reply_markup: keyboard });
}

composer.command("claim_owner", async (ctx) => {
  const currentOwner = await getOwnerId();
  if (currentOwner !== null && currentOwner !== ctx.from!.id) {
    await ctx.reply(
      "Ownership is already claimed by another user.",
      { reply_markup: inlineKeyboard([backRow()]) },
    );
    return;
  }

  await setOwnerId(ctx.from!.id);
  await ctx.reply(
    "✅ You are now the bot owner. Use /admin to view analytics.",
    { reply_markup: inlineKeyboard([backRow()]) },
  );
});

export default composer;