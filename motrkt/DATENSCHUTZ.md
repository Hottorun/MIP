# Datenschutz bei Carbay: Stand, Maßnahmen, offene Punkte

Arbeitsunterlage für den Betreiber. Die öffentliche Datenschutzerklärung steht in `src/legal.ts` und beschreibt
dasselbe für Nutzer; beide müssen zum Code passen. Dieses Dokument ersetzt keine Rechtsberatung: die Texte und die
Einordnung der Rechtsgrundlagen sollte einmal jemand mit Zulassung gegenlesen, bevor die Seite öffentlich wird.

## 1. Was der Betreiber noch tun muss

Diese Punkte lassen sich nicht im Code erledigen. Solange sie offen sind, stimmt die Datenschutzerklärung nicht ganz.

| Punkt | Was zu tun ist |
| --- | --- |
| Betreiberangaben | `OPERATOR` in `src/legal.ts` ausfüllen (Name, Anschrift, E-Mail, Verantwortlicher). Bis dahin zeigen Impressum und Datenschutzerklärung einen Warnhinweis. |
| Schlüssel für Verträge | `MIP_CONTRACT_KEY` in Vercel setzen (`openssl rand -base64 32`), für Production und Preview. Ohne ihn lehnt der Server auf Vercel jeden Vertrags-Upload ab. Den Schlüssel zusätzlich an einem zweiten sicheren Ort ablegen (Passwortmanager). |
| Migrationen | `009_privacy.sql` und `010_row_level_security.sql` auf der Produktionsdatenbank ausführen (`npm run db:migrate`), vor dem Deploy. |
| AV-Vertrag Supabase | Im Supabase-Dashboard den Auftragsverarbeitungsvertrag (DPA) abschließen und ablegen. Dabei prüfen, dass das Projekt in `eu-central-1` (Frankfurt) liegt; die Datenschutzerklärung sagt das so. |
| AV-Vertrag Vercel | Der DPA ist Teil der Vercel-Bedingungen; Fassung herunterladen und ablegen. Funktionsregion ist `fra1` (`vercel.json`). |
| AV-Vertrag Anthropic | Der DPA ist Teil der Commercial Terms; Fassung ablegen. Prüfen, ob für das Konto „Zero Data Retention“ vereinbart werden kann, und die Erklärung dann um diesen Satz ergänzen. |
| Prüfer | In `MIP_ADMINS` nur Personen eintragen, die auf Vertraulichkeit verpflichtet sind (kurze schriftliche Erklärung). Verträge nicht herunterladen, drucken oder weitergeben. |
| Datenschutzbeauftragter | Nach § 38 BDSG erst nötig, wenn in der Regel mindestens 20 Personen ständig mit automatisierter Verarbeitung befasst sind. Kurz festhalten, dass das nicht zutrifft. |
| Folgenabschätzung | Eine Datenschutz-Folgenabschätzung (Art. 35) ist bei diesem Umfang voraussichtlich nicht nötig; die Einschätzung mit zwei Sätzen und Datum festhalten. |
| Postfach | Die in `OPERATOR.email` genannte Adresse muss gelesen werden: Anfragen von Betroffenen sind binnen eines Monats zu beantworten. |
| mobile.de | Die Nutzungsbedingungen der Search-API regeln, was mit Inseratsdaten geschehen darf; das ist kein Datenschutzthema der Nutzer, gehört aber geprüft. |

## 2. Verzeichnis der Verarbeitungstätigkeiten (Art. 30 DSGVO)

