/**
 * Who runs this site and the legal texts (Impressum, privacy notice). Used by the React pages (/impressum,
 * /datenschutz for signed-in users, src/pages/Legal.tsx) and by the server for visitors without a session
 * (server/legalPages.ts), so both show the same text. Fill in OPERATOR before going public: while a field is empty
 * the pages show a warning instead of pretending to be complete.
 */
export const OPERATOR = {
  name: "", // legal name of the operator, e.g. "Element GmbH" or "Max Mustermann"
  street: "", // "Musterstraße 1"
  city: "", // "10115 Berlin"
  country: "Deutschland",
  email: "", // contact and privacy requests
  phone: "", // optional
  responsible: "", // person responsible for content (§ 18 Abs. 2 MStV), may equal name
  register: "", // optional: "Amtsgericht Berlin-Charlottenburg, HRB 123456"
  vatId: "", // optional: "DE123456789"
};

export const operatorComplete = () => Boolean(OPERATOR.name && OPERATOR.street && OPERATOR.city && OPERATOR.email && OPERATOR.responsible);

export type Lang = "de" | "en";
export type LegalSection = { heading: [string, string]; paragraphs: [string, string][]; list?: boolean };

export const MISSING_NOTE: [string, string] = [
  "Betreiberangaben fehlen noch: src/legal.ts ausfüllen (Name, Anschrift, E-Mail, Verantwortlicher). Bis dahin ist diese Seite unvollständig.",
  "Operator details are missing: fill in src/legal.ts (name, address, email, responsible person). Until then this page is incomplete.",
];

export const IMPRESSUM: LegalSection[] = [
  {
    heading: ["Haftung für Inhalte", "Liability for content"],
    paragraphs: [
      [
        "Marktwerte, Prognosen, Einschätzungen und Antworten des Co-Piloten sind rechnerische Auswertungen öffentlich berichteter Auktionsergebnisse und Angebote. Sie sind keine Anlage-, Rechts- oder Kaufberatung und ersetzen keine Begutachtung des einzelnen Fahrzeugs. Für die Richtigkeit, Vollständigkeit und Aktualität übernehmen wir keine Gewähr.",
        "Market values, forecasts, assessments and Co-Pilot answers are computed evaluations of publicly reported auction results and listings. They are not investment, legal or purchase advice and do not replace an inspection of the individual car. We give no guarantee for accuracy, completeness or timeliness.",
      ],
      [
        "Inserate stammen von Classic Trader, Händlerseiten und mobile.de und werden unverändert verlinkt; für deren Inhalte sind die jeweiligen Anbieter verantwortlich. Forumsbeiträge geben die Meinung ihrer Verfasser wieder; Hinweise auf rechtswidrige Inhalte nehmen wir unter der oben genannten E-Mail-Adresse entgegen und entfernen solche Inhalte umgehend.",
        "Listings come from Classic Trader, dealer sites and mobile.de and are linked unchanged; their providers are responsible for their content. Forum posts reflect their authors' opinions; reports of unlawful content can be sent to the email address above and such content is removed promptly.",
      ],
    ],
  },
  {
    heading: ["Bildnachweise", "Image credits"],
    paragraphs: [
      [
        "Fotos und Quellen sind in der App unter „Bildnachweise und Quellen“ (/bildnachweise) aufgeführt.",
        "Photos and sources are listed in the app under “Image credits and sources” (/bildnachweise).",
      ],
    ],
  },
];

