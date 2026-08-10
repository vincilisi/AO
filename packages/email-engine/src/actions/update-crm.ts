import { database } from "@ai-office/database";

export const updateCrm = async (email: {
  from: string;
  subject: string;
  messageId: string;
}) => {
  // 🔥 Normalizza email del cliente
  const customerEmail = email.from?.trim().toLowerCase();

  if (!customerEmail) {
    throw new Error("Email del cliente non valida");
  }

  // 🔥 Cerca cliente esistente
  let customer = await database.customer.findUnique({
    where: { email: customerEmail }
  });

  // 🔥 Se non esiste → crealo
  if (!customer) {
    customer = await database.customer.create({
      data: {
        email: customerEmail,
        name: customerEmail.split("@")[0], // fallback
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    });
  }

  // 🔥 Aggiorna ultimo contatto
  await database.customer.update({
    where: { email: customerEmail },
    data: {
      lastContact: new Date(),
      lastEmailSubject: email.subject,
      updatedAt: new Date(),
    }
  });

  // 🔥 Registra lo storico email
  await database.emailHistory.create({
    data: {
      customerEmail,
      subject: email.subject,
      messageId: email.messageId,
      createdAt: new Date(),
    }
  });

  return {
    ok: true,
    customer: customerEmail,
    updated: true,
  };
};