| Tätigkeit | Daten | Betroffene | Zweck | Rechtsgrundlage | Empfänger | Löschung |
| --- | --- | --- | --- | --- | --- | --- |
| Konto und Anmeldung | Benutzername, Passwort-Hash (scrypt), Registrierungszeit, Premium bis, Hash des Sitzungsschlüssels | Nutzer | Zugang zur App | Art. 6 (1) b | Vercel, Supabase | Konto: bei Löschung durch den Nutzer. Sitzung: ein Jahr nach dem letzten Besuch oder beim Abmelden |
| Schutz der Anmeldung | Hash aus Benutzername und IP-Adresse, Zeitpunkt | Nutzer, Angreifer | Passwortangriffe bremsen | Art. 6 (1) f | Supabase | 24 Stunden |
| Gespeicherte App-Daten | Watchlist, Portfolio (Preis, Datum, Laufleistung, Zustand, Notiz), Alarme, gemerkte Inserate | Nutzer | Funktionen der App auf allen Geräten | Art. 6 (1) b | Vercel, Supabase | bei Löschung des Kontos |
| Co-Pilot | Nachrichten des Nutzers, Portfolio und Watchlist als Kontext; kein Benutzername | Nutzer | Antworten auf Marktfragen | Art. 6 (1) b | Anthropic (USA, Standardvertragsklauseln) | bei uns keine Speicherung, Verlauf nur im Browser |
| Fahrzeugmeldung | Fahrzeugdaten mit Fahrgestellnummer, Preis, Datum, Land, Art der Gegenseite, Notiz; Zeitpunkt und Fassung der Einwilligung; Prüfergebnis | Nutzer | Geprüfte Verkaufspreise für die Marktwerte, Premium als Dank | Art. 6 (1) a | Vercel, Supabase | ohne Vertrag 30 Tage; abgelehnt/abgelaufen 90 Tage nach Entscheidung; freigegeben bis zur Löschung durch den Nutzer oder des Kontos, danach nur anonymisiert (ohne Konto, Fahrgestellnummer, Notiz) |
| Kaufvertrag | Datei (PDF/Foto), verschlüsselt; kann Namen, Anschriften, Unterschriften beider Seiten enthalten, soweit nicht geschwärzt | Nutzer, Vertragspartner | Echtheit der Meldung prüfen | Nutzer: Art. 6 (1) a. Vertragspartner: Art. 6 (1) f | Supabase (nur verschlüsselt); Anthropic nur mit gesonderter Einwilligung | mit der Entscheidung, spätestens nach 90 Tagen |
| Marktmodell | Preis, Datum, Land, Laufleistung, Baujahr, Variante, Art der Gegenseite; ohne Fahrgestellnummer, ohne Nutzer | keine (anonymisiert) | Marktwertberechnung | entfällt | öffentlich in der App als Teil der Werte | bleibt anonymisiert bestehen, auch wenn der Nutzer die Meldung oder das Konto löscht |
| Zugriffsprotokoll Verträge | Meldungs-ID, Prüfer, Aktion, Zeitpunkt | Prüfer | Nachweis, wer einen Vertrag geöffnet hat | Art. 6 (1) f | Supabase | ein Jahr |
| Forum | Beiträge mit Benutzername und Zeit; Meldungen von Beiträgen mit Begründung | Nutzer | Austausch, Moderation | Art. 6 (1) b, Moderation f | Supabase | eigener Beitrag: Text bei Entfernen gelöscht. Bei Kontolöschung ohne Namen |
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
- **Zugang:** ohne Sitzung nur Anmeldeseite, Impressum, Datenschutzerklärung. Verträge öffnen nur Prüfer
  (`MIP_ADMINS`), jeder Zugriff landet in `contract_access`. Das geteilte Demo-Konto kann keine Fahrzeuge melden.
- **Datenbank:** Row Level Security auf allen Tabellen, damit die Data-API von Supabase nichts herausgibt
  (`db/migrations/010_row_level_security.sql`); die App greift direkt als Eigentümer zu.
- **Browser:** strenge Content-Security-Policy (Skripte und Schriften nur von der eigenen Adresse), kein Framing,
  `Referrer-Policy: same-origin`, hochgeladene Dateien werden dem Prüfer in einer Sandbox ohne Skripte gezeigt.
- **Keine Dritten im Browser:** keine Analyse, keine Werbung, Schriften aus `public/fonts`. Fotos von Inseraten und
  Auktionslosen lädt der Browser beim Anbieter, ohne Referrer.
- **Datensparsamkeit:** Konto ohne E-Mail und Namen; Schwärzen des Vertrags ausdrücklich erlaubt; Anmeldezähler nur
  als Hash; Fehlerprotokoll ohne Benutzernamen; Export ins Marktmodell ohne Fahrgestellnummer und Nutzer
  (`scripts/db/export-user-cars.ts`).
- **Missbrauchsschutz:** Sperre nach Fehlversuchen, Budgets je Konto (`server/limits.ts`), Prüfung von Dateityp und
  Größe beim Upload, Herkunftsprüfung bei ändernden Anfragen.
- **Löschen ohne Zutun:** `sweepUserCars` in `server/userCars.ts` räumt nach den Fristen in `RETENTION` auf; der Lauf
  hängt an den Aufrufen der Portfolio-Seite, weil es keinen Zeitplaner gibt.

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
   nicht ausgeschlossen ist. Bei hohem Risiko auch die Betroffenen informieren; mangels E-Mail-Adressen über einen
   Hinweis in der App.
4. Vorfall, Folgen und Maßnahmen schriftlich festhalten, auch wenn keine Meldung nötig war.

## 6. Bei Änderungen am Code

Neue Tabelle: Row Level Security einschalten. Neues gespeichertes Feld, neuer Dienst, andere Frist: Abschnitt 2
hier und den passenden Satz in `src/legal.ts` ändern und `PRIVACY_AS_OF` hochsetzen. Anderer Wortlaut der
Einwilligung im Formular: `CONSENT_VERSION` in `server/userCars.ts` hochsetzen.
