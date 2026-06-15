interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

const histories = new Map<number, Message[]>();

const SYSTEM_PROMPT = `Ты умный и дружелюбный ассистент. Отвечай на русском языке, если пользователь пишет по-русски. Будь полезным, точным и интересным собеседником. Можешь использовать эмодзи для живости общения.`;

const MAX_HISTORY = 20;

export function getHistory(chatId: number): Message[] {
  if (!histories.has(chatId)) {
    histories.set(chatId, [{ role: "system", content: SYSTEM_PROMPT }]);
  }
  return histories.get(chatId)!;
}

export function addMessage(chatId: number, role: "user" | "assistant", content: string): void {
  const history = getHistory(chatId);
  history.push({ role, content });
  const systemMsg = history[0];
  const rest = history.slice(1);
  if (rest.length > MAX_HISTORY) {
    histories.set(chatId, [systemMsg, ...rest.slice(rest.length - MAX_HISTORY)]);
  }
}

export function clearHistory(chatId: number): void {
  histories.delete(chatId);
}
