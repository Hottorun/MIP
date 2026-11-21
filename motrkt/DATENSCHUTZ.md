# Datenschutz bei Cartag: Stand, Maßnahmen, offene Punkte

Arbeitsunterlage für den Betreiber. Die öffentliche Datenschutzerklärung steht in `src/legal.ts` und beschreibt
dasselbe für Nutzer; beide müssen zum Code passen. Dieses Dokument ersetzt keine Rechtsberatung: die Texte und die
Einordnung der Rechtsgrundlagen sollte einmal jemand mit Zulassung gegenlesen, bevor die Seite öffentlich wird.

## 1. Was der Betreiber noch tun muss

Diese Punkte lassen sich nicht im Code erledigen. Solange sie offen sind, stimmt die Datenschutzerklärung nicht ganz.

| Punkt | Was zu tun ist |
| --- | --- |
| Betreiberangaben | `OPERATOR` in `src/legal.ts` ausfüllen (Name, Anschrift, E-Mail, Verantwortlicher). Bis dahin zeigen Impressum und Datenschutzerklärung einen Warnhinweis. |
| Schlüssel für Verträge | `MIP_CONTRACT_KEY` in Vercel setzen (`openssl rand -base64 32`), für Production und Preview. Ohne ihn lehnt der Server auf Vercel jeden Vertrags-Upload ab. Den Schlüssel zusätzlich an einem zweiten sicheren Ort ablegen (Passwortmanager). |
| Migrationen | `009_privacy.sql`, `010_row_level_security.sql` und `011_appraisals.sql` auf der Produktionsdatenbank ausführen (`npm run db:migrate:prod`, Adresse in `.env.production.local`), vor dem Deploy. |
| Löschlauf prüfen | Nach `011_appraisals.sql` in Supabase nachsehen, dass der Lauf `mip-documents-expire` angelegt ist (`select jobname, schedule, active from cron.job`). Fehlt er (pg_cron nicht verfügbar), hängt die 24-Stunden-Löschung nur an Seitenaufrufen: dann pg_cron unter Database → Extensions einschalten und den `do`-Block aus der Migration noch einmal ausführen. |
| Sicherungen | Prüfen, wie lange Supabase Sicherungen aufbewahrt (je nach Tarif 7 Tage oder länger, mit PITR bis zum eingestellten Zeitraum). In dieser Zeit steckt ein gelöschtes Dokument noch verschlüsselt in der Sicherung; die Datenschutzerklärung sagt das in Abschnitt 4 („Löschung“). Ohne Sicherungen den Satz streichen. |
| Werbung mit „DSGVO-konform“ | **Steht jetzt auf der Seite** (Datenschutz-Band im Portfolio, `src/components/portfolio/UserCars.tsx`). Eine Zertifizierung ist dafür nicht nötig, aber die Aussage muss stimmen: **vor dem Deploy alle Punkte dieser Tabelle erledigen**, sonst ist sie irreführende Werbung (§ 5 UWG). Bewusst als Satz, nicht als Siegel: kein „zertifiziert“, „geprüft“ oder Prüfzeichen ohne echte Zertifizierung (Art. 42 DSGVO). |
| AV-Vertrag Supabase | Im Supabase-Dashboard den Auftragsverarbeitungsvertrag (DPA) abschließen und ablegen. Dabei prüfen, dass das Projekt in `eu-central-1` (Frankfurt) liegt; die Datenschutzerklärung sagt das so. |
| AV-Vertrag Vercel | Der DPA ist Teil der Vercel-Bedingungen; Fassung herunterladen und ablegen. Funktionsregion ist `fra1` (`vercel.json`). |
| E-Mail (Brevo) | Konto bei Brevo anlegen, Absenderadresse (z. B. `konto@carbay.app`) und Domain verifizieren (SPF, DKIM, DMARC), API-Schlüssel erzeugen. In Vercel für Production und Preview setzen: `BREVO_API_KEY`, `MAIL_FROM`, optional `MAIL_FROM_NAME` (Standard „Cartag“) und `MIP_PUBLIC_URL=https://carbay.app`. Ohne Schlüssel verschickt der Server auf Vercel keine Mails (Registrierung geht trotzdem, der Link lässt sich unter „Konto“ erneut senden). |
| AV-Vertrag Brevo | Den Auftragsverarbeitungsvertrag von Brevo abschließen und ablegen. Die Liste der Unterauftragsverarbeiter prüfen: Die Datenschutzerklärung sagt „in der EU verarbeitet“; stimmt das für den Transaktionsversand nicht, den Satz anpassen. Im Brevo-Konto Öffnungs- und Klick-Tracking für Transaktionsmails ausschalten (die Erklärung erwähnt kein Tracking). |
| Migration E-Mail | `013_email.sql` auf der Produktionsdatenbank ausführen (`npm run db:migrate:prod`, Adresse in `.env.production.local`), **vor dem Deploy**: ohne die Spalte `email` schlagen Registrierung und Anmeldung fehl. |
| Bezahlen (Stripe) | Erst einrichten, wenn Premium verkauft werden soll (README „Bezahlen“): `014_payments.sql` und `015_subscriptions.sql` auf der Produktionsdatenbank ausführen (`npm run db:migrate:prod`), dann `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` in Vercel setzen. Vorher: den Auftragsverarbeitungsvertrag von Stripe (Data Processing Agreement, Teil der Stripe-Bedingungen) ablegen; AGB mit Widerrufsbelehrung für digitale Leistungen erstellen, in Stripe hinterlegen und mit `STRIPE_REQUIRE_TERMS=1` bestätigen lassen; Preis inklusive Umsatzsteuer anlegen; Belegversand in Stripe einschalten. Bei einem Abo-Preis zusätzlich: das Kundenportal in Stripe einschalten (dort kündigen Nutzer) und prüfen, ob der Weg zur Kündigung den Vorgaben für online geschlossene Verbraucherverträge genügt (Kündigungsschaltfläche, § 312k BGB). Die Datenschutzerklärung nennt Stripe bereits (Abschnitte 3, 5, 6, 8); Anschrift und Aussagen zu Stripe dort einmal gegen die aktuellen Angaben von Stripe prüfen. |
| AV-Vertrag Anthropic | Der DPA ist Teil der Commercial Terms; Fassung ablegen. Prüfen, ob für das Konto „Zero Data Retention“ vereinbart werden kann, und die Erklärung dann um diesen Satz ergänzen. |
| Prüfer | In `MIP_ADMINS` nur Personen eintragen, die auf Vertraulichkeit verpflichtet sind (kurze schriftliche Erklärung). Verträge nicht herunterladen, drucken oder weitergeben. Täglich prüfen: ein Dokument wird 24 Stunden nach dem Hochladen gelöscht, danach muss der Nutzer es erneut hochladen. |
| Datenschutzbeauftragter | Nach § 38 BDSG erst nötig, wenn in der Regel mindestens 20 Personen ständig mit automatisierter Verarbeitung befasst sind. Kurz festhalten, dass das nicht zutrifft. |
| Folgenabschätzung | Eine Datenschutz-Folgenabschätzung (Art. 35) ist bei diesem Umfang voraussichtlich nicht nötig; die Einschätzung mit zwei Sätzen und Datum festhalten. |
| Postfach | Die in `OPERATOR.email` genannte Adresse muss gelesen werden: Anfragen von Betroffenen sind binnen eines Monats zu beantworten. |
| mobile.de | Die Nutzungsbedingungen der Search-API regeln, was mit Inseratsdaten geschehen darf; das ist kein Datenschutzthema der Nutzer, gehört aber geprüft. |

