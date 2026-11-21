import { OPERATOR, type LegalSection } from "./legal.ts";

/**
 * Terms (AGB, /agb) and the withdrawal notice (/widerruf), shown by the server to everyone (server/legalPages.ts) and
 * mailed with every order (server/payments.ts). The German text is the binding one; the English one is a translation.
 * The withdrawal notice follows the statutory model word for word (Anlage 1 zu Art. 246a § 1 Abs. 2 Satz 2 EGBGB, in
 * the version with the online withdrawal function of § 356a BGB): change it only together with the law.
 */

/** Where the site lives, as the notices name it (the withdrawal function, the cancellation page). */
export const SITE = "www.cartag.info";

/**
 * How prices relate to VAT; decides the note next to every price and the sentence in the terms. Set it once:
 *   "included"        prices include VAT (regular taxation)
 *   "small-business"  no VAT is charged (Kleinunternehmer, § 19 UStG)
 *   ""                not decided yet: the texts only say "final price"
 */
export const VAT = "" as "" | "included" | "small-business";

export const PRICE_NOTE: [string, string] =
  VAT === "included"
    ? ["inkl. MwSt.", "incl. VAT"]
    : VAT === "small-business"
      ? ["Endpreis; gemäß § 19 UStG wird keine Umsatzsteuer berechnet", "final price; no VAT is charged (§ 19 UStG)"]
      : ["Endpreis", "final price"];

/** Date of the terms' wording. Change it with every change to AGB. */
export const TERMS_AS_OF: [string, string] = ["21. November 2026", "21 November 2026"];

const phone = OPERATOR.phone ? [`, Telefon: ${OPERATOR.phone}`, `, phone: ${OPERATOR.phone}`] : ["", ""];
// a partnership: who represents it, for the sentence of the terms that names the contracting party
const partners = OPERATOR.partners.length
  ? [`, vertreten durch die Gesellschafter ${OPERATOR.partners.join(" und ")}`, `, represented by its partners ${OPERATOR.partners.join(" and ")}`]
  : ["", ""];
/** Name, address, phone and email in one line, as the withdrawal notice and the terms name the operator. */
export const OPERATOR_LINE: [string, string] = [
  `${OPERATOR.name}, ${OPERATOR.street}, ${OPERATOR.city}, ${OPERATOR.country}${phone[0]}, E-Mail: ${OPERATOR.email}`,
  `${OPERATOR.name}, ${OPERATOR.street}, ${OPERATOR.city}, Germany${phone[1]}, email: ${OPERATOR.email}`,
];

const vatSentence: [string, string] =
  VAT === "included"
    ? ["Alle Preise sind Endpreise in Euro und enthalten die gesetzliche Umsatzsteuer.", "All prices are final prices in euros and include statutory VAT."]
    : VAT === "small-business"
      ? ["Alle Preise sind Endpreise in Euro. Als Kleinunternehmer im Sinne des § 19 UStG berechnen wir keine Umsatzsteuer.", "All prices are final prices in euros. As a small business within the meaning of § 19 UStG we charge no VAT."]
      : ["Alle Preise sind Endpreise in Euro; sie enthalten die gesetzliche Umsatzsteuer, soweit sie anfällt.", "All prices are final prices in euros; they include statutory VAT where it applies."];

export const WIDERRUF_INTRO: [string, string] = [
  "Wenn Sie Cartag Premium oder zusätzliche Suchaufträge als Verbraucher bestellen, steht Ihnen das folgende Widerrufsrecht zu. Verbraucher ist jede natürliche Person, die ein Rechtsgeschäft zu Zwecken abschließt, die überwiegend weder ihrer gewerblichen noch ihrer selbständigen beruflichen Tätigkeit zugerechnet werden können.",
  "If you order Cartag Premium or further search orders as a consumer, you have the following right of withdrawal. A consumer is any natural person who enters into a transaction for purposes that are predominantly outside their trade, business or profession. This is a translation; the German text is the binding one.",
];

