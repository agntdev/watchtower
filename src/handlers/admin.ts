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
} from "../store.js";

registerMainMenuItem({ label: "🔐 Admin", data: "admin:show", order: 90 });

const composer = new Composer<Ctx>();

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

  const text =
    `🔐 Owner Dashboard\n\n` +
    `Total users: ${userCount}\n` +
    `Total alerts triggered: ${alertCount}\n` +
    `Bot status: running`;

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