## 2. Verzeichnis der Verarbeitungstätigkeiten (Art. 30 DSGVO)

| Tätigkeit | Daten | Betroffene | Zweck | Rechtsgrundlage | Empfänger | Löschung |
| --- | --- | --- | --- | --- | --- | --- |
| Konto und Anmeldung | Benutzername, E-Mail-Adresse mit Bestätigungszeit, Passwort-Hash (scrypt), Registrierungszeit, Premium bis, Hash des Sitzungsschlüssels | Nutzer | Zugang zur App | Art. 6 (1) b | Vercel, Supabase | Konto: bei Löschung durch den Nutzer. Sitzung: ein Jahr nach dem letzten Besuch oder beim Abmelden |
| E-Mails zum Konto | E-Mail-Adresse, Benutzername, Link zur Bestätigung (48 h) oder zum Zurücksetzen des Passworts (1 h); gespeichert nur der Hash des Links (`email_tokens`) | Nutzer | Adresse bestätigen, Passwort zurücksetzen | Art. 6 (1) b | Brevo (Sendinblue SAS, Frankreich), Vercel, Supabase | Link: bei Benutzung oder Ablauf; Versandprotokoll nach den Fristen von Brevo |
| Schutz der Anmeldung | Hash aus Benutzername und IP-Adresse, Zeitpunkt | Nutzer, Angreifer | Passwortangriffe bremsen | Art. 6 (1) f | Supabase | 24 Stunden |
| Gespeicherte App-Daten | Watchlist, Portfolio (Preis, Datum, Laufleistung, Zustand, Notiz), Alarme, gemerkte Inserate | Nutzer | Funktionen der App auf allen Geräten | Art. 6 (1) b | Vercel, Supabase | bei Löschung des Kontos |
| Co-Pilot | Nachrichten des Nutzers, Portfolio und Watchlist als Kontext; kein Benutzername | Nutzer | Antworten auf Marktfragen | Art. 6 (1) b | Anthropic (USA, Standardvertragsklauseln) | bei uns keine Speicherung, Verlauf nur im Browser |
| Fahrzeugmeldung (Kaufvertrag) | Fahrzeugdaten mit Fahrgestellnummer, Preis, Datum, Land, Art der Gegenseite, Notiz (bei Wertgutachten, die bis November 2026 eingereicht wurden: Gutachtenwert und Organisation des Gutachters); Zeitpunkt und Fassung der Einwilligung; Prüfergebnis | Nutzer | Geprüfte Verkaufspreise für die Marktwerte, Premium als Dank | Art. 6 (1) a | Vercel, Supabase | ohne Dokument 30 Tage; abgelehnt/abgelaufen 90 Tage nach Entscheidung; freigegeben bis zur Löschung durch den Nutzer oder des Kontos, danach nur anonymisiert (ohne Konto, Fahrgestellnummer, Notiz, Gutachter) |
| Kaufvertrag | Datei (PDF/Foto), verschlüsselt; kann Namen, Anschriften, Unterschriften beider Seiten enthalten, soweit nicht geschwärzt | Nutzer, Vertragspartner | Echtheit der Meldung prüfen | Nutzer: Art. 6 (1) a. Vertragspartner: Art. 6 (1) f | Supabase (nur verschlüsselt); Anthropic nur mit gesonderter Einwilligung (dort gelten dessen Fristen) | mit der Entscheidung, spätestens 24 Stunden nach dem Hochladen; in Sicherungen des Anbieters verschlüsselt bis zu deren Ablauf |
| Marktmodell | Preis, Datum, Land, Laufleistung, Baujahr, Variante, Art der Gegenseite; ohne Fahrgestellnummer, ohne Nutzer. Nur Meldungen mit Kaufvertrag | keine (anonymisiert) | Marktwertberechnung | entfällt | öffentlich in der App als Teil der Werte | bleibt anonymisiert bestehen, auch wenn der Nutzer die Meldung oder das Konto löscht |
| Kauf von Premium | Je Zahlung: Konto, Zeitpunkt, Betrag, Währung, Laufzeit, Kennungen der Zahlung bei Stripe, ggf. Zeitpunkt der Erstattung (`premium_payments`); bei einem Abo je Abbuchung zusätzlich der bezahlte Zeitraum und die Kennungen von Kunde, Abo und Rechnung bei Stripe. Bei Kontolöschung wird das Abo bei Stripe sofort beendet. An Stripe gehen die interne Kontokennung, die Laufzeit und die E-Mail-Adresse; Karten- und Kontodaten gibt der Nutzer nur bei Stripe ein | Nutzer | Premium gegen Bezahlung | Art. 6 (1) b; Aufbewahrung Art. 6 (1) c | Stripe Payments Europe (Irland; Stripe, Inc., USA: Data Privacy Framework, Standardvertragsklauseln), Vercel, Supabase | Bei Kontolöschung ohne Kontobezug; die Zeilen selbst nach Ablauf der handels- und steuerrechtlichen Fristen **von Hand** löschen (kein automatischer Lauf) |
| Zugriffsprotokoll Verträge | Meldungs-ID, Prüfer, Aktion, Zeitpunkt | Prüfer | Nachweis, wer einen Vertrag geöffnet hat | Art. 6 (1) f | Supabase | ein Jahr |
| Forum | Beiträge mit Benutzername und Zeit; Meldungen von Beiträgen mit Begründung. Angemeldete sehen Beiträge mit Namen, Gäste ohne Namen („Mitglied“) | Nutzer | Austausch, Moderation | Art. 6 (1) b, Moderation f | Supabase | eigener Beitrag: Text bei Entfernen gelöscht. Bei Kontolöschung ohne Namen |
| Nutzungszähler | Zähler je Konto für Co-Pilot, mobile.de, Uploads, Fehlermeldungen | Nutzer | Missbrauch und Kosten begrenzen | Art. 6 (1) f | Supabase | etwa 24 Stunden |
| Fehlerprotokoll | Fehlermeldung, Seite, Browserkennung; kein Benutzername | Nutzer | Fehler finden | Art. 6 (1) f | Vercel (Runtime-Logs) | nach den Fristen von Vercel |
| Server-Protokolle | IP-Adresse, Zeit, Adresse, Browser | Besucher | Betrieb, Sicherheit | Art. 6 (1) f | Vercel | nach den Fristen von Vercel |

