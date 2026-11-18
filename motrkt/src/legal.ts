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

/** Date of the privacy notice's wording, shown at its end. Change it with every change to DATENSCHUTZ. */
export const PRIVACY_AS_OF: [string, string] = ["18. November 2026", "18 November 2026"];

/**
 * The privacy notice. Every sentence describes what the code does: when a storage period (server/userCars.ts
 * RETENTION), a recipient or a stored field changes, change the sentence here too, and DATENSCHUTZ.md with it.
 */
export const DATENSCHUTZ: LegalSection[] = [
  {
    heading: ["2. Das Wichtigste in Kürze", "2. The essentials"],
    list: true,
    paragraphs: [
      [
        "Für ein Konto genügen ein Benutzername und ein Passwort. Wir fragen weder nach Ihrem Namen noch nach einer E-Mail-Adresse.",
        "An account needs only a username and a password. We ask for neither your name nor an email address.",
      ],
      [
        "Wir setzen keine Analyse- oder Werbedienste, keine Tracking-Cookies und keine eingebundenen Inhalte sozialer Netzwerke ein. Schriften liefern wir von unserem eigenen Server aus.",
        "We use no analytics or advertising services, no tracking cookies and no embedded social network content. Typefaces are served from our own server.",
      ],
      [
        "Anwendung und Datenbank laufen in Rechenzentren in Frankfurt am Main.",
        "The application and the database run in data centres in Frankfurt am Main.",
      ],
      [
        "Hochgeladene Kaufverträge speichern wir verschlüsselt, nur für die Prüfung, und löschen sie mit der Entscheidung, spätestens nach 90 Tagen. Namen, Anschriften, Unterschriften und Bankdaten dürfen Sie vorher schwärzen.",
        "Uploaded purchase contracts are stored encrypted, for the review only, and deleted with the decision, after 90 days at the latest. You may black out names, addresses, signatures and bank details beforehand.",
      ],
      [
        "Ihre Daten können Sie unter „Konto“ jederzeit herunterladen und Ihr Konto dort selbst löschen; einzelne Fahrzeugmeldungen löschen Sie im Portfolio.",
        "Under “Account” you can download your data at any time and delete your account yourself; single car reports can be deleted in the portfolio.",
      ],
    ],
  },
  {
    heading: ["3. Welche Daten wir verarbeiten", "3. What data we process"],
    paragraphs: [
      [
        "Konto: Benutzername, ein Hash des Passworts (niemals das Passwort selbst), Zeitpunkt der Registrierung und ggf. das Ablaufdatum eines Premium-Zugangs. Für die Anmeldung setzen wir ein notwendiges Sitzungs-Cookie (mip_sid), das ein Jahr gilt und bei jedem Besuch verlängert wird; gespeichert wird nur ein Hash des Sitzungsschlüssels. Fehlgeschlagene Anmeldeversuche zählen wir 24 Stunden lang unter einem Hash aus Benutzername und IP-Adresse, um Angriffe auf Passwörter zu bremsen; die IP-Adresse selbst speichern wir dabei nicht.",
        "Account: username, a hash of the password (never the password itself), registration time and, where applicable, the expiry of premium access. Signing in sets one necessary session cookie (mip_sid), valid for a year and renewed on every visit; only a hash of the session key is stored. Failed sign-in attempts are counted for 24 hours under a hash of username and IP address to slow down password attacks; the IP address itself is not stored.",
      ],
      [
        "Nutzung der App: Watchlist, Portfolio (Fahrzeuge mit Kaufpreis, Kaufdatum, Laufleistung, Zustand, Farbe, Notiz), Preisalarme, gemerkte Inserate, gelesene Benachrichtigungen und die zuletzt geöffnete Variante speichern wir je Konto auf dem Server, damit sie auf allen Geräten verfügbar sind; der Browser hält eine Kopie, die beim Abmelden gelöscht wird. Zur Begrenzung der Nutzung von Co-Pilot, mobile.de-Abfragen und Uploads zählen wir Anfragen je Konto für etwa 24 Stunden.",
        "Use of the app: watchlist, portfolio (cars with purchase price, date, mileage, condition, colour, note), price alerts, saved listings, read notifications and the last opened variant are stored per account on the server so they are available on all devices; the browser keeps a copy, which is deleted when you sign out. To limit use of the Co-Pilot, mobile.de queries and uploads we count requests per account for about 24 hours.",
      ],
      [
        "Co-Pilot: Ihre Fragen beantwortet ein KI-Dienst (siehe Abschnitt 6). Dazu übermitteln wir Ihre Nachrichten zusammen mit Marktdaten und, falls vorhanden, Ihrem Portfolio und Ihrer Watchlist. Der Gesprächsverlauf liegt nur in Ihrem Browser, nicht auf unserem Server. Bitte geben Sie im Gespräch keine Daten über andere Personen ein.",
        "Co-Pilot: your questions are answered by an AI service (see section 6). For this we send your messages together with market data and, where present, your portfolio and watchlist. The conversation is kept in your browser only, not on our server. Please do not enter data about other people in the conversation.",
      ],
      [
        "Gemeldete Fahrzeuge: Wenn Sie ein eigenes Fahrzeug melden, speichern wir die eingegebenen Daten (u. a. Fahrgestellnummer, Preis, Datum, Land, Art der Gegenseite), den hochgeladenen Kaufvertrag, Zeitpunkt und Wortlaut Ihrer Einwilligung sowie das Ergebnis der Prüfung. Einzelheiten zum Kaufvertrag stehen in Abschnitt 4.",
        "Reported cars: when you report your own car we store the entered data (including chassis number, price, date, country, kind of counterparty), the uploaded purchase contract, the time and wording of your consent, and the result of the review. Section 4 has the details on the contract.",
      ],
      [
        "Forum: Themen und Beiträge speichern wir mit Ihrem Benutzernamen und Zeitpunkt; andere angemeldete Nutzer sehen sie. Entfernen Sie einen eigenen Beitrag, löschen wir seinen Text. Blendet ein Prüfer einen fremden Beitrag aus, bleibt er gespeichert, wird aber nicht mehr angezeigt. Melden Sie einen Beitrag, speichern wir die Meldung mit Ihrer Begründung.",
        "Forum: topics and posts are stored with your username and time; other signed-in users see them. If you remove a post of your own, we delete its text. If a reviewer hides someone else's post, it stays stored but is no longer shown. If you report a post, we store the report with your reason.",
      ],
      [
        "Server-Protokolle: Beim Abruf der Seite verarbeitet unser Hosting-Anbieter technisch notwendige Daten (IP-Adresse, Zeitpunkt, aufgerufene Adresse, Browser) in Protokollen. Fehler der Anwendung protokollieren wir mit der Fehlermeldung, der Seite und der Browserkennung, ohne Benutzernamen.",
        "Server logs: when the site is accessed our hosting provider processes technically necessary data (IP address, time, requested address, browser) in logs. Application errors are logged with the error message, the page and the browser identification, without the username.",
      ],
    ],
  },
  {
    heading: ["4. Ihr Kaufvertrag", "4. Your purchase contract"],
    list: true,
    paragraphs: [
      [
        "Was wir brauchen: Fahrzeug, Fahrgestellnummer, Preis und Datum müssen lesbar sein. Alles andere dürfen Sie vor dem Hochladen schwärzen, insbesondere Namen, Anschriften, Unterschriften, Ausweis- und Bankdaten beider Seiten. Wir empfehlen das ausdrücklich.",
        "What we need: the car, chassis number, price and date must be readable. Everything else may be blacked out before uploading, in particular names, addresses, signatures, ID and bank details of both parties. We expressly recommend it.",
      ],
      [
        "Speicherung: Die Übertragung ist per TLS verschlüsselt. Der Vertrag wird vor dem Speichern mit AES-256 verschlüsselt; der Schlüssel liegt getrennt von der Datenbank. Eine Kopie der Datenbank enthält daher keinen lesbaren Vertrag.",
        "Storage: the transfer is encrypted with TLS. The contract is encrypted with AES-256 before it is stored; the key is kept apart from the database. A copy of the database therefore contains no readable contract.",
      ],
      [
        "Zugriff: Nur die von uns benannten Prüfer können den Vertrag öffnen. Jeder Zugriff wird mit Prüfer und Zeitpunkt protokolliert (Aufbewahrung ein Jahr). Der Vertrag wird nicht veröffentlicht und nicht an Dritte weitergegeben.",
        "Access: only the reviewers we have appointed can open the contract. Every access is logged with reviewer and time (kept for one year). The contract is not published and not passed on to third parties.",
      ],
      [
        "KI-Vorprüfung nur mit gesonderter Einwilligung: Wenn Sie das zusätzliche Häkchen setzen, übermitteln wir den Vertrag und Ihre Fahrzeugangaben an Anthropic (USA), dessen KI die Angaben mit dem Vertrag vergleicht. Ohne Häkchen verlässt der Vertrag unseren Server nicht, und ein Mensch prüft von Hand.",
        "AI pre-check only with separate consent: if you tick the additional box, we send the contract and your car details to Anthropic (USA), whose AI compares the details with the contract. Without the tick the contract does not leave our server and a person checks by hand.",
      ],
      [
        "Keine automatisierte Entscheidung: Die KI bereitet die Prüfung nur vor. Über Freigabe oder Ablehnung entscheidet immer ein Mensch (keine Entscheidung im Sinne des Art. 22 DSGVO).",
        "No automated decision: the AI only prepares the review. A person always decides on approval or rejection (no decision within the meaning of Art. 22 GDPR).",
      ],
      [
        "Löschung: Mit der Entscheidung des Prüfers löschen wir den Vertrag und den Dateinamen. Bleibt eine Meldung 90 Tage unentschieden, löschen wir den Vertrag ebenfalls. Meldungen ohne hochgeladenen Vertrag löschen wir nach 30 Tagen, abgelehnte und abgelaufene Meldungen 90 Tage nach der Entscheidung.",
        "Deletion: with the reviewer's decision we delete the contract and the file name. If a report stays undecided for 90 days, we delete the contract as well. Reports without an uploaded contract are deleted after 30 days, rejected and expired reports 90 days after the decision.",
      ],
      [
        "Was bleibt: Nach der Freigabe gehen Preis, Datum, Land, Laufleistung, Baujahr und Variante ohne Fahrgestellnummer und ohne Bezug zu Ihrem Konto in die Marktwertberechnung ein. Die Meldung selbst (mit Fahrgestellnummer) bleibt in Ihrem Konto sichtbar, damit dasselbe Fahrzeug nicht doppelt gezählt wird, bis Sie sie oder Ihr Konto löschen.",
        "What remains: after approval, price, date, country, mileage, build year and variant enter the market value calculation without the chassis number and without reference to your account. The report itself (with the chassis number) stays visible in your account, so that the same car is not counted twice, until you delete it or your account.",
      ],
      [
        "Widerruf: Sie können jede Meldung im Portfolio selbst löschen, vor und nach der Prüfung. Vor der Freigabe sind damit alle Angaben und der Vertrag gelöscht. Nach der Freigabe löschen wir Fahrgestellnummer, Notizen, KI-Ergebnis und die Verbindung zu Ihrem Konto; Preis, Datum und Fahrzeugdaten bleiben ohne Bezug zu Ihrer Person in der Marktanalyse. Der für diese Meldung gewährte Premium-Zugang entfällt dann; Premium aus anderen freigegebenen Meldungen bleibt.",
        "Withdrawal: you can delete any report in the portfolio yourself, before and after the review. Before approval this deletes all details and the contract. After approval we delete the chassis number, notes, AI result and the link to your account; price, date and car details stay in the market analysis without reference to you. The premium access granted for that report then ends; premium from other approved reports stays.",
      ],
      [
        "Daten der Gegenseite: Ein Kaufvertrag nennt auch Ihren Vertragspartner. Diese Angaben benötigen wir nicht und werten sie nicht aus; soweit sie nicht geschwärzt sind, verarbeiten wir sie nur zur Echtheitsprüfung und löschen sie mit dem Vertrag (Art. 6 Abs. 1 lit. f DSGVO). Die KI ist angewiesen, keine Namen, Anschriften oder Bankdaten wiederzugeben.",
        "The other party's data: a purchase contract also names your contracting partner. We do not need these details and do not evaluate them; where they are not blacked out, we process them only to check authenticity and delete them with the contract (Art. 6 (1) (f) GDPR). The AI is instructed not to reproduce names, addresses or bank details.",
      ],
    ],
  },
  {
    heading: ["5. Zwecke und Rechtsgrundlagen", "5. Purposes and legal bases"],
    list: true,
    paragraphs: [
      ["Bereitstellung des Kontos und der Funktionen einschließlich Co-Pilot und Forum: Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO).", "Providing the account and its functions including the Co-Pilot and the forum: performance of a contract (Art. 6 (1) (b) GDPR)."],
      ["Sicherheit, Missbrauchsabwehr, Zugriffs- und Fehlerprotokolle, Moderation des Forums: berechtigtes Interesse an einem sicheren und rechtmäßigen Betrieb (Art. 6 Abs. 1 lit. f DSGVO).", "Security, abuse prevention, access and error logs, forum moderation: legitimate interest in secure and lawful operation (Art. 6 (1) (f) GDPR)."],
      [
        "Fahrzeugmeldung, Prüfung des Kaufvertrags und Nutzung der geprüften Daten in der Marktwertberechnung: Ihre Einwilligung bei der Meldung (Art. 6 Abs. 1 lit. a DSGVO). Die KI-Vorprüfung durch Anthropic beruht auf Ihrer gesonderten Einwilligung. Beide können Sie jederzeit mit Wirkung für die Zukunft widerrufen, indem Sie die Meldung löschen.",
        "Car reports, review of the purchase contract and use of the verified data in the market value calculation: your consent given with the report (Art. 6 (1) (a) GDPR). The AI pre-check by Anthropic rests on your separate consent. You can withdraw both at any time with effect for the future by deleting the report.",
      ],
      [
        "Nachweis Ihrer Einwilligung (Zeitpunkt und Fassung des Textes): rechtliche Verpflichtung (Art. 6 Abs. 1 lit. c in Verbindung mit Art. 7 Abs. 1 DSGVO).",
        "Proof of your consent (time and version of the text): legal obligation (Art. 6 (1) (c) in conjunction with Art. 7 (1) GDPR).",
      ],
      [
        "Sie sind nicht verpflichtet, Daten bereitzustellen. Ohne Benutzername und Passwort können wir kein Konto führen; ohne Kaufvertrag können wir eine Fahrzeugmeldung nicht prüfen. Alle übrigen Funktionen stehen Ihnen auch ohne Fahrzeugmeldung offen.",
        "You are not obliged to provide data. Without a username and password we cannot run an account; without a purchase contract we cannot review a car report. All other functions are open to you without a car report.",
      ],
    ],
  },
  {
    heading: ["6. Empfänger und Auftragsverarbeiter", "6. Recipients and processors"],
    list: true,
    paragraphs: [
      [
        "Hosting: Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, USA. Die Anwendung läuft in der Region Frankfurt. Mit Vercel besteht ein Vertrag zur Auftragsverarbeitung; Vercel ist unter dem EU-US Data Privacy Framework zertifiziert, zusätzlich gelten Standardvertragsklauseln.",
        "Hosting: Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, USA. The application runs in the Frankfurt region. A data processing agreement is in place with Vercel; Vercel is certified under the EU-US Data Privacy Framework and standard contractual clauses apply in addition.",
      ],
      [
        "Datenbank: Supabase, Inc. (Postgres-Datenbank in der Region Frankfurt), in der Konten, Sitzungen, gespeicherte Daten, Fahrzeugmeldungen, verschlüsselte Verträge und Forumsbeiträge liegen. Mit Supabase besteht ein Vertrag zur Auftragsverarbeitung mit Standardvertragsklauseln.",
        "Database: Supabase, Inc. (Postgres database in the Frankfurt region), holding accounts, sessions, stored data, car reports, encrypted contracts and forum posts. A data processing agreement with standard contractual clauses is in place with Supabase.",
      ],
      [
        "KI-Dienste: Anthropic, PBC, San Francisco, USA. An Anthropic übermitteln wir die Nachrichten, die Sie dem Co-Piloten schreiben, zusammen mit Marktdaten und, falls vorhanden, Ihrem Portfolio und Ihrer Watchlist, sowie hochgeladene Kaufverträge mit Ihren Fahrzeugangaben, wenn Sie in die KI-Vorprüfung eingewilligt haben. Ihr Benutzername wird nicht übermittelt. Anthropic verwendet Daten aus diesen Anfragen nicht zum Training seiner Modelle. Die Übermittlung in die USA ist durch Standardvertragsklauseln abgesichert.",
        "AI services: Anthropic, PBC, San Francisco, USA. We send Anthropic the messages you write to the Co-Pilot together with market data and, where present, your portfolio and watchlist, and uploaded purchase contracts with your car details if you have consented to the AI pre-check. Your username is not transmitted. Anthropic does not use data from these requests to train its models. The transfer to the USA is safeguarded by standard contractual clauses.",
      ],
      [
        "Inserate und Auktionslose: Live-Angebote und Losseiten fragt unser Server bei mobile.de (mobile.de GmbH) und den Auktionshäusern ab; dabei werden keine Daten über Sie übermittelt. Fotos von Inseraten und Losen lädt Ihr Browser direkt vom jeweiligen Anbieter (z. B. Classic Trader, Händlerseiten, mobile.de, Auktionshäuser), der dabei Ihre IP-Adresse erhält, aber nicht erfährt, von welcher Seite Sie kommen.",
        "Listings and auction lots: our server queries live listings and lot pages from mobile.de (mobile.de GmbH) and the auction houses; no data about you is transmitted. Photos of listings and lots are loaded by your browser directly from the respective provider (e.g. Classic Trader, dealer sites, mobile.de, auction houses), which receives your IP address but does not learn which page you came from.",
      ],
      [
        "Darüber hinaus geben wir Daten nur weiter, wenn wir gesetzlich dazu verpflichtet sind. Wir verkaufen keine personenbezogenen Daten.",
        "Beyond that we pass on data only where the law obliges us to. We do not sell personal data.",
      ],
    ],
  },
  {
    heading: ["7. Cookies und Speicher im Browser", "7. Cookies and browser storage"],
    paragraphs: [
      [
        "Wir setzen ein einziges Cookie: das Sitzungs-Cookie mip_sid, das Sie angemeldet hält. Im Speicher Ihres Browsers (localStorage, sessionStorage) liegen außerdem Sprache und Farbschema, eine Kopie Ihrer Watchlist und Ihres Portfolios, der Gesprächsverlauf des Co-Piloten sowie zuletzt gewählte Filter. All das ist für die von Ihnen gewünschten Funktionen unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG); eine Einwilligung und ein Cookie-Banner sind deshalb nicht nötig. Beim Abmelden löschen wir diese Daten bis auf Sprache und Farbschema aus dem Browser.",
        "We set a single cookie: the session cookie mip_sid, which keeps you signed in. Your browser's storage (localStorage, sessionStorage) also holds language and colour scheme, a copy of your watchlist and portfolio, the Co-Pilot conversation and the filters you last chose. All of this is strictly necessary for the functions you asked for (§ 25 (2) no. 2 TDDDG); consent and a cookie banner are therefore not required. When you sign out we delete this data from the browser, except language and colour scheme.",
      ],
    ],
  },
  {
    heading: ["8. Speicherdauer", "8. Retention"],
    list: true,
    paragraphs: [
      ["Kontodaten, Watchlist, Portfolio und Alarme: bis Sie Ihr Konto löschen.", "Account data, watchlist, portfolio and alerts: until you delete your account."],
      ["Sitzungen: ein Jahr nach dem letzten Besuch, oder bis Sie sich abmelden.", "Sessions: one year after the last visit, or until you sign out."],
      ["Kaufverträge: bis zur Entscheidung des Prüfers, höchstens 90 Tage.", "Purchase contracts: until the reviewer's decision, 90 days at most."],
      ["Fahrzeugmeldungen: ohne Vertrag 30 Tage; abgelehnt oder abgelaufen 90 Tage nach der Entscheidung; freigegeben, bis Sie die Meldung oder Ihr Konto löschen (danach nur noch anonyme Preisdaten).", "Car reports: without a contract 30 days; rejected or expired 90 days after the decision; approved until you delete the report or your account (after that only anonymous price data)."],
      ["Protokoll der Zugriffe auf Verträge: ein Jahr.", "Log of accesses to contracts: one year."],
      ["Zähler für Anmeldeversuche und Anfragen: etwa 24 Stunden.", "Counters for sign-in attempts and requests: about 24 hours."],
      ["Protokolle des Hosting-Anbieters: nach dessen Fristen.", "The hosting provider's logs: according to its retention periods."],
      [
        "Bei Löschung des Kontos löschen wir Sitzungen, gespeicherte Daten, Zähler, Ihre Meldungen von Forumsbeiträgen und alle nicht freigegebenen Fahrzeugmeldungen samt Verträgen. Freigegebene Fahrzeugdaten (ohne Fahrgestellnummer, Notizen und KI-Ergebnis) und Forumsbeiträge (ohne Ihren Benutzernamen) bleiben ohne Bezug zu Ihrer Person erhalten; Forumsbeiträge können Sie vorher selbst löschen.",
        "When an account is deleted we delete sessions, stored data, counters, your reports of forum posts and all car reports that are not approved, with their contracts. Approved car data (without chassis number, notes and AI result) and forum posts (without your username) remain without reference to you; you can delete forum posts yourself beforehand.",
      ],
    ],
  },
  {
    heading: ["9. Ihre Rechte", "9. Your rights"],
    paragraphs: [
      [
        "Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen (Art. 15 bis 21 DSGVO). Erteilte Einwilligungen können Sie jederzeit mit Wirkung für die Zukunft widerrufen. Vieles erledigen Sie selbst: Unter „Konto“ (/konto) laden Sie Ihre Daten als Datei herunter, ändern Ihr Passwort und löschen Ihr Konto; im Portfolio löschen Sie Fahrzeugmeldungen, im Forum eigene Beiträge. Für alles Weitere schreiben Sie an die oben genannte E-Mail-Adresse; wir antworten innerhalb eines Monats.",
        "You have the right of access, rectification, erasure, restriction of processing, data portability and objection to processing based on legitimate interests (Art. 15 to 21 GDPR). You can withdraw consent at any time with effect for the future. Much of this you can do yourself: under “Account” (/konto) you download your data as a file, change your password and delete your account; in the portfolio you delete car reports, in the forum your own posts. For anything else, write to the email address above; we answer within one month.",
      ],
      [
        "Sie haben außerdem das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren, insbesondere an Ihrem Wohnort oder am Sitz des Verantwortlichen (Art. 77 DSGVO).",
        "You also have the right to lodge a complaint with a data protection supervisory authority, in particular where you live or where the controller is established (Art. 77 GDPR).",
      ],
      [
        "Eine automatisierte Entscheidungsfindung einschließlich Profiling (Art. 22 DSGVO) findet nicht statt.",
        "There is no automated decision-making including profiling (Art. 22 GDPR).",
      ],
    ],
  },
  {
    heading: ["10. Sicherheit", "10. Security"],
    paragraphs: [
      [
        "Alle Verbindungen sind per TLS verschlüsselt. Passwörter speichern wir nur als scrypt-Hash, Sitzungsschlüssel nur als Hash. Kaufverträge sind zusätzlich mit einem eigenen Schlüssel verschlüsselt. Ohne Anmeldung liefert der Server weder die Anwendung noch Daten aus, nur die Anmeldeseite, Impressum und Datenschutzerklärung. Nach mehreren Fehlversuchen wird die Anmeldung vorübergehend gesperrt. Sollte es trotz allem zu einer Verletzung des Schutzes Ihrer Daten kommen, informieren wir die Aufsichtsbehörde und, wo erforderlich, Sie nach den Art. 33 und 34 DSGVO.",
        "All connections are encrypted with TLS. Passwords are stored only as a scrypt hash, session keys only as a hash. Purchase contracts are additionally encrypted with a key of their own. Without signing in, the server delivers neither the application nor any data, only the sign-in page, the imprint and the privacy notice. After several failed attempts sign-in is blocked temporarily. Should a breach of your data's protection occur despite all this, we will inform the supervisory authority and, where required, you in accordance with Art. 33 and 34 GDPR.",
      ],
    ],
  },
  {
    heading: ["11. Änderungen", "11. Changes"],
    paragraphs: [
      [
        `Diese Erklärung beschreibt den Stand der Anwendung und wird angepasst, wenn neue Funktionen oder Dienste hinzukommen. Stand: ${PRIVACY_AS_OF[0]}.`,
        `This notice describes the current state of the application and will be updated when new functions or services are added. As of ${PRIVACY_AS_OF[1]}.`,
      ],
    ],
  },
];