export const DATENSCHUTZ: LegalSection[] = [
  {
    heading: ["2. Welche Daten wir verarbeiten", "2. What data we process"],
    paragraphs: [
      [
        "Konto: Benutzername, ein Hash des Passworts (niemals das Passwort selbst), Zeitpunkt der Registrierung und ggf. das Ablaufdatum eines Premium-Zugangs. Für die Anmeldung setzen wir ein notwendiges Sitzungs-Cookie (mip_sid), das ein Jahr gilt und bei jedem Besuch verlängert wird; gespeichert wird nur ein Hash des Sitzungsschlüssels. Fehlgeschlagene Anmeldeversuche speichern wir mit Benutzername und IP-Adresse für 24 Stunden, um Angriffe auf Passwörter zu bremsen.",
        "Account: username, a hash of the password (never the password itself), registration time and, where applicable, the expiry of premium access. Signing in sets one necessary session cookie (mip_sid), valid for a year and renewed on every visit; only a hash of the session key is stored. Failed sign-in attempts are stored with username and IP address for 24 hours to slow down password attacks.",
      ],
      [
        "Nutzung der App: Watchlist, Portfolio (Fahrzeuge mit Kaufpreis, Kaufdatum, Laufleistung, Zustand, Farbe, Notiz), Preisalarme, gemerkte Inserate, gelesene Benachrichtigungen und die zuletzt geöffnete Variante speichern wir je Konto auf dem Server, damit sie auf allen Geräten verfügbar sind; der Browser hält eine Kopie im localStorage. Der Chatverlauf des Co-Piloten liegt nur im Browser. Zur Begrenzung der Nutzung von Co-Pilot, mobile.de-Abfragen und Uploads zählen wir Anfragen je Konto für höchstens 24 Stunden.",
        "Use of the app: watchlist, portfolio (cars with purchase price, date, mileage, condition, colour, note), price alerts, saved listings, read notifications and the last opened variant are stored per account on the server so they are available on all devices; the browser keeps a copy in localStorage. The Co-Pilot chat history is kept in the browser only. To limit use of the Co-Pilot, mobile.de queries and uploads we count requests per account for at most 24 hours.",
      ],
      [
        "Gemeldete Fahrzeuge: Wenn Sie ein eigenes Fahrzeug melden, speichern wir die eingegebenen Daten (u. a. Fahrgestellnummer, Preis, Datum, Land, Gegenseite) und den hochgeladenen Kaufvertrag. Der Vertrag wird nach der Entscheidung eines Prüfers gelöscht; die geprüften Fahrzeugdaten fließen ohne Fahrgestellnummer und ohne Bezug zu Ihrem Konto in die Marktwertberechnung ein.",
        "Reported cars: when you report your own car we store the entered data (including chassis number, price, date, country, counterparty) and the uploaded purchase contract. The contract is deleted once a reviewer has decided; the verified car data enter the market value calculation without the chassis number and without reference to your account.",
      ],
      [
        "Forum: Themen und Beiträge speichern wir mit Ihrem Benutzernamen und Zeitpunkt. Entfernte oder ausgeblendete Beiträge bleiben in der Datenbank markiert und werden nicht mehr angezeigt.",
        "Forum: topics and posts are stored with your username and time. Removed or hidden posts remain marked in the database and are no longer shown.",
      ],
      [
        "Server-Protokolle: Beim Abruf der Seite verarbeitet unser Hosting-Anbieter technisch notwendige Daten (IP-Adresse, Zeitpunkt, aufgerufene Adresse, Browser) in Protokollen. Fehler der Anwendung werden mit der Fehlermeldung und der Seite, auf der sie auftraten, protokolliert. Wir setzen keine Analyse- oder Werbedienste und keine Tracking-Cookies ein.",
        "Server logs: when the site is accessed our hosting provider processes technically necessary data (IP address, time, requested address, browser) in logs. Application errors are logged with the error message and the page on which they occurred. We use no analytics or advertising services and no tracking cookies.",
      ],
    ],
  },
  {
    heading: ["3. Zwecke und Rechtsgrundlagen", "3. Purposes and legal bases"],
    list: true,
    paragraphs: [
      ["Bereitstellung des Kontos und der Funktionen: Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO).", "Providing the account and its functions: performance of a contract (Art. 6 (1) (b) GDPR)."],
      ["Sicherheit, Missbrauchsabwehr, Fehlerprotokolle: berechtigtes Interesse (Art. 6 Abs. 1 lit. f DSGVO).", "Security, abuse prevention, error logs: legitimate interest (Art. 6 (1) (f) GDPR)."],
      [
        "Fahrzeugmeldung und Nutzung der geprüften Daten in der Marktwertberechnung: Ihre Einwilligung bei der Meldung (Art. 6 Abs. 1 lit. a DSGVO), widerrufbar durch Zurückziehen der Meldung vor der Prüfung.",
        "Car reports and use of the verified data in the market value calculation: your consent given with the report (Art. 6 (1) (a) GDPR), revocable by withdrawing the report before review.",
      ],
    ],
  },
  {
    heading: ["4. Empfänger und Auftragsverarbeiter", "4. Recipients and processors"],
    list: true,
    paragraphs: [
      [
        "Hosting: Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, USA. Die Anwendung läuft in der Region Frankfurt; Vercel ist unter dem EU-US Data Privacy Framework zertifiziert, zusätzlich gelten Standardvertragsklauseln.",
        "Hosting: Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, USA. The application runs in the Frankfurt region; Vercel is certified under the EU-US Data Privacy Framework and standard contractual clauses apply in addition.",
      ],
      [
        "Datenbank: Supabase Inc. (Postgres-Datenbank in der Region Frankfurt), in der Konten, Sitzungen, gespeicherte Daten, Fahrzeugmeldungen, Verträge und Forumsbeiträge liegen.",
        "Database: Supabase Inc. (Postgres database in the Frankfurt region), holding accounts, sessions, stored data, car reports, contracts and forum posts.",
      ],
      [
        "KI-Dienste: Anthropic, PBC, San Francisco, USA. An Anthropic übermitteln wir die Nachrichten, die Sie dem Co-Piloten schreiben, zusammen mit Marktdaten und – falls vorhanden – Ihrem Portfolio und Ihrer Watchlist, sowie hochgeladene Kaufverträge mit den von Ihnen eingegebenen Fahrzeugdaten zur Vorprüfung. Anthropic verwendet Daten aus API-Anfragen nicht zum Training seiner Modelle. Rechtsgrundlage der Übermittlung sind Standardvertragsklauseln.",
        "AI services: Anthropic, PBC, San Francisco, USA. We send Anthropic the messages you write to the Co-Pilot together with market data and, where present, your portfolio and watchlist, and uploaded purchase contracts with the car data you entered for the pre-check. Anthropic does not use data from API requests to train its models. The transfer rests on standard contractual clauses.",
      ],
      [
        "Schriften: Die Oberfläche lädt Schriften von Google Fonts (Google Ireland Limited). Dabei erhält Google Ihre IP-Adresse.",
        "Fonts: the interface loads fonts from Google Fonts (Google Ireland Limited). Google receives your IP address in the process.",
      ],
      [
        "Inserate: Live-Angebote fragt unser Server bei mobile.de (mobile.de GmbH) ab; dabei werden keine Daten über Sie übermittelt. Fotos von Inseraten lädt Ihr Browser direkt vom jeweiligen Anbieter (z. B. Classic Trader, Händlerseiten, mobile.de), der dabei Ihre IP-Adresse erhält.",
        "Listings: our server queries live listings from mobile.de (mobile.de GmbH); no data about you is transmitted. Listing photos are loaded by your browser directly from the respective provider (e.g. Classic Trader, dealer sites, mobile.de), which receives your IP address.",
      ],
    ],
  },
  {
    heading: ["5. Speicherdauer", "5. Retention"],
    paragraphs: [
      [
        "Kontodaten bleiben gespeichert, bis Sie Ihr Konto löschen. Sitzungen laufen nach einem Jahr ohne Besuch ab. Kaufverträge werden mit der Prüfentscheidung gelöscht. Fehlgeschlagene Anmeldeversuche und Zähler werden nach spätestens 24 Stunden entfernt. Bei Löschung des Kontos werden Sitzungen, gespeicherte Daten und offene Fahrzeugmeldungen samt Verträgen gelöscht; geprüfte Fahrzeugdaten (ohne Fahrgestellnummer und Notizen) und Forumsbeiträge bleiben ohne Bezug zu Ihrer Person erhalten.",
        "Account data is kept until you delete your account. Sessions expire after a year without a visit. Purchase contracts are deleted with the review decision. Failed sign-in attempts and counters are removed after 24 hours at the latest. When an account is deleted, sessions, stored data and open car reports with their contracts are deleted; verified car data (without chassis number and notes) and forum posts remain without reference to you.",
      ],
    ],
  },
  {
    heading: ["6. Ihre Rechte", "6. Your rights"],
    paragraphs: [
      [
        "Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch (Art. 15 bis 21 DSGVO) sowie das Recht, sich bei einer Aufsichtsbehörde zu beschweren. Unter „Konto“ (/konto) können Sie nach der Anmeldung Ihre Daten jederzeit als Datei herunterladen, Ihr Passwort ändern und Ihr Konto löschen. Für alles Weitere schreiben Sie an die oben genannte E-Mail-Adresse.",
        "You have the right of access, rectification, erasure, restriction of processing, data portability and objection (Art. 15 to 21 GDPR), and the right to lodge a complaint with a supervisory authority. Under “Account” (/konto) you can, once signed in, download your data as a file, change your password and delete your account at any time. For anything else, write to the email address above.",
      ],
    ],
  },
  {
    heading: ["7. Änderungen", "7. Changes"],
    paragraphs: [
      [
        "Diese Erklärung beschreibt den Stand der Anwendung und wird angepasst, wenn neue Funktionen oder Dienste hinzukommen.",
        "This notice describes the current state of the application and will be updated when new functions or services are added.",
      ],
    ],
  },
];
