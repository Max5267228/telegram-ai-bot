import { startBot } from "./bot";
import { logger } from "./lib/logger";

logger.info("Starting Telegram bot in standalone mode...");

try {
  startBot();
  logger.info("Telegram bot is running 24/7");
} catch (err) {
  logger.error({ err }, "Failed to start bot");
  process.exit(1);
}
