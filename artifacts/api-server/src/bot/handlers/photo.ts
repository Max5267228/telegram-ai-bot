import TelegramBot, { type Message } from "node-telegram-bot-api";
import https from "https";
import http from "http";
import { logger } from "../../lib/logger";
import { getHistory, addMessage } from "../conversation";
import { analyzeImage } from "../grok";

async function downloadFile(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    protocol.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

export async function handlePhoto(bot: TelegramBot, msg: Message): Promise<void> {
  const chatId = msg.chat.id;
  const caption = msg.caption || "";

  const photos = msg.photo;
  if (!photos || photos.length === 0) return;

  const bestPhoto = photos[photos.length - 1];
  const fileId = bestPhoto.file_id;

  bot.sendChatAction(chatId, "typing").catch(() => {});
  const statusMsg = await bot.sendMessage(chatId, "🖼 Анализирую изображение...");

  try {
    const file = await bot.getFile(fileId);
    const filePath = file.file_path;

    if (!filePath) {
      throw new Error("Could not get file path");
    }

    const token = process.env["TELEGRAM_BOT_TOKEN"]!;
    const fileUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;

    const imageBuffer = await downloadFile(fileUrl);

    const ext = filePath.split(".").pop()?.toLowerCase() || "jpg";
    const mimeType = ext === "png" ? "image/png" : "image/jpeg";

    const question = caption || "Что изображено на фото?";
    const reply = await analyzeImage(imageBuffer, mimeType, question);

    getHistory(chatId);
    addMessage(chatId, "user", `[Фото] ${question}`);
    addMessage(chatId, "assistant", reply);

    await bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});

    const MAX_LENGTH = 4096;
    if (reply.length > MAX_LENGTH) {
      for (let i = 0; i < reply.length; i += MAX_LENGTH) {
        await bot.sendMessage(chatId, reply.slice(i, i + MAX_LENGTH));
      }
    } else {
      await bot.sendMessage(chatId, reply);
    }
  } catch (err) {
    logger.error({ err, chatId }, "Photo handler error");
    await bot.editMessageText("❌ Ошибка при анализе изображения.", {
      chat_id: chatId,
      message_id: statusMsg.message_id,
    }).catch(() => {
      bot.sendMessage(chatId, "❌ Ошибка при анализе изображения.");
    });
  }
}
