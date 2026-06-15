import { HfInference } from "@huggingface/inference";

const hfToken = process.env.HF_API_TOKEN;
if (!hfToken) throw new Error("HF_API_TOKEN is required");

export const hf = new HfInference(hfToken);

const TEXT_MODEL = "google/gemma-3-27b-it";
const IMAGE_MODEL = "black-forest-labs/FLUX.1-schnell";
const AUDIO_MODEL = "openai/whisper-large-v3-turbo";

export async function chat(
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>
): Promise<string> {
  const result = await hf.chatCompletion({ model: TEXT_MODEL, messages, max_tokens: 2048 });
  return result.choices[0]?.message?.content ?? "Не удалось получить ответ.";
}

export async function transcribeAudio(audioBuffer: Buffer, filename: string): Promise<string> {
  const ext = filename.split(".").pop()?.toLowerCase() || "ogg";
  const mimeMap: Record<string, string> = {
    ogg: "audio/ogg", oga: "audio/ogg", mp3: "audio/mpeg",
    mp4: "audio/mp4", wav: "audio/wav", m4a: "audio/mp4", webm: "audio/webm",
  };
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeMap[ext] ?? "audio/ogg" });
  const result = await hf.automaticSpeechRecognition({ model: AUDIO_MODEL, data: blob });
  return result.text ?? "";
}

export async function generateImage(prompt: string): Promise<Buffer> {
  const result = await hf.textToImage({
    model: IMAGE_MODEL, inputs: prompt,
    parameters: { num_inference_steps: 4 },
  });
  const arrayBuffer = await (result as unknown as Blob).arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function analyzeImage(imageBuffer: Buffer, mimeType: string, question: string): Promise<string> {
  const blob = new Blob([new Uint8Array(imageBuffer)], { type: mimeType });
  const captionResult = await hf.imageToText({
    model: "Salesforce/blip-image-captioning-large",
    data: blob,
  });
  const caption = captionResult.generated_text?.trim() || "";
  if (!caption) return "Не удалось описать изображение.";
  const prompt = question && question !== "Что изображено на фото?"
    ? `На изображении: "${caption}". Пользователь спрашивает: "${question}". Ответь на русском языке подробно.`
    : `На изображении: "${caption}". Опиши подробно на русском языке что изображено.`;
  return chat([
    { role: "system", content: "Ты помощник который анализирует изображения. Отвечай на русском языке." },
    { role: "user", content: prompt },
  ]);
}