Keine besonderen Kategorien (Art. 9), kein Profiling, keine automatisierte Entscheidung (Art. 22): die KI bereitet
die Prüfung vor, ein Mensch entscheidet.

## 3. Technische und organisatorische Maßnahmen (Art. 32 DSGVO)

- **Verschlüsselung unterwegs:** nur HTTPS, HSTS für zwei Jahre (`server/app.ts`).
- **Verschlüsselung der Verträge:** AES-256-GCM vor dem Speichern, Schlüssel nur in der Umgebung des Servers, an die
  Meldung gebunden (`server/contractVault.ts`). Ein Abzug der Datenbank enthält keinen lesbaren Vertrag.
- **Passwörter und Sitzungen:** scrypt-Hash mit Salt je Konto; vom Sitzungsschlüssel nur SHA-256; Cookie `HttpOnly`,
  `Secure`, `SameSite=Lax` (`server/auth.ts`).
- **Links per E-Mail:** nur SHA-256 gespeichert, einmal gültig, Zurücksetzen eine Stunde; Links zeigen immer auf
  `MIP_PUBLIC_URL`, nie auf den Host der Anfrage; der Link zum Zurücksetzen trägt den Schlüssel hinter `#` (landet in
  keinem Server-Protokoll); „Passwort vergessen“ antwortet immer gleich und verrät nicht, welche Konten es gibt; nach
  dem Zurücksetzen sind alle Geräte abgemeldet.
