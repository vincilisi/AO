# AI Office Manager

> Applicazione multi-tenant con dashboard Next.js, API Fastify, PostgreSQL, autenticazione, CRM, preventivi PDF, Email Engine IMAP/SMTP, AI e automazioni.

## Stato prodotto

- [x] **Dashboard Next.js** moderna e responsive
- [x] **Sistema di login / registrazione** multi-tenant
- [x] **Onboarding email automatico** con configurazione AI, moduli e connessione IMAP/SMTP guidata
- [x] **PWA installabile** su desktop, Android e iOS con aggiornamenti automatici

## Avvio rapido

Prerequisiti: Node.js 20+, npm e PostgreSQL 16+ (oppure Docker). Dalla radice del repository:

```powershell
npm install
npm run db:generate
npm run db:migrate
npm run dev
```

Aprire `http://localhost:3000`. L'API risponde su `http://127.0.0.1:4000`.

La documentazione REST interattiva è disponibile su `http://127.0.0.1:4000/api/docs`; la specifica OpenAPI JSON è esposta da `http://127.0.0.1:4000/api/openapi.json`.

### Installazione come app

In produzione, pubblicare la dashboard tramite HTTPS. Da Chrome o Edge usare **Installa app**; su iPhone e iPad usare **Condividi → Aggiungi alla schermata Home**. La PWA usa modalità standalone, icone dedicate e una cache dell'app shell che consente di aprire l'interfaccia anche senza rete; le operazioni sui dati richiedono comunque la connessione all'API.

Per avviare il listener email in un terminale separato:

```powershell
npm run dev:email
```

Creare `.env` partendo da `.env.example`. Per avviare PostgreSQL con Docker:

```powershell
docker compose -f infra/docker/docker-compose.yml up -d
```

Al primo accesso registrare l'utente e l'azienda. L'onboarding configura moduli, tono, firma e istruzioni AI e guida al collegamento della prima casella. Sessioni, clienti, timeline CRM, email, attività, personale, presenze, report, preventivi, revisioni, ordini, ticket e automazioni sono persistiti in PostgreSQL e isolati per azienda.

Ogni azienda collega una o più caselle da **Email engine → Aggiungi casella**. Le credenziali sono cifrate nel database e il worker carica automaticamente tutte le caselle abilitate: non esiste una casella email globale condivisa tramite `.env`.

## Come verificare che funziona

1. Avvia API e dashboard con `npm run dev`, poi apri `http://localhost:3000` e registra azienda e amministratore.
2. Crea un cliente nella sezione **Clienti**.
3. Crea un preventivo, apri il PDF salvato e invialo al cliente. L'email include il PDF e mette in copia l'indirizzo dell'azienda.
4. Apri **Email engine**, modifica il messaggio di prova e premi **Esegui pipeline**. Classificazione e task vengono salvati e mostrati in **Attività**.
5. Per una prova Gmail reale, lascia API e dashboard attive e avvia `npm run dev:email` in un altro terminale. Invia una nuova email all'account configurato: il listener inoltra il messaggio autenticato all'API.
6. Esegui `npm run check`, `npm run build` e `npm audit --omit=dev` prima del rilascio.

### PayPal

Creare un'app nel PayPal Developer Dashboard e impostare `PAYPAL_ENVIRONMENT`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` e `PAYPAL_WEBHOOK_ID` nel file `.env`. Usare `sandbox` durante lo sviluppo e `live` solo dopo i test.

Nel Developer Dashboard registrare un webhook pubblico HTTPS diretto a `/api/paypal/webhook`. Sottoscrivere almeno gli eventi `BILLING.SUBSCRIPTION.ACTIVATED`, `BILLING.SUBSCRIPTION.UPDATED`, `BILLING.SUBSCRIPTION.SUSPENDED`, `BILLING.SUBSCRIPTION.CANCELLED`, `BILLING.SUBSCRIPTION.EXPIRED`, `BILLING.SUBSCRIPTION.PAYMENT.FAILED` e `PAYMENT.SALE.COMPLETED`. Per lo sviluppo locale esporre temporaneamente la porta API con un tunnel HTTPS.

L'API crea prodotto, piano e abbonamento PayPal con installazione una tantum, 14 giorni di prova e canone mensile. PayPal ospita l'approvazione e consente al cliente di gestire il pagamento automatico dal proprio account.

### Stato delle integrazioni

- **Reale e attivo:** registrazione, login, onboarding e sessioni; isolamento per azienda; PostgreSQL; CRM con timeline e preferenze; HR con presenze e report; preventivi con sconti, revisioni, follow-up, PDF e conversione in ordine; invio SMTP; IMAP; automazioni configurabili; API HTTP, OpenAPI e WebSocket.
- **SaaS:** catalogo piani server-side, prova di 14 giorni, approvazione PayPal, costo di installazione, webhook verificato e stato persistito in PostgreSQL.
- **Automatico:** una richiesta di preventivo ricevuta via email crea o aggiorna il cliente, riconosce voci e quantità, genera e invia il PDF dalla casella principale. Se un dato è assente o ambiguo, chiede un chiarimento senza inventare prezzi.
- **Non configurato:** provider AI esterno, WhatsApp, ERP e payroll. L'AI attuale usa regole locali deterministiche.

### Piani SaaS

| Segmento | Piano | Canone | Installazione |
| --- | --- | ---: | ---: |
| Professionista | Base | 49 €/mese | 190 € |
| Team in crescita | Pro | 99 €/mese | 490 € |
| Piccola azienda | Business | 199 €/mese | 990 € |
| Grande azienda | Enterprise | 749 €/mese | 4.900 € |

