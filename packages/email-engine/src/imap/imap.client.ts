const Imap = require("imap");
const { emailConfig } = require("../config/email.config");
const { logger } = require("../utils/logger");

const imapClient = new Imap(emailConfig.imap);

imapClient.on("error", (err) => {
  logger.error("IMAP error:", err);
});

module.exports = { imapClient };
