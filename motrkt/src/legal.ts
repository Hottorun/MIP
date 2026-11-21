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
        "Inserate stammen von Händlern und Online-Plattformen und werden unverändert verlinkt; für deren Inhalte sind die jeweiligen Anbieter verantwortlich. Forumsbeiträge geben die Meinung ihrer Verfasser wieder; Hinweise auf rechtswidrige Inhalte nehmen wir unter der oben genannten E-Mail-Adresse entgegen und entfernen solche Inhalte umgehend.",
        "Listings come from dealers and online platforms and are linked unchanged; their providers are responsible for their content. Forum posts reflect their authors' opinions; reports of unlawful content can be sent to the email address above and such content is removed promptly.",
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
export const PRIVACY_AS_OF: [string, string] = ["21. November 2026", "21 November 2026"];

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
        "Für ein Konto brauchen wir einen Benutzernamen, ein Passwort und eine E-Mail-Adresse, nicht Ihren Namen. Die E-Mail-Adresse nutzen wir nur für Ihr Konto (Bestätigung der Adresse, Zurücksetzen des Passworts), nicht für Werbung.",
        "An account needs a username, a password and an email address, not your name. We use the email address for your account only (confirming the address, resetting the password), never for advertising.",
      ],
      [
        "Wir setzen keine Werbedienste, keine Tracking-Cookies und keine eingebundenen Inhalte sozialer Netzwerke ein. Seitenaufrufe zählen wir ohne Cookies und ohne Sie über den Tag hinaus wiederzuerkennen (Abschnitt 3, „Reichweitenmessung“). Schriften liefern wir von unserem eigenen Server aus.",
        "We use no advertising services, no tracking cookies and no embedded social network content. Page views are counted without cookies and without recognising you beyond the day (section 3, “Audience measurement”). Typefaces are served from our own server.",
      ],
      [
        "Anwendung und Datenbank laufen in Rechenzentren in Frankfurt am Main.",
        "The application and the database run in data centres in Frankfurt am Main.",
      ],
      [
        "Hochgeladene Kaufverträge speichern wir verschlüsselt, nur für die Prüfung, und löschen sie mit der Entscheidung, spätestens 24 Stunden nach dem Hochladen. Namen, Anschriften, Unterschriften und Bankdaten dürfen Sie vorher schwärzen.",
        "Uploaded purchase contracts are stored encrypted, for the review only, and deleted with the decision, 24 hours after the upload at the latest. You may black out names, addresses, signatures and bank details beforehand.",
      ],
      [
        "Wenn Sie Premium kaufen, bezahlen Sie auf der Seite unseres Zahlungsdienstleisters Stripe. Karten- und Kontodaten erreichen uns nicht.",
        "If you buy premium, you pay on the page of our payment provider Stripe. Card and bank details never reach us.",
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
        "Konto: Benutzername, E-Mail-Adresse und der Zeitpunkt ihrer Bestätigung, ein Hash des Passworts (niemals das Passwort selbst), Zeitpunkt der Registrierung und ggf. das Ablaufdatum eines Premium-Zugangs. An die E-Mail-Adresse schicken wir nur Nachrichten zum Konto: einen Link zur Bestätigung der Adresse (48 Stunden gültig) und, wenn Sie es anfordern, einen Link zum Zurücksetzen des Passworts (eine Stunde gültig); von diesen Links speichern wir nur einen Hash. Für die Anmeldung setzen wir ein notwendiges Sitzungs-Cookie (mip_sid), das ein Jahr gilt und bei jedem Besuch verlängert wird; gespeichert wird nur ein Hash des Sitzungsschlüssels. Fehlgeschlagene Anmeldeversuche zählen wir 24 Stunden lang unter einem Hash aus Benutzername und IP-Adresse, um Angriffe auf Passwörter zu bremsen; die IP-Adresse selbst speichern wir dabei nicht.",
        "Account: username, email address and the time it was confirmed, a hash of the password (never the password itself), registration time and, where applicable, the expiry of premium access. We send only account messages to the email address: a link to confirm the address (valid for 48 hours) and, if you request it, a link to reset the password (valid for one hour); of these links we store only a hash. Signing in sets one necessary session cookie (mip_sid), valid for a year and renewed on every visit; only a hash of the session key is stored. Failed sign-in attempts are counted for 24 hours under a hash of username and IP address to slow down password attacks; the IP address itself is not stored.",
      ],
      [
        "Ohne Konto: Katalog, Marktwerte, Angebote, Auktionskalender und Forum können Sie ohne Konto ansehen. Dabei setzen wir kein Cookie und speichern nichts über Sie, außer den Server-Protokollen des Hosting-Anbieters und der Reichweitenmessung (siehe unten).",
        "Without an account: you can view the catalogue, market values, listings, auction calendar and forum without an account. We set no cookie and store nothing about you, apart from the hosting provider's server logs and the audience measurement (see below).",
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
        "Gemeldete Fahrzeuge: Wenn Sie ein Fahrzeug melden, das Sie gekauft oder verkauft haben, speichern wir die eingegebenen Daten (u. a. Fahrgestellnummer, Preis, Datum, Land, Art der Gegenseite), den hochgeladenen Kaufvertrag, Zeitpunkt und Wortlaut Ihrer Einwilligung sowie das Ergebnis der Prüfung. Einzelheiten zu diesem Dokument stehen in Abschnitt 4.",
        "Reported cars: when you report a car you bought or sold we store the entered data (including chassis number, price, date, country, kind of counterparty), the uploaded purchase contract, the time and wording of your consent, and the result of the review. Section 4 has the details on this document.",
      ],
      [
        "Kauf von Premium: Wenn Sie Premium kaufen, leiten wir Sie zur Zahlungsseite von Stripe weiter (siehe Abschnitt 6). Dorthin übermitteln wir die interne Kennung Ihres Kontos, die gekaufte Laufzeit und, zum Vorausfüllen, Ihre E-Mail-Adresse. Ihre Zahlungsdaten (Karte, Bankverbindung, gegebenenfalls Rechnungsanschrift) geben Sie bei Stripe ein; wir erhalten sie nicht. Zu Ihrem Konto speichern wir Zeitpunkt, Betrag, Währung und Laufzeit des Kaufs, die Kennungen der Zahlung bei Stripe und gegebenenfalls den Zeitpunkt einer Erstattung. Ist Premium ein Abo, speichert Stripe Ihr Zahlungsmittel und bucht den Betrag zu jedem neuen Zeitraum ab, bis Sie kündigen; wir speichern dann je Abbuchung den bezahlten Zeitraum und die Kennungen von Kunde, Abo und Rechnung bei Stripe. Sie kündigen im Konto unter „Abo verwalten“ auf einer Seite von Stripe. Löschen Sie Ihr Konto, beenden wir das Abo sofort.",
        "Buying premium: when you buy premium we send you on to Stripe's payment page (see section 6). We pass on the internal identifier of your account, the period bought and, to prefill the form, your email address. You enter your payment details (card, bank account, billing address where asked) at Stripe; we do not receive them. With your account we store the time, amount, currency and period of the purchase, Stripe's identifiers of the payment and, where applicable, the time of a refund. Where premium is a subscription, Stripe stores your payment method and charges the amount for every new period until you cancel; for every charge we then store the period paid for and Stripe's identifiers of customer, subscription and invoice. You cancel in your account under “Manage subscription”, on a page of Stripe. If you delete your account, we end the subscription at once.",
      ],
      [
        "Forum: Themen und Beiträge speichern wir mit Ihrem Benutzernamen und Zeitpunkt. Angemeldete Nutzer sehen sie mit Ihrem Benutzernamen; Besucher ohne Konto können sie lesen, sehen aber keine Benutzernamen. Entfernen Sie einen eigenen Beitrag, löschen wir seinen Text. Blendet ein Prüfer einen fremden Beitrag aus, bleibt er gespeichert, wird aber nicht mehr angezeigt. Melden Sie einen Beitrag, speichern wir die Meldung mit Ihrer Begründung.",
        "Forum: topics and posts are stored with your username and time. Signed-in users see them with your username; visitors without an account can read them but see no usernames. If you remove a post of your own, we delete its text. If a reviewer hides someone else's post, it stays stored but is no longer shown. If you report a post, we store the report with your reason.",
      ],
      [
        "Server-Protokolle: Beim Abruf der Seite verarbeitet unser Hosting-Anbieter technisch notwendige Daten (IP-Adresse, Zeitpunkt, aufgerufene Adresse, Browser) in Protokollen. Fehler der Anwendung protokollieren wir mit der Fehlermeldung, der Seite und der Browserkennung, ohne Benutzernamen.",
        "Server logs: when the site is accessed our hosting provider processes technically necessary data (IP address, time, requested address, browser) in logs. Application errors are logged with the error message, the page and the browser identification, without the username.",
      ],
      [
        "Reichweitenmessung: Um zu sehen, welche Seiten wie oft aufgerufen werden, nutzen wir Vercel Web Analytics (siehe Abschnitt 6). Je Seitenaufruf werden der Zeitpunkt, die Adresse der Seite ohne Parameter, die Seite, von der Sie kommen, der ungefähre Standort (Land, Region, Stadt, aus der IP-Adresse abgeleitet), Betriebssystem, Browser und Gerätetyp erfasst. Die Messung setzt kein Cookie und legt nichts im Speicher Ihres Browsers ab. Besucher unterscheidet Vercel nach eigenen Angaben über einen Hash aus Daten der Anfrage, der nach 24 Stunden verworfen wird; über mehrere Tage oder über andere Websites hinweg werden Sie damit nicht wiedererkannt. Mit Ihrem Konto verknüpfen wir die Messung nicht.",
        "Audience measurement: to see which pages are opened how often we use Vercel Web Analytics (see section 6). For each page view it records the time, the address of the page without parameters, the page you came from, the approximate location (country, region, city, derived from the IP address), operating system, browser and device type. The measurement sets no cookie and puts nothing into your browser's storage. According to Vercel, visitors are told apart by a hash made from data of the request, which is discarded after 24 hours; you are not recognised across several days or across other websites. We do not link the measurement to your account.",
      ],
    ],
  },
  {
    heading: ["4. Ihr Kaufvertrag", "4. Your purchase contract"],
    list: true,
    paragraphs: [
      [
        "Wertgutachten: Bis November 2026 konnten Sie statt eines Kaufvertrags auch das Wertgutachten eines eigenen Fahrzeugs hochladen. Neue Gutachten nehmen wir nicht mehr an. Für früher eingereichte Gutachten gilt weiter, was im Folgenden für den Vertrag gesagt ist.",
        "Appraisals: until November 2026 you could upload the appraisal of a car you own instead of a purchase contract. We no longer take new appraisals. For appraisals submitted before, what follows for the contract continues to apply.",
      ],
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
        "KI-Vorprüfung nur mit gesonderter Einwilligung: Wenn Sie das zusätzliche Häkchen setzen, übermitteln wir den Vertrag und Ihre Fahrzeugangaben an Anthropic (USA), dessen KI die Angaben mit dem Vertrag vergleicht. Ohne Häkchen verlässt der Vertrag unseren Server nicht, und ein Mensch prüft von Hand. Für die an Anthropic übermittelte Kopie gelten dessen Aufbewahrungsfristen; die Frist von 24 Stunden bezieht sich auf unsere Speicherung.",
        "AI pre-check only with separate consent: if you tick the additional box, we send the contract and your car details to Anthropic (USA), whose AI compares the details with the contract. Without the tick the contract does not leave our server and a person checks by hand. The copy sent to Anthropic is subject to Anthropic's retention periods; the 24 hours refer to our storage.",
      ],
      [
        "Keine automatisierte Entscheidung: Die KI bereitet die Prüfung nur vor. Über Freigabe oder Ablehnung entscheidet immer ein Mensch (keine Entscheidung im Sinne des Art. 22 DSGVO).",
        "No automated decision: the AI only prepares the review. A person always decides on approval or rejection (no decision within the meaning of Art. 22 GDPR).",
      ],
      [
        "Löschung: Mit der Entscheidung des Prüfers löschen wir den Vertrag und den Dateinamen, in jedem Fall spätestens 24 Stunden nach dem Hochladen, auch wenn bis dahin nicht entschieden ist. Die Löschung läuft automatisch. Ist nicht rechtzeitig entschieden, bleiben Ihre Angaben gespeichert und Sie können das Dokument erneut hochladen. In Sicherungskopien, die unser Datenbankanbieter technisch bedingt anlegt, kann der Vertrag, weiterhin mit unserem Schlüssel verschlüsselt, bis zum Ablauf der dortigen Aufbewahrungsfrist enthalten sein; wir greifen darauf nicht zu. Meldungen ohne hochgeladenes Dokument löschen wir nach 30 Tagen, abgelehnte und abgelaufene Meldungen 90 Tage nach der Entscheidung.",
        "Deletion: with the reviewer's decision we delete the contract and the file name, and in any case 24 hours after the upload at the latest, even if no decision has been made by then. The deletion runs automatically. If no decision was made in time, your details stay stored and you can upload the document again. Backup copies that our database provider creates for technical reasons may contain the contract, still encrypted with our key, until the provider's retention period ends; we do not access them. Reports without an uploaded document are deleted after 30 days, rejected and expired reports 90 days after the decision.",
      ],
      [
        "Was bleibt: Nach der Freigabe gehen Preis, Datum, Land, Laufleistung, Baujahr und Variante ohne Fahrgestellnummer und ohne Bezug zu Ihrem Konto in die Marktwertberechnung ein. Die Meldung selbst (mit Fahrgestellnummer) bleibt in Ihrem Konto sichtbar, damit dasselbe Fahrzeug nicht doppelt gezählt wird, bis Sie sie oder Ihr Konto löschen. Bei einem früher eingereichten Wertgutachten bleiben Wert, Datum, Zustandsnote und Fahrzeugdaten gespeichert; sie dienen als Vergleichswert und zählen nicht als Verkaufspreis.",
        "What remains: after approval, price, date, country, mileage, build year and variant enter the market value calculation without the chassis number and without reference to your account. The report itself (with the chassis number) stays visible in your account, so that the same car is not counted twice, until you delete it or your account. For an appraisal submitted before, the value, date, condition grade and car details stay stored; they serve as a reference value and do not count as a sale price.",
      ],
      [
        "Widerruf: Sie können jede Meldung im Portfolio selbst löschen, vor und nach der Prüfung. Vor der Freigabe sind damit alle Angaben und der Vertrag gelöscht. Nach der Freigabe löschen wir Fahrgestellnummer, Notizen, bei einem Gutachten den Namen des Gutachters, KI-Ergebnis und die Verbindung zu Ihrem Konto; Preis, Datum und Fahrzeugdaten bleiben ohne Bezug zu Ihrer Person in der Marktanalyse. Der für diese Meldung gewährte Premium-Zugang entfällt dann; Premium aus anderen freigegebenen Meldungen und aus Käufen bleibt.",
        "Withdrawal: you can delete any report in the portfolio yourself, before and after the review. Before approval this deletes all details and the contract. After approval we delete the chassis number, notes, for an appraisal the appraiser's name, AI result and the link to your account; price, date and car details stay in the market analysis without reference to you. The premium access granted for that report then ends; premium from other approved reports and from purchases stays.",
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
      ["Bereitstellung der ohne Konto zugänglichen Seiten, Sicherheit, Missbrauchsabwehr, Zugriffs- und Fehlerprotokolle, Moderation des Forums: berechtigtes Interesse an einem sicheren und rechtmäßigen Betrieb (Art. 6 Abs. 1 lit. f DSGVO).", "Providing the pages open without an account, security, abuse prevention, access and error logs, forum moderation: legitimate interest in secure and lawful operation (Art. 6 (1) (f) GDPR)."],
      [
        "Reichweitenmessung: berechtigtes Interesse daran, zu verstehen, wie das Angebot genutzt wird, und es danach zu verbessern (Art. 6 Abs. 1 lit. f DSGVO).",
        "Audience measurement: legitimate interest in understanding how the service is used and improving it accordingly (Art. 6 (1) (f) GDPR).",
      ],
      [
        "Fahrzeugmeldung, Prüfung des Kaufvertrags und Nutzung der geprüften Daten in der Marktwertberechnung: Ihre Einwilligung bei der Meldung (Art. 6 Abs. 1 lit. a DSGVO). Die KI-Vorprüfung durch Anthropic beruht auf Ihrer gesonderten Einwilligung. Beide können Sie jederzeit mit Wirkung für die Zukunft widerrufen, indem Sie die Meldung löschen.",
        "Car reports, review of the purchase contract and use of the verified data in the market value calculation: your consent given with the report (Art. 6 (1) (a) GDPR). The AI pre-check by Anthropic rests on your separate consent. You can withdraw both at any time with effect for the future by deleting the report.",
      ],
      [
        "Kauf von Premium und Abwicklung der Zahlung: Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO). Aufbewahrung der Angaben zum Kauf: rechtliche Verpflichtung (Art. 6 Abs. 1 lit. c DSGVO in Verbindung mit den handels- und steuerrechtlichen Aufbewahrungspflichten).",
        "Buying premium and handling the payment: performance of a contract (Art. 6 (1) (b) GDPR). Keeping the details of the purchase: legal obligation (Art. 6 (1) (c) GDPR in conjunction with the retention duties of commercial and tax law).",
      ],
      [
        "Nachweis Ihrer Einwilligung (Zeitpunkt und Fassung des Textes): rechtliche Verpflichtung (Art. 6 Abs. 1 lit. c in Verbindung mit Art. 7 Abs. 1 DSGVO).",
        "Proof of your consent (time and version of the text): legal obligation (Art. 6 (1) (c) in conjunction with Art. 7 (1) GDPR).",
      ],
      [
        "Sie sind nicht verpflichtet, Daten bereitzustellen. Ohne Benutzername und Passwort können wir kein Konto führen; ohne Kaufvertrag können wir eine Fahrzeugmeldung nicht prüfen; ohne Zahlungsdaten bei Stripe ist ein Kauf nicht möglich. Alle übrigen Funktionen stehen Ihnen auch ohne Fahrzeugmeldung offen.",
        "You are not obliged to provide data. Without a username and password we cannot run an account; without a purchase contract we cannot review a car report; without payment details at Stripe a purchase is not possible. All other functions are open to you without a car report.",
      ],
    ],
  },
  {
    heading: ["6. Empfänger und Auftragsverarbeiter", "6. Recipients and processors"],
    list: true,
    paragraphs: [
      [
        "Hosting und Reichweitenmessung: Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, USA. Die Anwendung läuft in der Region Frankfurt; die Daten der Reichweitenmessung (Vercel Web Analytics) können auch in den USA verarbeitet werden. Mit Vercel besteht ein Vertrag zur Auftragsverarbeitung; Vercel ist unter dem EU-US Data Privacy Framework zertifiziert, zusätzlich gelten Standardvertragsklauseln.",
        "Hosting and audience measurement: Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, USA. The application runs in the Frankfurt region; the data of the audience measurement (Vercel Web Analytics) may also be processed in the USA. A data processing agreement is in place with Vercel; Vercel is certified under the EU-US Data Privacy Framework and standard contractual clauses apply in addition.",
      ],
      [
        "Datenbank: Supabase, Inc. (Postgres-Datenbank in der Region Frankfurt), in der Konten, Sitzungen, gespeicherte Daten, Fahrzeugmeldungen, verschlüsselte Verträge, Angaben zu Käufen sowie Forumsbeiträge liegen. Mit Supabase besteht ein Vertrag zur Auftragsverarbeitung mit Standardvertragsklauseln.",
        "Database: Supabase, Inc. (Postgres database in the Frankfurt region), holding accounts, sessions, stored data, car reports, encrypted contracts, details of purchases, and forum posts. A data processing agreement with standard contractual clauses is in place with Supabase.",
      ],
      [
        "E-Mail-Versand: Resend (Plus Five Five, Inc., USA) verschickt die Nachrichten zum Konto, etwa den Code bei der Registrierung. Resend erhält dafür Ihre E-Mail-Adresse, Ihren Benutzernamen und den Inhalt der Nachricht; die Daten werden in den USA verarbeitet. Mit Resend besteht ein Vertrag zur Auftragsverarbeitung; Resend ist unter dem EU-US Data Privacy Framework zertifiziert, zusätzlich gelten Standardvertragsklauseln.",
        "Email delivery: Resend (Plus Five Five, Inc., USA) sends the account messages, such as the code at sign-up. For this Resend receives your email address, your username and the content of the message; the data is processed in the USA. A data processing agreement is in place with Resend; Resend is certified under the EU-US Data Privacy Framework and standard contractual clauses apply in addition.",
      ],
      [
        "Zahlungen: Stripe Payments Europe, Ltd., 1 Grand Canal Street Lower, Grand Canal Dock, Dublin, Irland. Stripe stellt die Zahlungsseite bereit und wickelt die Zahlung ab. Dabei verarbeitet Stripe Ihre Zahlungsdaten, Ihre E-Mail-Adresse, Angaben zum Kauf und technische Daten Ihres Geräts, teils in unserem Auftrag, teils in eigener Verantwortung (etwa zur Betrugsvorbeugung und zur Erfüllung eigener gesetzlicher Pflichten). Daten können dabei an Stripe, Inc. in die USA übermittelt werden; Stripe ist unter dem EU-US Data Privacy Framework zertifiziert, zusätzlich gelten Standardvertragsklauseln. Näheres in der Datenschutzerklärung von Stripe (stripe.com/de/privacy).",
        "Payments: Stripe Payments Europe, Ltd., 1 Grand Canal Street Lower, Grand Canal Dock, Dublin, Ireland. Stripe provides the payment page and handles the payment. In doing so Stripe processes your payment details, your email address, details of the purchase and technical data of your device, partly on our behalf and partly as a controller of its own (for instance to prevent fraud and to meet its own legal duties). Data may be transferred to Stripe, Inc. in the USA; Stripe is certified under the EU-US Data Privacy Framework and standard contractual clauses apply in addition. More in Stripe's privacy policy (stripe.com/privacy).",
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
        "Wir setzen ein einziges Cookie: das Sitzungs-Cookie mip_sid, das Sie angemeldet hält; ohne Konto setzen wir keines. Im Speicher Ihres Browsers (localStorage, sessionStorage) liegen außerdem Sprache und Farbschema, eine Kopie Ihrer Watchlist und Ihres Portfolios, der Gesprächsverlauf des Co-Piloten sowie zuletzt gewählte Filter; ohne Konto nur Sprache, Farbschema, zuletzt geöffnete Variante und Filter. All das ist für die von Ihnen gewünschten Funktionen unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG); eine Einwilligung und ein Cookie-Banner sind deshalb nicht nötig. Die Reichweitenmessung (Abschnitt 3) setzt kein Cookie und legt nichts in diesem Speicher ab. Beim Abmelden löschen wir diese Daten bis auf Sprache und Farbschema aus dem Browser. Die Zahlungsseite beim Kauf von Premium ist eine Seite von Stripe; für die Cookies dort ist Stripe verantwortlich.",
        "We set a single cookie: the session cookie mip_sid, which keeps you signed in; without an account we set none. Your browser's storage (localStorage, sessionStorage) also holds language and colour scheme, a copy of your watchlist and portfolio, the Co-Pilot conversation and the filters you last chose; without an account only language, colour scheme, the last opened variant and filters. All of this is strictly necessary for the functions you asked for (§ 25 (2) no. 2 TDDDG); consent and a cookie banner are therefore not required. The audience measurement (section 3) sets no cookie and puts nothing into this storage. When you sign out we delete this data from the browser, except language and colour scheme. The payment page for buying premium is a page of Stripe; Stripe is responsible for the cookies there.",
      ],
    ],
  },
  {
    heading: ["8. Speicherdauer", "8. Retention"],
    list: true,
    paragraphs: [
      ["Kontodaten, Watchlist, Portfolio und Alarme: bis Sie Ihr Konto löschen.", "Account data, watchlist, portfolio and alerts: until you delete your account."],
      ["Sitzungen: ein Jahr nach dem letzten Besuch, oder bis Sie sich abmelden.", "Sessions: one year after the last visit, or until you sign out."],
      ["Codes zur Registrierung: bis sie benutzt werden, höchstens 15 Minuten. Links zur Bestätigung einer geänderten E-Mail-Adresse und zum Zurücksetzen des Passworts: bis sie benutzt werden, höchstens 48 Stunden bzw. eine Stunde. Versandprotokolle bei Resend: nach dessen Fristen.", "Sign-up codes: until used, 15 minutes at most. Links to confirm a changed email address and to reset the password: until used, 48 hours or one hour at most. Delivery logs at Resend: according to its retention periods."],
      ["Kaufverträge: bis zur Entscheidung des Prüfers, höchstens 24 Stunden nach dem Hochladen.", "Purchase contracts: until the reviewer's decision, 24 hours after the upload at most."],
      ["Fahrzeugmeldungen: ohne Dokument 30 Tage; abgelehnt oder abgelaufen 90 Tage nach der Entscheidung; freigegeben, bis Sie die Meldung oder Ihr Konto löschen (danach nur noch anonyme Preisdaten).", "Car reports: without a document 30 days; rejected or expired 90 days after the decision; approved until you delete the report or your account (after that only anonymous price data)."],
      ["Protokoll der Zugriffe auf Verträge: ein Jahr.", "Log of accesses to contracts: one year."],
      ["Angaben zu Käufen (Zeitpunkt, Betrag, Laufzeit, Kennungen bei Stripe): solange die handels- und steuerrechtlichen Aufbewahrungsfristen laufen. Zahlungsdaten bei Stripe: nach dessen Fristen.", "Details of purchases (time, amount, period, Stripe's identifiers): for as long as the retention periods of commercial and tax law run. Payment data at Stripe: according to its retention periods."],
      ["Zähler für Anmeldeversuche und Anfragen: etwa 24 Stunden.", "Counters for sign-in attempts and requests: about 24 hours."],
      ["Protokolle des Hosting-Anbieters: nach dessen Fristen.", "The hosting provider's logs: according to its retention periods."],
      ["Reichweitenmessung: Der Hash, der Besucher unterscheidet, wird nach 24 Stunden verworfen; die Zählungen bleiben nach den Fristen von Vercel gespeichert.", "Audience measurement: the hash that tells visitors apart is discarded after 24 hours; the counts are kept according to Vercel's retention periods."],
      [
        "Bei Löschung des Kontos löschen wir E-Mail-Adresse, Sitzungen, gespeicherte Daten, Zähler, Ihre Meldungen von Forumsbeiträgen und alle nicht freigegebenen Fahrzeugmeldungen samt Dokumenten. Freigegebene Fahrzeugdaten (ohne Fahrgestellnummer, Notizen und KI-Ergebnis), Forumsbeiträge (ohne Ihren Benutzernamen) und die Angaben zu Käufen (ohne Verbindung zu Ihrem Konto, für die gesetzliche Aufbewahrung) bleiben erhalten; Forumsbeiträge können Sie vorher selbst löschen.",
        "When an account is deleted we delete the email address, sessions, stored data, counters, your reports of forum posts and all car reports that are not approved, with their documents. Approved car data (without chassis number, notes and AI result), forum posts (without your username) and the details of purchases (without the link to your account, for the retention the law requires) remain; you can delete forum posts yourself beforehand.",
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
        "Alle Verbindungen sind per TLS verschlüsselt. Passwörter speichern wir nur als scrypt-Hash, Sitzungsschlüssel nur als Hash. Kaufverträge sind zusätzlich mit einem eigenen Schlüssel verschlüsselt. Ohne Anmeldung liefert der Server nur die frei zugänglichen Teile der Anwendung mit den Lite-Marktdaten; Konten, gespeicherte Daten, Verträge und die vollständigen Marktdaten bleiben hinter der Anmeldung. Nach mehreren Fehlversuchen wird die Anmeldung vorübergehend gesperrt. Sollte es trotz allem zu einer Verletzung des Schutzes Ihrer Daten kommen, informieren wir die Aufsichtsbehörde und, wo erforderlich, Sie nach den Art. 33 und 34 DSGVO.",
        "All connections are encrypted with TLS. Passwords are stored only as a scrypt hash, session keys only as a hash. Purchase contracts are additionally encrypted with a key of their own. Without signing in, the server delivers only the open parts of the application with the lite market data; accounts, stored data, contracts and the full market data stay behind the sign-in. After several failed attempts sign-in is blocked temporarily. Should a breach of your data's protection occur despite all this, we will inform the supervisory authority and, where required, you in accordance with Art. 33 and 34 GDPR.",
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