Le stime di ore recuperabili indicano capacità operativa potenziale e non costituiscono una garanzia di guadagno.

---

AI Office Manager è un agente aziendale intelligente, configurabile e modulare, progettato per sostituire e potenziare i ruoli d’ufficio tradizionali.  
Lavora come receptionist, segretaria, responsabile amministrativo, gestore del personale, customer care e commerciale.  
È un dipendente digitale che non dorme, non sbaglia, non si stanca.

Il sistema integra email, CRM, gestione personale, preventivi, automazioni e un AI Core avanzato.

---

# 🚀 Visione del progetto

AI Office Manager nasce per automatizzare completamente la gestione delle comunicazioni e dei processi aziendali:

- Legge e capisce le email
- Risponde in modo professionale
- Smista automaticamente nelle cartelle corrette
- Genera preventivi e offerte
- Gestisce clienti e storico conversazioni
- Registra presenze e ore lavoro
- Prepara riunioni e report
- Attiva automazioni intelligenti
- Monitora scadenze e rischi
- Funziona 24/7 senza intervento umano

---

# 🧩 I 6 moduli fondamentali

## 1. Gestione email intelligente
- Legge le email in arrivo
- Capisce il contesto
- Risponde in modo professionale
- Assegna priorità
- Crea task automatici
- Smista ai reparti giusti
- Organizza la casella email

## 2. Creazione automatica preventivi
- Analizza la richiesta del cliente
- Genera preventivi PDF/HTML
- Applica listini, sconti e condizioni
- Invia automaticamente
- Gestisce revisioni e follow‑up
- Converte preventivo → ordine

## 3. Gestione personale e ore lavoro
- Registra presenze
- Calcola ore, straordinari, ferie
- Genera report settimanali
- Invia alert se mancano dati
- Sincronizza con payroll

## 4. Gestione clienti (CRM)
- CRM integrato
- Storico conversazioni
- Preferenze cliente
- Task automatici
- Follow‑up programmati
- Analisi soddisfazione

## 5. Assistente operativo
- Prepara riunioni
- Genera report
- Analizza performance
- Suggerisce decisioni
- Monitora scadenze e rischi

## 6. Automazioni d’ufficio
- Email → task
- Preventivo → ordine
- Richiesta cliente → ticket
- Presenze → report
- Scadenza → notifica

---

# 🧠 Architettura tecnica

## Tecnologie principali
- **Next.js** (dashboard premium con animazioni)
- **Node.js** (motore eventi)
- **Prisma** (ORM)
- **PostgreSQL** (database)
- **AI Orchestrator** (decisioni intelligenti)
- **Webhooks** (integrazione software aziendali)
- **API REST + WebSocket** (aggiornamenti live)

## Struttura del repository

ai-office-manager/
│
├── packages/
│   ├── email-engine/          # Motore IMAP/SMTP
│   ├── crm/                   # Gestione clienti
│   ├── hr/                    # Gestione personale
│   ├── preventivi/            # Generazione preventivi
│   ├── ai-core/               # Motore AI
│   ├── automations/           # Workflow automatici
│
├── dashboard/                 # Interfaccia Next.js
│
├── database/                  # Prisma + PostgreSQL
│
└── docs/                      # Documentazione

---

# 🔌 Modulo Email Engine

Funzionalità:
- Connessione IMAP
- Lettura email
- Parsing contenuti
- Classificazione
- Smistamento automatico
- Creazione/cancellazione cartelle
- Risposta intelligente

Pipeline:
1. Arriva una nuova email
2. Parsing oggetto + testo
3. Classificazione contenuto
4. Smistamento cartella corretta
5. Automazioni
6. Risposta AI (opzionale)
7. Logging + dashboard

---

# 📄 Modulo Preventivi

Funzionalità:
- Analisi richiesta cliente
- Generazione preventivo PDF/HTML
- Applicazione listini e sconti
- Invio automatico
- Gestione revisioni
- Follow‑up programmati
- Conversione preventivo → ordine

---

# 👥 Modulo Gestione Personale

Funzionalità:
- Registrazione presenze
- Calcolo ore e straordinari
- Ferie e permessi
- Report settimanali
- Alert mancanza dati
- Sincronizzazione payroll

---

# 🧑‍💼 Modulo CRM

Funzionalità:
- Schede cliente
- Storico conversazioni
- Preferenze
- Task automatici
- Follow‑up
- Analisi soddisfazione

---

# 📊 Modulo Assistente Operativo

Funzionalità:
- Preparazione riunioni
- Generazione report
- Analisi performance
- Suggerimento decisioni
- Monitoraggio scadenze

---

# ⚙️ Modulo Automazioni

Esempi:
- Email → task
- Preventivo → ordine
- Cliente → ticket
- Presenze → report
- Scadenza → notifica

---

# 🧠 Logica dell’agente

## Profilo configurabile
L’azienda imposta il ruolo dell’agente:
- receptionist
- amministrazione
- commerciale
- HR
- customer care

## Policy operative
- tono comunicazione
- priorità
- limiti
- automazioni attive

## Memoria aziendale
- clienti
- listini
- procedure interne
- storico attività

## Azioni automatiche
- rispondere
- creare task
- assegnare attività
- notificare reparti
- generare documenti

---

# 🚀 Roadmap

- Dashboard avanzata
- Analisi sentiment
- Modulo ticketing
- Integrazione ERP
- Integrazione WhatsApp Business
- Modulo allegati intelligente
- Modulo estrazione PDF
- Modulo firma digitale
- Modulo telefonate VoIP
- Modulo calendario intelligente

---

# 📄 Licenza

MIT

---

# 👤 Autore

AI Office Manager — sviluppato da Vincenzo.
