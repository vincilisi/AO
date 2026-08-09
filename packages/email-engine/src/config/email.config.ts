const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../../../../.env") });

const requiredEnv = (name) => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Variabile d'ambiente mancante: ${name}`);
  }

  return value;
};

const emailConfig = {
  imap: {
    user: requiredEnv("EMAIL_USER"),
    password: requiredEnv("EMAIL_PASS"),
    host: requiredEnv("EMAIL_IMAP_HOST"),
    port: Number(requiredEnv("EMAIL_IMAP_PORT")),
    tls: true,
    tlsOptions: {
      servername: requiredEnv("EMAIL_IMAP_HOST"),
    },
  },
  smtp: {
    host: requiredEnv("EMAIL_SMTP_HOST"),
    port: Number(requiredEnv("EMAIL_SMTP_PORT")),
    secure: true,
    auth: {
      user: requiredEnv("EMAIL_USER"),
      pass: requiredEnv("EMAIL_PASS"),
    },
  },
};

module.exports = { emailConfig };
