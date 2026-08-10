import { pollEnabledMailboxes } from "../../imap/imap.listener";
import { database } from "@ai-office/database";

export default async function handler(req, res) {
  try {
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: "Autorizzazione cron non valida" });
    }

    await database.$queryRaw`SELECT 1`;

    pollEnabledMailboxes()
      .then(result => console.log("Polling completato:", result))
      .catch(err => console.error("Errore nel polling:", err));

    return res.json({ ok: true, message: "Polling avviato" });

  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
