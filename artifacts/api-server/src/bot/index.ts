import TelegramBot, { type Message } from "node-telegram-bot-api";
import { logger } from "../lib/logger";
import { handleText } from "./handlers/text";
import { handleVoice } from "./handlers/voice";
import { handlePhoto } from "./handlers/photo";

const token = process.env["TELEGRAM_BOT_TOKEN"];

if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN is required");
}

const validToken: string = token;
let bot: TelegramBot | null = null;
let botUsername: string | null = null;

export function getBot(): TelegramBot {
  if (!bot) {
    throw new Error("Bot not initialized");
  }
  return bot;
}

function isGroupChat(msg: Message): boolean {
  return msg.chat.type === "group" || msg.chat.type === "supergroup";
}

function isBotMentioned(msg: Message): boolean {
  if (!botUsername) return false;
  const text = msg.text || msg.caption || "";
  return text.toLowerCase().includes(`@${botUsername.toLowerCase()}`);
}

function isBotReplied(msg: Message): boolean {
  return msg.reply_to_message?.from?.username === botUsername;
}

function shouldRespond(msg: Message): boolean {
  if (!isGroupChat(msg)) return true;
  return isBotMentioned(msg) || isBotReplied(msg);
}

function cleanMention(text: string): string {
  if (!botUsername) return text;
  return text.replace(new RegExp(`@${botUsername}`, "gi"), "").trim();
}

export function startBot(): void {
  bot = new TelegramBot(validToken, { polling: true });

  logger.info("Telegram bot started with polling");

  bot.getMe().then((info) => {
    botUsername = info.username ?? null;
    logger.info({ botUsername }, "Bot username fetched");
  }).catch((err) => {
    logger.error({ err }, "Failed to get bot info");
  });

  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.from?.first_name || "друг";
    try {
      await bot!.sendMessage(
        chatId,
        `👋 Привет, ${firstName}!\n\n` +
          `Я умный бот на базе Gemma AI. Вот что я умею:\n\n` +
          `💬 Отвечаю на текстовые сообщения — просто пиши мне\n` +
          `🎨 Генерирую изображения — напиши /image и описание\n` +
          `🎤 Понимаю голосовые — отправь голосовое сообщение\n` +
          `🖼 Анализирую фото — отправь фотографию с вопросом\n\n` +
          `В группах — упомяни меня @${botUsername ?? "бот"} или ответь на моё сообщение\n\n` +
          `Лимитов нет — пиши сколько хочешь! 🚀`
      );
    } catch (err) {
      logger.error({ err }, "Start handler error");
    }
  });

  bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    try {
      await bot!.sendMessage(
        chatId,
        `📖 Помощь\n\n` +
          `Команды:\n` +
          `/start — Приветствие\n` +
          `/help — Эта справка\n` +
          `/image описание — Сгенерировать изображение\n` +
          `/clear — Очистить историю диалога\n\n` +
          `Возможности:\n` +
          `• Просто пиши — получишь ответ от Gemma\n` +
          `• Отправь голосовое — я его транскрибирую и отвечу\n` +
          `• Отправь фото с подписью — я его опишу и отвечу\n` +
          `• Используй /image для генерации картинок\n\n` +
          `В группах:\n` +
          `• Упомяни @${botUsername ?? "бот"} в сообщении\n` +
          `• Или ответь на моё сообщение\n\n` +
          `Без лимитов — пиши сколько угодно! ✨`
      );
    } catch (err) {
      logger.error({ err }, "Help handler error");
    }
  });

  bot.onText(/\/clear/, async (msg) => {
    const chatId = msg.chat.id;
    try {
      const { clearHistory } = await import("./conversation");
      clearHistory(chatId);
      await bot!.sendMessage(chatId, "🗑 История диалога очищена. Начнём заново!");
    } catch (err) {
      logger.error({ err }, "Clear handler error");
    }
  });

  bot.onText(/\/image(?:@\S+)?\s+(.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (isGroupChat(msg) && !isBotMentioned(msg) && !isBotReplied(msg)) return;
    const prompt = match?.[1];
    if (!prompt) return;

    let thinkingId: number | undefined;
    try {
      const thinking = await bot!.sendMessage(chatId, "🎨 Генерирую изображение...");
      thinkingId = thinking.message_id;
      const { generateImage } = await import("./handlers/image");
      const imageBuffer = await generateImage(prompt);
      await bot!.sendPhoto(chatId, imageBuffer, { caption: `🎨 ${prompt}` });
    } catch (err) {
      logger.error({ err }, "Image generation error");
      await bot!.sendMessage(chatId, "❌ Ошибка при генерации изображения. Попробуй другой запрос.").catch(() => {});
    } finally {
      if (thinkingId) {
        await bot!.deleteMessage(chatId, thinkingId).catch(() => {});
      }
    }
  });

  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    try {
      if (msg.text?.match(/^\/\w+/)) return;

      if (!shouldRespond(msg)) return;

      if (msg.voice || msg.audio) {
        await handleVoice(bot!, msg);
        return;
      }

      if (msg.photo) {
        await handlePhoto(bot!, msg);
        return;
      }

      if (msg.text) {
        const cleanedMsg = { ...msg, text: cleanMention(msg.text) };
        await handleText(bot!, cleanedMsg);
        return;
      }
    } catch (err) {
      logger.error({ err, chatId }, "Message handler error");
      await bot!.sendMessage(chatId, "❌ Произошла ошибка. Попробуй ещё раз.").catch(() => {});
    }
  });

  bot.on("polling_error", (err) => {
    logger.error({ err }, "Bot polling error");
  });

  bot.on("error", (err) => {
    logger.error({ err }, "Bot error");
  });

  logger.info("Bot event handlers registered");
}