export const WIDERRUF: LegalSection[] = [
  {
    heading: ["Widerrufsrecht", "Right of withdrawal"],
    paragraphs: [
      ["Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen.", "You have the right to withdraw from this contract within fourteen days without giving any reason."],
      ["Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses.", "The withdrawal period is fourteen days from the day the contract was concluded."],
      [
        `Um Ihr Widerrufsrecht auszuüben, müssen Sie uns (${OPERATOR_LINE[0]}) mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter Brief oder eine E-Mail) über Ihren Entschluss, diesen Vertrag zu widerrufen, informieren. Sie können dafür das beigefügte Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist. Sie können Ihr Widerrufsrecht auch online unter ${SITE}/widerruf ausüben. Wenn Sie diese Online-Funktion nutzen, übermitteln wir Ihnen auf einem dauerhaften Datenträger (z. B. durch eine E-Mail) unverzüglich eine Eingangsbestätigung mit Informationen zum Inhalt der Widerrufserklärung sowie dem Datum und der Uhrzeit ihres Eingangs.`,
        `To exercise your right of withdrawal you must inform us (${OPERATOR_LINE[1]}) of your decision to withdraw from this contract by an unequivocal statement (e.g. a letter sent by post or an email). You may use the attached model withdrawal form, but it is not obligatory. You can also exercise your right of withdrawal online at ${SITE}/widerruf. If you use this online function, we will send you without delay, on a durable medium (e.g. by email), an acknowledgement of receipt with information on the content of the withdrawal statement and the date and time of its receipt.`,
      ],
      [
        "Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.",
        "To meet the withdrawal deadline it is sufficient that you send your communication concerning the exercise of the right of withdrawal before the withdrawal period has expired.",
      ],
    ],
  },
  {
    heading: ["Folgen des Widerrufs", "Effects of withdrawal"],
    paragraphs: [
      [
        "Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, einschließlich der Lieferkosten (mit Ausnahme der zusätzlichen Kosten, die sich daraus ergeben, dass Sie eine andere Art der Lieferung als die von uns angebotene, günstigste Standardlieferung gewählt haben), unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf dieses Vertrags bei uns eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der ursprünglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen wurde ausdrücklich etwas anderes vereinbart; in keinem Fall werden Ihnen wegen dieser Rückzahlung Entgelte berechnet.",
        "If you withdraw from this contract, we shall reimburse to you all payments received from you, including the costs of delivery (with the exception of the supplementary costs resulting from your choice of a type of delivery other than the least expensive type of standard delivery offered by us), without undue delay and in any event not later than fourteen days from the day on which we are informed about your decision to withdraw from this contract. We will carry out such reimbursement using the same means of payment as you used for the initial transaction, unless you have expressly agreed otherwise; in any event, you will not incur any fees as a result of such reimbursement.",
      ],
      [
        "Haben Sie verlangt, dass die Dienstleistungen während der Widerrufsfrist beginnen soll, so haben Sie uns einen angemessenen Betrag zu zahlen, der dem Anteil der bis zu dem Zeitpunkt, zu dem Sie uns von der Ausübung des Widerrufsrechts hinsichtlich dieses Vertrags unterrichten, bereits erbrachten Dienstleistungen im Vergleich zum Gesamtumfang der im Vertrag vorgesehenen Dienstleistungen entspricht.",
        "If you requested to begin the performance of services during the withdrawal period, you shall pay us an amount which is in proportion to what has been provided until you have communicated to us your withdrawal from this contract, in comparison with the full coverage of the contract.",
      ],
    ],
  },
  {
    heading: ["Muster-Widerrufsformular", "Model withdrawal form"],
    list: true,
    paragraphs: [
      ["(Wenn Sie den Vertrag widerrufen wollen, dann füllen Sie bitte dieses Formular aus und senden Sie es zurück.)", "(Complete and return this form only if you wish to withdraw from the contract.)"],
      [`An ${OPERATOR.name}, ${OPERATOR.street}, ${OPERATOR.city}, ${OPERATOR.country}, E-Mail: ${OPERATOR.email}:`, `To ${OPERATOR.name}, ${OPERATOR.street}, ${OPERATOR.city}, Germany, email: ${OPERATOR.email}:`],
      [
        "Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über den Kauf der folgenden Waren (*)/die Erbringung der folgenden Dienstleistung (*)",
        "I/We (*) hereby give notice that I/we (*) withdraw from my/our (*) contract of sale of the following goods (*)/for the provision of the following service (*)",
      ],
      ["Bestellt am (*)/erhalten am (*)", "Ordered on (*)/received on (*)"],
      ["Name des/der Verbraucher(s)", "Name of consumer(s)"],
      ["Anschrift des/der Verbraucher(s)", "Address of consumer(s)"],
      ["Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier)", "Signature of consumer(s) (only if this form is notified on paper)"],
      ["Datum", "Date"],
      ["(*) Unzutreffendes streichen.", "(*) Delete as appropriate."],
    ],
  },
];

