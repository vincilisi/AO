const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
const { startImapListener } = require("./src/imap/imap.listener");
const { logger } = require("./src/utils/logger");

logger.info("Avvio Email Engine...");
startImapListener();