- **Zugang:** ohne Sitzung (Gast) die App mit den Lite-Marktdaten und das Forum zum Lesen ohne Benutzernamen; kein
  Cookie, nichts pro Besucher gespeichert. Konto-Daten, Speichern, Schreiben, Co-Pilot und die vollständigen
  Marktdaten nur mit Konto (`authGate`, `mayRead`, je API die Prüfung auf `currentUser`). Verträge öffnen nur Prüfer
  (`MIP_ADMINS`), jeder Zugriff landet in `contract_access`. Das geteilte Demo-Konto kann keine Fahrzeuge melden.
- **Datenbank:** Row Level Security auf allen Tabellen, damit die Data-API von Supabase nichts herausgibt
  (`db/migrations/010_row_level_security.sql`); die App greift direkt als Eigentümer zu.
- **Browser:** strenge Content-Security-Policy (Skripte und Schriften nur von der eigenen Adresse), kein Framing,
  `Referrer-Policy: same-origin`, hochgeladene Dateien werden dem Prüfer in einer Sandbox ohne Skripte gezeigt.
- **Keine Dritten im Browser:** keine Analyse, keine Werbung, Schriften aus `public/fonts`. Fotos von Inseraten und
  Auktionslosen lädt der Browser beim Anbieter, ohne Referrer.
