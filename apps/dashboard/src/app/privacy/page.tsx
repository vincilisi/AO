import type { Metadata } from "next";
import { LegalPage } from "../../components/legal-page";

export const metadata: Metadata = { title: "Privacy Policy | AI Office Manager" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" intro="Questa informativa descrive come AI Office Manager tratta i dati personali ai sensi del Regolamento (UE) 2016/679 (GDPR).">
      <section><h2>1. Titolare del trattamento</h2><p>Il titolare è Vincenzo Antonino Lisitano, Via Martiri di Marzabotto, 30174 Chirignago-Zelarino, codice fiscale LSTVCN98H05F158H. Contatto: <a href="mailto:lisitano95@gmail.com">lisitano95@gmail.com</a>.</p></section>
      <section><h2>2. Dati trattati</h2><p>Trattiamo dati di registrazione e contatto, dati aziendali, contenuti inseriti nei moduli CRM e HR, email e allegati delle caselle collegate, preventivi, attività, informazioni sugli abbonamenti e dati tecnici necessari a sicurezza e funzionamento. I dati di pagamento sono gestiti direttamente da PayPal e non memorizziamo i dati completi degli strumenti di pagamento.</p></section>
      <section><h2>3. Finalità e basi giuridiche</h2><p>I dati sono usati per creare e amministrare l'account, erogare il servizio, elaborare email e automazioni richieste, fornire assistenza, prevenire abusi e adempiere obblighi amministrativi e legali. Le basi giuridiche sono l'esecuzione del contratto, gli obblighi di legge e il legittimo interesse alla sicurezza e al miglioramento del servizio; quando necessario viene richiesto il consenso.</p></section>
      <section><h2>4. Fornitori e destinatari</h2><p>I dati possono essere trattati da fornitori nominati secondo i rispettivi ruoli, inclusi Vercel per hosting e distribuzione, Neon per il database, PayPal per pagamenti e abbonamenti e i provider email scelti dall'utente. I dati non vengono venduti.</p></section>
      <section><h2>5. Trasferimenti internazionali</h2><p>Alcuni fornitori possono trattare dati fuori dallo Spazio Economico Europeo. In tali casi il trasferimento avviene sulla base di decisioni di adeguatezza, clausole contrattuali standard o altre garanzie previste dal GDPR.</p></section>
      <section><h2>6. Conservazione e sicurezza</h2><p>I dati sono conservati per la durata del rapporto e successivamente per il tempo necessario agli obblighi di legge o alla tutela dei diritti. Le credenziali delle caselle email sono cifrate; account, sessioni e dati applicativi sono isolati per azienda. Nessun sistema può tuttavia garantire sicurezza assoluta.</p></section>
      <section><h2>7. Diritti</h2><p>Puoi chiedere accesso, rettifica, cancellazione, limitazione, portabilità o opposizione, e revocare un eventuale consenso, scrivendo al contatto indicato. Puoi inoltre proporre reclamo al Garante per la protezione dei dati personali.</p></section>
      <section><h2>8. Dati inseriti dai clienti</h2><p>Quando un'azienda usa il servizio per trattare dati di propri clienti, dipendenti o contatti, l'azienda determina finalità e modalità di tale trattamento e deve fornire le informative e disporre delle basi giuridiche necessarie.</p></section>
      <section><h2>9. Modifiche</h2><p>Questa informativa può essere aggiornata per cambiamenti normativi o del servizio. La versione vigente è sempre pubblicata in questa pagina.</p></section>
    </LegalPage>
  );
}