export const AGB: LegalSection[] = [
  {
    heading: ["1. Geltung und Vertragspartner", "1. Scope and contracting party"],
    paragraphs: [
      [
        `Diese Allgemeinen Geschäftsbedingungen gelten für die Nutzung von Cartag (${SITE}) und für alle Verträge über Cartag Premium und über zusätzliche Suchaufträge. Ihr Vertragspartner ist ${OPERATOR_LINE[0]}${partners[0]} („wir“).`,
        `These terms apply to the use of Cartag (${SITE}) and to all contracts for Cartag Premium and for further search orders. Your contracting party is ${OPERATOR_LINE[1]}${partners[1]} (“we”). This is a translation; the German text is the binding one.`,
      ],
      [
        "Verbraucher im Sinne dieser Bedingungen ist jede natürliche Person, die ein Rechtsgeschäft zu Zwecken abschließt, die überwiegend weder ihrer gewerblichen noch ihrer selbständigen beruflichen Tätigkeit zugerechnet werden können.",
        "A consumer within the meaning of these terms is any natural person who enters into a transaction for purposes that are predominantly outside their trade, business or profession.",
      ],
    ],
  },
  {
    heading: ["2. Was Cartag ist", "2. What Cartag is"],
    paragraphs: [
      [
        "Cartag wertet öffentlich berichtete Auktionsergebnisse, Angebote und von Nutzern gemeldete, geprüfte Verkäufe von Sportwagen aus und zeigt daraus berechnete Marktwerte, Verläufe und Einschätzungen. Ohne Konto sehen Sie den Katalog und die Marktwerte der Lite-Version. Mit einem kostenlosen Konto kommen Watchlist, Preisalarme, Portfolio, gemerkte Angebote und das Schreiben im Forum hinzu. Cartag Premium schaltet die vollständigen Marktdaten, die Verkaufsbelege, den Marktbericht (Insights) und den Co-Piloten frei und ist werbefrei.",
        "Cartag evaluates publicly reported auction results, listings and verified sales of sports cars reported by users, and shows market values, histories and assessments computed from them. Without an account you see the catalogue and the market values of the lite version. A free account adds the watchlist, price alerts, portfolio, saved listings and writing in the forum. Cartag Premium unlocks the full market data, the sales records, the market report (Insights) and the Co-Pilot, and is free of ads.",
      ],
      [
        "Marktwerte, Prognosen, Einschätzungen und die Antworten des Co-Piloten (ein KI-System) sind rechnerische Auswertungen. Sie sind keine Anlage-, Rechts-, Steuer- oder Kaufberatung und ersetzen nicht die Begutachtung eines einzelnen Fahrzeugs. Dass sie zutreffen oder ein Fahrzeug zu einem bestimmten Preis gekauft oder verkauft werden kann, ist nicht geschuldet.",
        "Market values, forecasts, assessments and the answers of the Co-Pilot (an AI system) are computed evaluations. They are not investment, legal, tax or purchase advice and do not replace the inspection of an individual car. We do not owe that they prove right or that a car can be bought or sold at a particular price.",
      ],
      [
        "Wir entwickeln Cartag weiter. Funktionen der kostenlosen Nutzung können wir ändern oder einstellen. Den Umfang von Cartag Premium ändern wir während eines bezahlten Zeitraums nur, soweit das für Sie ohne zusätzliche Kosten bleibt und ein triftiger Grund vorliegt (etwa neue Datenquellen, Wegfall einer Quelle, Sicherheit oder Rechtslage); beeinträchtigt eine Änderung die Nutzung mehr als unerheblich, können Sie den Vertrag innerhalb von 30 Tagen kostenfrei beenden. Eine ununterbrochene Verfügbarkeit ist nicht geschuldet; Wartungen und Störungen halten wir so kurz wie möglich.",
        "We keep developing Cartag. We may change or discontinue functions of the free use. We change the scope of Cartag Premium during a paid period only where this remains free of additional cost for you and there is a valid reason (such as new data sources, the loss of a source, security or the law); if a change impairs your use more than insignificantly, you may end the contract free of charge within 30 days. Uninterrupted availability is not owed; we keep maintenance and disruptions as short as possible.",
      ],
    ],
  },
  {
    heading: ["3. Konto", "3. Account"],
    paragraphs: [
      [
        "Das Konto ist kostenlos. Sie legen es mit Benutzername, E-Mail-Adresse und Passwort an; es entsteht, sobald Sie den Code aus unserer E-Mail eingegeben haben. Die Angaben müssen stimmen. Das Konto ist für Sie persönlich; Zugangsdaten geben Sie nicht weiter. Sie müssen volljährig sein, um Premium zu bestellen.",
        "The account is free. You create it with a username, an email address and a password; it comes into being once you have entered the code from our email. The details must be correct. The account is personal; do not pass on your sign-in details. You must be of age to order premium.",
      ],
      [
        "Sie können Ihr Konto jederzeit unter „Konto“ löschen. Wir können ein kostenloses Konto mit einer Frist von zwei Wochen per E-Mail kündigen. Bei schweren oder wiederholten Verstößen gegen diese Bedingungen können wir ein Konto sperren oder aus wichtigem Grund fristlos kündigen.",
        "You can delete your account at any time under “Account”. We may terminate a free account by email with two weeks' notice. In the event of serious or repeated breaches of these terms we may block an account or terminate it without notice for good cause.",
      ],
    ],
  },
  {
    heading: ["4. Cartag Premium bestellen", "4. Ordering Cartag Premium"],
    paragraphs: [
      [
        "Die Darstellung von Premium in der App ist noch kein bindendes Angebot. Über „Jetzt abonnieren“ oder „Jetzt kaufen“ gelangen Sie auf die Zahlungsseite unseres Zahlungsdienstleisters Stripe. Dort sehen Sie Leistung, Preis und Laufzeit noch einmal, wählen ein Zahlungsmittel und können Ihre Eingaben bis zum Absenden ändern oder die Seite verlassen. Mit dem Absenden der Bestellung auf der Zahlungsseite geben Sie ein verbindliches Angebot ab. Wir nehmen es an, indem wir Premium für Ihr Konto freischalten; das geschieht in der Regel unmittelbar nach der Zahlung.",
        "The presentation of premium in the app is not yet a binding offer. “Subscribe now” or “Buy now” takes you to the payment page of our payment provider Stripe. There you see the service, price and term once more, choose a means of payment and can change your entries until you submit, or leave the page. By submitting the order on the payment page you make a binding offer. We accept it by unlocking premium for your account, as a rule immediately after payment.",
      ],
      [
        "Nach der Bestellung erhalten Sie eine Bestätigung per E-Mail mit diesen Bedingungen und der Widerrufsbelehrung. Den Vertragstext speichern wir darüber hinaus nicht gesondert; die jeweils aktuelle Fassung dieser Bedingungen finden Sie unter /agb. Vertragssprachen sind Deutsch und Englisch; maßgeblich ist die deutsche Fassung.",
        "After ordering you receive a confirmation by email with these terms and the withdrawal notice. Beyond that we do not store the contract text separately; the current version of these terms is at /agb. The contract languages are German and English; the German version prevails.",
      ],
      [
        "Premium erhalten Sie außerdem ohne Zahlung als Dank für einen von uns geprüften Kaufvertrag (Ziffer 9).",
        "You also receive premium without payment as a thank-you for a purchase contract we have verified (section 9).",
      ],
      [
        "Suchagent: Mit einem Suchauftrag beschreiben Sie ein Fahrzeug, das Sie suchen. Der Suchagent (ein KI-System) gleicht den Auftrag einmal täglich mit dem Bestand von Händlern ab, die wir auswählen, und zeigt Ihnen passende Angebote und eine Einschätzung der Marktlage. In Premium sind drei Suchaufträge enthalten, in der kostenlosen Nutzung keiner. Weitere Suchaufträge können Sie mit jedem Konto als Abo dazubuchen, zum angezeigten Preis je Suchauftrag und Abrechnungszeitraum; die Bestellung läuft wie in dieser Ziffer beschrieben über die Zahlungsseite von Stripe, und wir nehmen sie an, indem wir die Suchaufträge für Ihr Konto freischalten. Für dieses Abo gelten die Regeln dieser Bedingungen für Abos entsprechend (Ziffern 5 bis 7, 11). Dass der Agent ein bestimmtes Fahrzeug findet, alle Angebote am Markt erfasst oder die Angaben der Händler zutreffen, ist nicht geschuldet. Endet das Abo oder Premium, ruhen die Suchaufträge, die über die dann noch enthaltene Zahl hinausgehen; sie werden nicht gelöscht.",
        "Search agent: with a search order you describe a car you are looking for. Once a day the search agent (an AI system) compares the order with the stock of dealers we select and shows you matching listings and an assessment of the market. Premium includes three search orders, the free use none. With any account you can add further search orders as a subscription, at the price shown per search order and billing period; the order is placed on Stripe's payment page as described in this section, and we accept it by unlocking the search orders for your account. The rules of these terms for subscriptions apply to this subscription accordingly (sections 5 to 7, 11). We do not owe that the agent finds a particular car, covers every listing on the market, or that the dealers' details are correct. If the subscription or premium ends, the search orders beyond the number then still included rest; they are not deleted.",
      ],
    ],
  },
  {
    heading: ["5. Preise und Zahlung", "5. Prices and payment"],
    paragraphs: [
      [
        `${vatSentence[0]} Es gilt der Preis, der bei der Bestellung angezeigt wird. Die Zahlung wickelt Stripe ab; zur Verfügung stehen die dort angezeigten Zahlungsmittel. Bei einem Abo wird der Preis für jeden Abrechnungszeitraum im Voraus abgebucht. Einen Beleg erhalten Sie per E-Mail.`,
        `${vatSentence[1]} The price shown when ordering applies. Stripe handles the payment; the means of payment shown there are available. For a subscription the price is charged in advance for each billing period. You receive a receipt by email.`,
      ],
      [
        "Eine Preisänderung für ein laufendes Abo teilen wir Ihnen mindestens sechs Wochen vorher per E-Mail mit. Sie gilt erst ab dem darauf folgenden Abrechnungszeitraum und nur, wenn Sie ihr zustimmen; stimmen Sie nicht zu, endet das Abo zum Ende des bezahlten Zeitraums.",
        "We announce a price change for a running subscription by email at least six weeks in advance. It applies only from the following billing period and only if you agree to it; if you do not agree, the subscription ends at the end of the paid period.",
      ],
    ],
  },
  {
    heading: ["6. Laufzeit und Kündigung", "6. Term and cancellation"],
    paragraphs: [
      [
        "Abo: Das Abo läuft für den gewählten Abrechnungszeitraum (z. B. einen Monat) und verlängert sich jeweils um denselben Zeitraum, wenn Sie nicht kündigen. Sie können jederzeit zum Ende des bezahlten Zeitraums kündigen; Premium bleibt bis dahin erhalten. Ist der Abrechnungszeitraum länger als ein Monat, können Sie nach Ablauf des ersten Zeitraums jederzeit mit einer Frist von einem Monat kündigen; den für die Zeit nach dem Vertragsende bereits gezahlten Betrag erstatten wir anteilig.",
        "Subscription: the subscription runs for the chosen billing period (e.g. one month) and renews for the same period each time unless you cancel. You may cancel at any time to the end of the paid period; premium stays until then. If the billing period is longer than one month, you may, after the first period has ended, cancel at any time with one month's notice; we refund the share already paid for the time after the end of the contract.",
      ],
      [
        `So kündigen Sie: im Konto (für Suchaufträge beim Suchagenten) unter „Abo verwalten oder kündigen“, ohne Anmeldung über „Verträge hier kündigen“ (${SITE}/kuendigen) oder mit einer Nachricht an die oben genannte Adresse. Wir bestätigen jede Kündigung per E-Mail.`,
        `How to cancel: in your account (for search orders at the search agent) under “Manage or cancel subscription”, without signing in via “Cancel contracts here” (${SITE}/kuendigen), or with a message to the address above. We confirm every cancellation by email.`,
      ],
      [
        "Einmalkauf: Ein einmalig bezahlter Premium-Zeitraum endet von selbst; er verlängert sich nicht und muss nicht gekündigt werden.",
        "One-time purchase: a premium period paid for once ends by itself; it does not renew and need not be cancelled.",
      ],
      [
        "Wir können ein Abo mit einer Frist von einem Monat zum Ende eines Abrechnungszeitraums kündigen. Das Recht beider Seiten zur Kündigung aus wichtigem Grund bleibt unberührt. Löschen Sie Ihr Konto, endet das Abo sofort; ein bereits bezahlter Zeitraum wird dabei nicht erstattet, Ihr Widerrufsrecht bleibt unberührt.",
        "We may cancel a subscription with one month's notice to the end of a billing period. Either side's right to terminate for good cause remains unaffected. If you delete your account, the subscription ends at once; a period already paid for is not refunded in that case, and your right of withdrawal remains unaffected.",
      ],
    ],
  },
  {
    heading: ["7. Widerrufsrecht", "7. Right of withdrawal"],
    paragraphs: [
      [
        `Verbrauchern steht ein gesetzliches Widerrufsrecht zu. Die Einzelheiten stehen in der Widerrufsbelehrung (${SITE}/widerruf); dort können Sie den Widerruf auch gleich online erklären („Vertrag widerrufen“).`,
        `Consumers have a statutory right of withdrawal. The details are in the withdrawal notice (${SITE}/widerruf), where you can also declare the withdrawal online straight away (“Withdraw from contract”).`,
      ],
    ],
  },
  {
    heading: ["8. Erlaubte Nutzung", "8. Permitted use"],
    paragraphs: [
      [
        "Sie dürfen Cartag für eigene Zwecke nutzen. Nicht erlaubt ist es, Daten automatisiert oder systematisch auszulesen (Scraping), wesentliche Teile der Datenbank zu vervielfältigen, weiterzugeben oder zu verkaufen, Schutzmaßnahmen und Nutzungsgrenzen zu umgehen oder ein Konto mit anderen zu teilen. Einzelne Werte dürfen Sie mit Quellenangabe „Cartag“ zitieren.",
        "You may use Cartag for your own purposes. You may not read out data automatically or systematically (scraping), copy, pass on or sell substantial parts of the database, circumvent protective measures and usage limits, or share an account with others. You may quote individual values with the source “Cartag”.",
      ],
      [
        "Inserate, Auktionslose und Fotos Dritter verlinken wir oder binden sie von den Seiten der Anbieter ein; für deren Inhalte und Angebote sind die Anbieter verantwortlich. Ein Vertrag über ein Fahrzeug kommt nie mit uns zustande.",
        "We link to listings, auction lots and photos of third parties or embed them from the providers' sites; the providers are responsible for their content and offers. A contract for a car is never concluded with us.",
      ],
    ],
  },
  {
    heading: ["9. Fahrzeugmeldungen", "9. Car reports"],
    paragraphs: [
      [
        "Wenn Sie einen eigenen Kauf oder Verkauf melden und den Kaufvertrag hochladen, versichern Sie, dass die Angaben stimmen, dass Sie an dem Geschäft beteiligt waren und dass Sie das Dokument hochladen dürfen. Namen, Anschriften, Unterschriften und Bankdaten dürfen Sie schwärzen. Wie wir das Dokument verarbeiten, steht in der Datenschutzerklärung.",
        "When you report a purchase or sale of your own and upload the purchase contract, you affirm that the details are correct, that you were party to the transaction and that you are allowed to upload the document. You may black out names, addresses, signatures and bank details. How we process the document is set out in the privacy notice.",
      ],
      [
        "Geben wir die Meldung nach der Prüfung frei, erhalten Sie Premium für den in der App genannten Zeitraum. Ein Anspruch auf Freigabe besteht nicht. Löschen Sie eine freigegebene Meldung, entfällt der dafür gewährte Premium-Zeitraum. Falsche Angaben oder gefälschte Dokumente berechtigen uns zur fristlosen Kündigung.",
        "If we approve the report after the review, you receive premium for the period stated in the app. There is no entitlement to approval. If you delete an approved report, the premium period granted for it lapses. False details or forged documents entitle us to terminate without notice.",
      ],
    ],
  },
  {
    heading: ["10. Forum: Regeln und Moderation", "10. Forum: rules and moderation"],
    paragraphs: [
      [
        "Im Forum schreiben Sie unter Ihrem Benutzernamen. Für Ihre Beiträge sind Sie selbst verantwortlich. Nicht erlaubt sind rechtswidrige Inhalte, Beleidigungen, Drohungen und Hetze, falsche Tatsachenbehauptungen über Personen oder Unternehmen, personenbezogene Daten Dritter (etwa Namen und Anschriften aus Kaufverträgen, Kennzeichen zusammen mit Namen), Inhalte, die Rechte Dritter verletzen (insbesondere fremde Fotos und Texte), Werbung, Verkaufsangebote ohne Bezug zum Thema, Spam und Schadsoftware.",
        "In the forum you write under your username. You are responsible for your own posts. Not allowed are unlawful content, insults, threats and hate speech, false statements of fact about people or companies, personal data of third parties (such as names and addresses from purchase contracts, or number plates together with names), content that infringes third-party rights (in particular other people's photos and texts), advertising, sales offers unrelated to the topic, spam and malware.",
      ],
      [
        "Sie räumen uns das einfache, zeitlich unbegrenzte Recht ein, Ihre Beiträge im Forum anzuzeigen. Eigene Beiträge können Sie jederzeit entfernen. Löschen Sie Ihr Konto, bleiben Ihre Beiträge ohne Benutzernamen stehen, damit Gespräche lesbar bleiben; entfernen Sie sie vorher, wenn Sie das nicht möchten.",
        "You grant us the simple right, unlimited in time, to display your posts in the forum. You can remove your own posts at any time. If you delete your account, your posts remain without your username so that conversations stay readable; remove them beforehand if you do not want that.",
      ],
      [
        "Moderation: Wir prüfen Beiträge nicht vorab. Jeder angemeldete Nutzer kann einen Beitrag über „Melden“ an unsere Prüfer melden; ohne Konto genügt eine E-Mail an die im Impressum genannte Adresse. Meldungen prüfen Menschen, zeitnah, sorgfältig und ohne Automatik; eine automatisierte Moderation setzen wir nicht ein. Verstößt ein Beitrag gegen das Gesetz oder diese Regeln, blenden wir ihn oder das ganze Thema aus. Bei schweren oder wiederholten Verstößen können wir das Schreiben im Forum oder das Konto sperren, nach vorheriger Warnung, sofern nicht die Schwere des Verstoßes ein sofortiges Handeln verlangt.",
        "Moderation: we do not check posts in advance. Any signed-in user can report a post to our reviewers with “Report”; without an account an email to the address in the Impressum is enough. Reports are reviewed by people, promptly, carefully and without automation; we use no automated moderation. If a post breaks the law or these rules, we hide it or the whole topic. In the event of serious or repeated breaches we may block writing in the forum or the account, after a prior warning unless the seriousness of the breach requires immediate action.",
      ],
      [
        "Blenden wir Ihren Beitrag aus oder beschränken wir Ihr Konto, teilen wir Ihnen das mit Begründung per E-Mail mit. Haben Sie einen Beitrag gemeldet, erfahren Sie von uns, wie wir entschieden haben. Sind Sie mit einer Entscheidung nicht einverstanden, können Sie ihr binnen sechs Monaten kostenlos per E-Mail widersprechen; wir prüfen sie dann erneut. Der Weg zu den Gerichten und zu einer zertifizierten außergerichtlichen Streitbeilegungsstelle nach Art. 21 der Verordnung (EU) 2022/2065 bleibt Ihnen offen.",
        "If we hide your post or restrict your account, we tell you so by email, with reasons. If you reported a post, we tell you how we decided. If you disagree with a decision, you can object to it free of charge by email within six months; we then review it again. You remain free to go to court or to a certified out-of-court dispute settlement body under Art. 21 of Regulation (EU) 2022/2065.",
      ],
    ],
  },
  {
    heading: ["11. Mängelrechte", "11. Rights in case of defects"],
    paragraphs: [
      [
        "Für Cartag Premium und die Suchaufträge gelten die gesetzlichen Mängelrechte für digitale Produkte (§§ 327 ff. BGB). Während der Laufzeit halten wir Premium in vertragsgemäßem Zustand und stellen erforderliche Aktualisierungen bereit; da Cartag im Browser läuft, müssen Sie dafür nichts installieren.",
        "The statutory rights for defects in digital products (§§ 327 et seq. BGB) apply to Cartag Premium and the search orders. During the term we keep premium in conformity with the contract and provide the necessary updates; as Cartag runs in the browser, you need not install anything for this.",
      ],
    ],
  },
  {
    heading: ["12. Haftung", "12. Liability"],
    paragraphs: [
      [
        "Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit, bei Verletzung von Leben, Körper oder Gesundheit, nach dem Produkthaftungsgesetz und soweit wir eine Garantie übernommen haben. Bei leicht fahrlässiger Verletzung einer wesentlichen Vertragspflicht (einer Pflicht, deren Erfüllung die Durchführung des Vertrags erst ermöglicht und auf deren Einhaltung Sie regelmäßig vertrauen dürfen) haften wir begrenzt auf den vertragstypischen, vorhersehbaren Schaden. Im Übrigen ist die Haftung für leichte Fahrlässigkeit ausgeschlossen. Das gilt auch für unsere Erfüllungsgehilfen.",
        "We are liable without limitation for intent and gross negligence, for injury to life, body or health, under the Product Liability Act and where we have given a guarantee. For a slightly negligent breach of an essential contractual duty (a duty whose fulfilment makes the performance of the contract possible in the first place and on whose observance you may regularly rely) our liability is limited to the foreseeable damage typical of the contract. Otherwise liability for slight negligence is excluded. This also applies to those we use to perform our duties.",
      ],
      [
        "Für die kostenlose Nutzung haften wir nur bei Vorsatz und grober Fahrlässigkeit sowie bei Verletzung von Leben, Körper oder Gesundheit.",
        "For the free use we are liable only for intent and gross negligence and for injury to life, body or health.",
      ],
    ],
  },
  {
    heading: ["13. Änderungen dieser Bedingungen", "13. Changes to these terms"],
    paragraphs: [
      [
        "Wir können diese Bedingungen ändern, wenn sich die Rechtslage, die Rechtsprechung oder unser Angebot ändert und die Änderung Sie nicht unangemessen benachteiligt. Änderungen teilen wir Ihnen mindestens sechs Wochen vor ihrem Wirksamwerden per E-Mail mit. Änderungen, die Hauptleistungen oder den Preis eines laufenden Abos betreffen, gelten nur mit Ihrer Zustimmung. Den übrigen Änderungen können Sie bis zu ihrem Wirksamwerden widersprechen; darauf und auf die Folgen weisen wir in der Mitteilung hin. Widersprechen Sie, gilt für Sie die bisherige Fassung weiter; wir können den Vertrag dann zum Ende des bezahlten Zeitraums kündigen.",
        "We may change these terms if the law, case law or our service changes and the change does not put you at an unreasonable disadvantage. We announce changes by email at least six weeks before they take effect. Changes concerning main services or the price of a running subscription apply only with your consent. You may object to other changes until they take effect; the announcement will point this out together with the consequences. If you object, the previous version continues to apply to you; we may then terminate the contract to the end of the paid period.",
      ],
    ],
  },
  {
    heading: ["14. Schlussbestimmungen", "14. Final provisions"],
    paragraphs: [
      [
        "Es gilt deutsches Recht. Sind Sie Verbraucher mit gewöhnlichem Aufenthalt in einem anderen Staat der Europäischen Union, bleiben die zwingenden Verbraucherschutzvorschriften dieses Staates anwendbar. Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen. Sollte eine Bestimmung unwirksam sein, bleiben die übrigen wirksam.",
        "German law applies. If you are a consumer habitually resident in another state of the European Union, the mandatory consumer protection provisions of that state remain applicable. We are neither willing nor obliged to take part in dispute resolution proceedings before a consumer arbitration board. Should a provision be invalid, the others remain valid.",
      ],
      [`Stand: ${TERMS_AS_OF[0]}.`, `As of ${TERMS_AS_OF[1]}.`],
    ],
  },
];

/** A legal text as plain text, for the mail that confirms an order (a durable medium, § 312f BGB). */
export function plainText(title: string, sections: LegalSection[], en: boolean, intro?: string): string {
  const i = en ? 1 : 0;
  const body = sections.map((s) => `${s.heading[i].toUpperCase()}\n\n${s.paragraphs.map((p) => (s.list ? `– ${p[i]}` : p[i])).join(s.list ? "\n" : "\n\n")}`).join("\n\n\n");
  return `${title.toUpperCase()}\n${"=".repeat(title.length)}\n\n${intro ? intro + "\n\n\n" : ""}${body}`;
}
