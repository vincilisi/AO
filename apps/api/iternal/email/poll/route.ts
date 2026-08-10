import { NextResponse } from "next/server";
import { pollEnabledMailboxes } from "@/lib/email/poll";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    // 🔥 Test DB immediato (evita timeout GitHub)
    await prisma.$queryRaw`SELECT 1`;

    // 🔥 Avvia il polling in background (NON blocca la risposta)
    pollEnabledMailboxes()
      .then(result => {
        console.log("Polling completato:", result);
      })
      .catch(err => {
        console.error("Errore nel polling:", err);
      });

    // 🔥 Risposta immediata a GitHub Actions
    return NextResponse.json({
      ok: true,
      message: "Polling avviato"
    });

  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: 500 }
    );
  }
}
