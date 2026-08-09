import type { Metadata } from "next";
import { LegalPage } from "../../components/legal-page";

export const metadata: Metadata = { title: "Termini di servizio | AI Office Manager" };

export default function TermsPage() {
  return (
    <LegalPage title="Termini di servizio" intro="I presenti termini regolano l'accesso e l'utilizzo di AI Office Manager.">
      <section><h2>1. Fornitore</h2><p>Il servizio è fornito da Vincenzo Antonino Lisitano, Via Martiri di Marzabotto, 30174 Chirignago-Zelarino, codice fiscale LSTVCN98H05F158H. Contatto: <a href="mailto:lisitano95@gmail.com">lisitano95@gmail.com</a>.</p></section>
      <section><h2>2. Servizio</h2><p>AI Office Manager offre strumenti per gestione clienti, email, attività, preventivi, personale, automazioni e abbonamenti. Funzioni e limiti dipendono dal piano selezionato e possono evolvere nel tempo.</p></section>
      <section><h2>3. Account e responsabilità</h2><p>L'utente deve fornire informazioni corrette, proteggere le proprie credenziali e mantenere aggiornati i dati dell'account. È responsabile delle attività svolte dal proprio workspace, degli utenti autorizzati e della liceità dei dati caricati o collegati.</p></section>
      <section><h2>4. Prova, prezzi e pagamenti</h2><p>I piani possono includere prova gratuita, costo di configurazione e canone ricorrente secondo quanto mostrato prima dell'acquisto. Pagamenti e rinnovi sono gestiti da PayPal. L'abbonamento continua fino alla cancellazione; gli importi già maturati restano dovuti salvo diritti inderogabili.</p></section>
      <section><h2>5. Automazioni e risultati</h2><p>Classificazioni, bozze, preventivi e altre automazioni supportano il lavoro dell'utente ma possono richiedere verifica umana. L'utente deve controllare contenuti, prezzi, destinatari e decisioni prima di usarli in attività con effetti economici, legali o organizzativi.</p></section>
      <section><h2>6. Uso consentito</h2><p>È vietato usare il servizio per attività illecite, spam, violazioni di diritti, accessi non autorizzati, distribuzione di malware o tentativi di compromettere sicurezza e disponibilità. Possiamo sospendere gli account in caso di abuso o rischio per il servizio.</p></section>
      <section><h2>7. Proprietà intellettuale</h2><p>Il software, il marchio e i contenuti del servizio restano di proprietà dei rispettivi titolari. Il cliente conserva i diritti sui dati caricati e concede esclusivamente le autorizzazioni necessarie a erogare il servizio.</p></section>
      <section><h2>8. Disponibilità e responsabilità</h2><p>Adottiamo misure ragionevoli per continuità e sicurezza, ma non garantiamo assenza assoluta di interruzioni o errori. Nei limiti consentiti dalla legge, la responsabilità è limitata ai danni diretti prevedibili; restano salve le responsabilità e le tutele che non possono essere escluse.</p></section>
      <section><h2>9. Recesso e cessazione</h2><p>L'utente può cancellare l'abbonamento mediante le funzioni disponibili o contattando il fornitore. Alla cessazione l'accesso può essere disabilitato e i dati eliminati dopo i periodi di conservazione applicabili. I consumatori conservano gli eventuali diritti previsti dalla normativa vigente.</p></section>
      <section><h2>10. Legge applicabile</h2><p>I termini sono regolati dalla legge italiana. Per i consumatori è competente il foro previsto dalle norme inderogabili; negli altri casi è competente il foro determinato secondo la legge italiana.</p></section>
    </LegalPage>
  );
}