import TelegramBot, { type Message } from "node-telegram-bot-api";
import { logger } from "../../lib/logger";
import { getHistory, addMessage } from "../conversation";
import { chatWithGrok } from "../grok";

export async function handleText(bot: TelegramBot, msg: Message): Promise<void> {
  const chatId = msg.chat.id;
  const text = msg.text!;

  const typing = setInterval(() => {
    bot.sendChatAction(chatId, "typing").catch(() => {});
  }, 4000);

  bot.sendChatAction(chatId, "typing").catch(() => {});

  try {
    const history = getHistory(chatId);
    addMessage(chatId, "user", text);

    const reply = await chatWithGrok(history);
    addMessage(chatId, "assistant", reply);

    const MAX_LENGTH = 4096;
    if (reply.length > MAX_LENGTH) {
      for (let i = 0; i < reply.length; i += MAX_LENGTH) {
        await bot.sendMessage(chatId, reply.slice(i, i + MAX_LENGTH));
      }
    } else {
      await bot.sendMessage(chatId, reply);
    }
  } catch (err) {
    logger.error({ err, chatId }, "Text handler error");
    await bot.sendMessage(chatId, "❌ Произошла ошибка. Попробуй ещё раз.");
  } finally {
    clearInterval(typing);
  }
}
