interface UserStats {
  name: string;
  messages: number;
}

const userStats = new Map<number, UserStats>();
let totalMessages = 0;
let voiceMessages = 0;
let photoMessages = 0;
let imageRequests = 0;
const startTime = Date.now();

export function trackMessage(userId: number, name: string, type: "text" | "voice" | "photo" | "image" = "text") {
  totalMessages++;
  if (type === "voice") voiceMessages++;
  if (type === "photo") photoMessages++;
  if (type === "image") imageRequests++;

  const existing = userStats.get(userId);
  if (existing) {
    existing.messages++;
    existing.name = name;
  } else {
    userStats.set(userId, { name, messages: 1 });
  }
}

export function getStats(): string {
  const uptimeMs = Date.now() - startTime;
  const hours = Math.floor(uptimeMs / 3600000);
  const minutes = Math.floor((uptimeMs % 3600000) / 60000);

  const top = [...userStats.entries()]
    .sort((a, b) => b[1].messages - a[1].messages)
    .slice(0, 5);

  let text = `📊 Статистика бота\n\n`;
  text += `⏱ Работает: ${hours}ч ${minutes}мин\n`;
  text += `💬 Всего сообщений: ${totalMessages}\n`;
  text += `🎤 Голосовых: ${voiceMessages}\n`;
  text += `🖼 Фото: ${photoMessages}\n`;
  text += `🎨 Генерация картинок: ${imageRequests}\n`;
  text += `👥 Пользователей: ${userStats.size}\n\n`;

  if (top.length > 0) {
    text += `🏆 Топ активных:\n`;
    top.forEach(([, u], i) => {
      const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
      text += `${medals[i]} ${u.name} — ${u.messages} сообщ.\n`;
    });
  }

  return text;
}