- **Datensparsamkeit:** Konto ohne Namen, E-Mail-Adresse nur für Nachrichten zum Konto (keine Werbung, kein Tracking); Schwärzen des Vertrags ausdrücklich erlaubt; Anmeldezähler nur
  als Hash; Fehlerprotokoll ohne Benutzernamen; Export ins Marktmodell ohne Fahrgestellnummer und Nutzer
  (`scripts/db/export-user-cars.ts`).
- **Missbrauchsschutz:** Sperre nach Fehlversuchen, Budgets je Konto (`server/limits.ts`), Prüfung von Dateityp und
  Größe beim Upload, Herkunftsprüfung bei ändernden Anfragen.
- **Löschen ohne Zutun:** Hochgeladene Dokumente löscht die Datenbank selbst: ein pg_cron-Lauf (`mip-documents-expire`,
  alle 15 Minuten, `db/migrations/011_appraisals.sql`) entfernt jedes Dokument, das 23 Stunden alt ist, eine Stunde
  vor dem zugesagten Tag. Ältere Dokumente gibt der Server auch vorher niemandem mehr heraus (Prüfer, KI). Dasselbe
  und die übrigen Fristen in `RETENTION` erledigt `sweepUserCars` in `server/userCars.ts` bei Aufrufen der
  Portfolio- und Prüfseite; ohne pg_cron (lokal) ist das der einzige Lauf.

## 4. Rechte der Betroffenen: wo sie im Produkt erfüllt werden

| Recht | Wo |
| --- | --- |
| Auskunft, Datenübertragbarkeit (Art. 15, 20) | `/konto` → „Daten herunterladen“ (`/api/auth/export`), JSON mit allem zum Konto |
| Berichtigung (Art. 16) | Portfolio und Watchlist in der App; Fahrzeugmeldung: löschen und neu melden; sonst per E-Mail |
| Löschung (Art. 17) | `/konto` → „Konto löschen“; einzelne Meldung im Portfolio; eigener Forumsbeitrag im Forum |
| Widerruf der Einwilligung (Art. 7 (3)) | Meldung im Portfolio löschen, vor und nach der Prüfung |
| Widerspruch, Einschränkung (Art. 18, 21) | per E-Mail an die Adresse im Impressum |

Kommt eine Anfrage per E-Mail: Identität über das Konto klären (der Nutzer meldet sich an und nennt den
Benutzernamen), binnen eines Monats antworten, Anfrage und Antwort ablegen.

## 5. Wenn etwas passiert (Art. 33, 34 DSGVO)

1. Zugang schließen: betroffene Sitzungen löschen (`delete from sessions`), Passwort der Datenbank und
   `MIP_CONTRACT_KEY` tauschen. Nach einem Schlüsselwechsel sind offene Verträge nicht mehr lesbar; die Nutzer laden
   sie erneut hoch.
2. Feststellen, was betroffen ist: Runtime-Logs bei Vercel, Logs bei Supabase, Tabelle `contract_access`.
3. Binnen 72 Stunden nach Bekanntwerden an die zuständige Aufsichtsbehörde melden, sofern ein Risiko für Betroffene
   nicht ausgeschlossen ist. Bei hohem Risiko auch die Betroffenen informieren: per E-Mail an die hinterlegten
   Adressen und mit einem Hinweis in der App.
4. Vorfall, Folgen und Maßnahmen schriftlich festhalten, auch wenn keine Meldung nötig war.

## 6. Bei Änderungen am Code

Neue Tabelle: Row Level Security einschalten. Neues gespeichertes Feld, neuer Dienst, andere Frist: Abschnitt 2
hier und den passenden Satz in `src/legal.ts` ändern und `PRIVACY_AS_OF` hochsetzen. Anderer Wortlaut der
Einwilligung im Formular: `CONSENT_VERSION` in `server/userCars.ts` hochsetzen.
