import { pollEnabledMailboxes } from "../../../../../packages/email-engine/src/imap/imap.listener";
import { database } from "@ai-office/database";

export default async function handler(req, res) {
  try {
    // 🔥 Controllo autorizzazione CRON
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: "Autorizzazione cron non valida" });
    }

    // 🔥 Test DB immediato
    await database.$queryRaw`SELECT 1`;

    // 🔥 Avvia polling in background
    pollEnabledMailboxes()
      .then(result => console.log("Polling completato:", result))
      .catch(err => console.error("Errore nel polling:", err));

    // 🔥 Risposta immediata
    return res.json({ ok: true, message: "Polling avviato" });

  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
