import TelegramBot, { type Message } from "node-telegram-bot-api";
import https from "https";
import http from "http";
import { logger } from "../../lib/logger";
import { getHistory, addMessage } from "../conversation";
import { chatWithGrok, transcribeAudio } from "../grok";

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

export async function handleVoice(bot: TelegramBot, msg: Message): Promise<void> {
  const chatId = msg.chat.id;
  const fileId = msg.voice?.file_id || msg.audio?.file_id;

  if (!fileId) return;

  bot.sendChatAction(chatId, "typing").catch(() => {});
  const statusMsg = await bot.sendMessage(chatId, "🎤 Транскрибирую голосовое...");

  try {
    const file = await bot.getFile(fileId);
    const filePath = file.file_path;

    if (!filePath) {
      throw new Error("Could not get file path");
    }

    const token = process.env["TELEGRAM_BOT_TOKEN"]!;
    const fileUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;

    const audioBuffer = await downloadFile(fileUrl);

    const ext = filePath.split(".").pop() || "ogg";
    const filename = `voice.${ext}`;

    await bot.editMessageText("🎤 Понимаю что сказано...", {
      chat_id: chatId,
      message_id: statusMsg.message_id,
    });

    const transcript = await transcribeAudio(audioBuffer, filename);

    if (!transcript.trim()) {
      await bot.editMessageText("❌ Не удалось распознать речь. Попробуй снова.", {
        chat_id: chatId,
        message_id: statusMsg.message_id,
      });
      return;
    }

    await bot.editMessageText(`💬 *Ты сказал:* ${transcript}\n\n_Отвечаю..._`, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: "Markdown",
    });

    const history = getHistory(chatId);
    addMessage(chatId, "user", transcript);

    bot.sendChatAction(chatId, "typing").catch(() => {});

    const reply = await chatWithGrok(history);
    addMessage(chatId, "assistant", reply);

    await bot.editMessageText(`💬 *Ты сказал:* ${transcript}`, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: "Markdown",
    });

    const MAX_LENGTH = 4096;
    if (reply.length > MAX_LENGTH) {
      for (let i = 0; i < reply.length; i += MAX_LENGTH) {
        await bot.sendMessage(chatId, reply.slice(i, i + MAX_LENGTH));
      }
    } else {
      await bot.sendMessage(chatId, reply);
    }
  } catch (err) {
    logger.error({ err, chatId }, "Voice handler error");
    await bot.editMessageText("❌ Ошибка при обработке голосового сообщения.", {
      chat_id: chatId,
      message_id: statusMsg.message_id,
    }).catch(() => {
      bot.sendMessage(chatId, "❌ Ошибка при обработке голосового сообщения.");
    });
  }
}
