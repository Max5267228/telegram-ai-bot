import { generateImageBuffer } from "../grok";

export async function generateImage(prompt: string): Promise<Buffer> {
  return generateImageBuffer(prompt);
}
