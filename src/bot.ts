import { Bot, InputFile } from "grammy";
import { getHistory, addMessage, clearHistory } from "./conversation.js";
import { chat, transcribeAudio, generateImage, analyzeImage } from "./ai.js";
import https from "https";
import http from "http";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");

const bot = new Bot(token);

function downloadUrl(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    proto.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

async function getTgFileUrl(fileId: string): Promise<{ url: string; path: string }> {
  const file = await bot.api.getFile(fileId);
  const path = file.file_path!;
  return { url: `https://api.telegram.org/file/bot${token}/${path}`, path };
}

// /start
bot.command("start", async (ctx) => {
  const name = ctx.from?.first_name || "друг";
  const me = await bot.api.getMe();
  await ctx.reply(
    `👋 Привет, ${name}!\n\n` +
    `Я умный AI-бот. Вот что умею:\n\n` +
    `💬 Отвечаю на текстовые сообщения\n` +
    `🎨 /image описание — генерирую картинки\n` +
    `🎤 Понимаю голосовые сообщения\n` +
    `🖼 Анализирую фотографии\n` +
    `🗑 /clear — очищаю историю диалога\n\n` +
    `В группах упомяни меня @${me.username} 🚀`
  );
});

// /help
bot.command("help", async (ctx) => {
  await ctx.reply(
    `📖 Команды:\n` +
    `/start — Приветствие\n` +
    `/image описание — Сгенерировать изображение\n` +
    `/clear — Очистить историю диалога\n\n` +
    `Просто пиши — отвечу на всё! ✨`
  );
});

// /clear
bot.command("clear", async (ctx) => {
  clearHistory(ctx.chat.id);
  await ctx.reply("🗑 История очищена. Начнём заново!");
});

// /image
bot.command("image", async (ctx) => {
  const prompt = ctx.match?.trim();
  if (!prompt) {
    await ctx.reply("Укажи описание: /image красивый закат над горами");
    return;
  }
  const status = await ctx.reply("🎨 Генерирую изображение...");
  try {
    const buf = await generateImage(prompt);
    await ctx.replyWithPhoto(new InputFile(buf, "image.jpg"), { caption: `🎨 ${prompt}` });
  } catch (err) {
    console.error("Image error:", err);
    await ctx.reply("❌ Ошибка генерации. Попробуй другой запрос.");
  } finally {
    await bot.api.deleteMessage(ctx.chat.id, status.message_id).catch(() => {});
  }
});

// Voice/audio
bot.on(["message:voice", "message:audio"], async (ctx) => {
  const chatId = ctx.chat.id;
  const fileId = ctx.message.voice?.file_id ?? ctx.message.audio?.file_id;
  if (!fileId) return;

  const status = await ctx.reply("🎤 Транскрибирую...");
  try {
    const { url, path } = await getTgFileUrl(fileId);
    const buf = await downloadUrl(url);
    const ext = path.split(".").pop() || "ogg";

    await bot.api.editMessageText(chatId, status.message_id, "🎤 Понимаю речь...");
    const transcript = await transcribeAudio(buf, `voice.${ext}`);

    if (!transcript.trim()) {
      await bot.api.editMessageText(chatId, status.message_id, "❌ Не удалось распознать речь.");
      return;
    }

    await bot.api.editMessageText(chatId, status.message_id, `💬 Ты сказал: ${transcript}\n\nОтвечаю...`);
    const history = getHistory(chatId);
    addMessage(chatId, "user", transcript);
    const reply = await chat(history);
    addMessage(chatId, "assistant", reply);
    await bot.api.editMessageText(chatId, status.message_id, `💬 Ты сказал: ${transcript}`);
    await ctx.reply(reply);
  } catch (err) {
    console.error("Voice error:", err);
    await bot.api.editMessageText(chatId, status.message_id, "❌ Ошибка при обработке голосового.").catch(() =>
      ctx.reply("❌ Ошибка при обработке голосового.").catch(() => {})
    );
  }
});

// Photo
bot.on("message:photo", async (ctx) => {
  const chatId = ctx.chat.id;
  const photos = ctx.message.photo;
  const best = photos[photos.length - 1];
  const status = await ctx.reply("🖼 Анализирую изображение...");
  try {
    const { url, path } = await getTgFileUrl(best.file_id);
    const buf = await downloadUrl(url);
    const ext = path.split(".").pop()?.toLowerCase() || "jpg";
    const mime = ext === "png" ? "image/png" : "image/jpeg";
    const question = ctx.message.caption || "Что изображено на фото?";
    const reply = await analyzeImage(buf, mime, question);
    addMessage(chatId, "user", `[Фото] ${question}`);
    addMessage(chatId, "assistant", reply);
    await bot.api.deleteMessage(chatId, status.message_id).catch(() => {});
    await ctx.reply(reply);
  } catch (err) {
    console.error("Photo error:", err);
    await bot.api.editMessageText(chatId, status.message_id, "❌ Ошибка при анализе фото.").catch(() =>
      ctx.reply("❌ Ошибка при анализе фото.").catch(() => {})
    );
  }
});

// Text
bot.on("message:text", async (ctx) => {
  const chatId = ctx.chat.id;
  let text = ctx.message.text;
  if (text.startsWith("/")) return;

  // In groups — only respond if mentioned or replied to
  const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
  if (isGroup) {
    const me = await bot.api.getMe();
    const mentioned = text.toLowerCase().includes(`@${me.username?.toLowerCase()}`);
    const replied = ctx.message.reply_to_message?.from?.username === me.username;
    if (!mentioned && !replied) return;
    if (me.username) text = text.replace(new RegExp(`@${me.username}`, "gi"), "").trim();
  }

  if (!text) return;

  await ctx.replyWithChatAction("typing");
  const typingInterval = setInterval(() => ctx.replyWithChatAction("typing").catch(() => {}), 4000);

  try {
    const history = getHistory(chatId);
    addMessage(chatId, "user", text);
    const reply = await chat(history);
    addMessage(chatId, "assistant", reply);
    const MAX = 4096;
    if (reply.length > MAX) {
      for (let i = 0; i < reply.length; i += MAX) await ctx.reply(reply.slice(i, i + MAX));
    } else {
      await ctx.reply(reply);
    }
  } catch (err) {
    console.error("Text error:", err);
    await ctx.reply("❌ Ошибка. Попробуй ещё раз.");
  } finally {
    clearInterval(typingInterval);
  }
});

bot.catch((err) => console.error("Bot error:", err));

bot.start().then(() => console.log("Bot started!")).catch((err) => {
  console.error("Failed to start bot:", err);
  process.exit(1);
});
