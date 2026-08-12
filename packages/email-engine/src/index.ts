import { pollEnabledMailboxes } from "./imap/imap.listener";
import { prisma } from "./database/client";

async function main() {
  console.log("🚀 Email Engine avviato…");

  // Test connessione DB
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("📦 Prisma connesso al database.");
  } catch (err) {
    console.error("❌ Errore connessione Prisma:", err);
  }

  // Loop IMAP infinito
  async function loop() {
    console.log("📨 Avvio polling caselle email…");

    try {
      const result = await pollEnabledMailboxes();
      console.log("📨 Polling completato:", result);
    } catch (err) {
      console.error("❌ Errore nel polling IMAP:", err);
    }

    // Attendi 10 secondi e ripeti
    setTimeout(loop, 10_000);
  }

  // Avvia il loop
  loop();

  // Mantiene vivo il processo per Render
  await new Promise(() => {});
}

main().catch((err) => {
  console.error("❌ Errore fatale nel worker:", err);
});
