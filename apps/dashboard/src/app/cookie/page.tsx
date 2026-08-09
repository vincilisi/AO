import type { Metadata } from "next";
import { LegalPage } from "../../components/legal-page";

export const metadata: Metadata = { title: "Cookie Policy | AI Office Manager" };

export default function CookiePage() {
  return (
    <LegalPage title="Cookie Policy" intro="AI Office Manager non utilizza cookie pubblicitari, di profilazione o analitici di terze parti.">
      <section><h2>1. Tecnologie utilizzate</h2><p>L'app memorizza nel browser un token di sessione tramite localStorage per mantenere l'accesso e usa un service worker con cache tecnica per l'installazione PWA e l'apertura dell'interfaccia. Queste tecnologie sono necessarie al funzionamento richiesto dall'utente.</p></section>
      <section><h2>2. Cookie del sito</h2><p>Il sito non imposta attualmente cookie propri per profilazione, marketing o misurazione del pubblico. Di conseguenza non viene mostrato un banner di consenso per finalità non presenti.</p></section>
      <section><h2>3. Servizi esterni</h2><p>Quando l'utente sceglie di procedere al pagamento viene reindirizzato a PayPal, che applica la propria informativa e può usare cookie sul proprio dominio. Le caselle email collegate restano soggette anche alle condizioni del provider scelto dall'utente.</p></section>
      <section><h2>4. Gestione e cancellazione</h2><p>È possibile rimuovere il token effettuando il logout o cancellando i dati del sito dalle impostazioni del browser. La cache PWA può essere eliminata disinstallando l'app o cancellando i dati del sito; questa operazione può richiedere un nuovo accesso.</p></section>
      <section><h2>5. Modifiche e contatti</h2><p>Se in futuro verranno introdotti strumenti non essenziali, questa policy e gli eventuali meccanismi di consenso saranno aggiornati prima dell'attivazione. Per domande scrivere a <a href="mailto:lisitano95@gmail.com">lisitano95@gmail.com</a>.</p></section>
    </LegalPage>
  );
}