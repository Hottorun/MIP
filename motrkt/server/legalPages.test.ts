import { describe, expect, it } from "vitest";
import { LEGAL_PATHS, legalPage, noticePage } from "./legalPages.ts";
import { AGB, WIDERRUF, plainText } from "../src/terms.ts";

describe("legal pages (server/legalPages.ts)", () => {
  it("links every other legal page and the two buttons from every page", () => {
    for (const which of LEGAL_PATHS) {
      const html = legalPage(which, false);
      for (const other of LEGAL_PATHS) if (other !== which) expect(html).toContain(`href="/${other}"`);
      expect(html).toContain(">Vertrag widerrufen</a>");
      expect(html).toContain(">Verträge hier kündigen</a>");
    }
  });

  it("the withdrawal page carries the statutory notice and the function of § 356a BGB", () => {
    const html = legalPage("widerruf", false);
    expect(html).toContain("Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen.");
    expect(html).toContain("Sie können Ihr Widerrufsrecht auch online unter www.cartag.info/widerruf ausüben.");
    expect(html).toContain("Muster-Widerrufsformular");
    expect(html).toMatch(/<form method="post" action="\/widerruf#erklaerung">/);
    for (const name of ["name", "email", "vertrag"]) expect(html).toContain(`name="${name}"`);
    expect(html).toContain('<button type="submit">Widerruf bestätigen</button>');
  });

  it("the cancellation page asks for what § 312k BGB names and nothing needs a sign-in", () => {
    const html = legalPage("kuendigen", false);
    for (const name of ["vertrag", "art", "grund", "email", "zeitpunkt", "datum"]) expect(html).toContain(`name="${name}"`);
    expect(html).toContain('<button type="submit">jetzt kündigen</button>');
    expect(html).not.toContain('type="password"');
  });

  it("keeps what was entered when the form comes back with an error, escaped", () => {
    const html = legalPage("kuendigen", false, { form: { values: { email: 'a"><script>x</script>', art: "ausserordentlich", grund: "<b>" }, error: "Bitte prüfen" } });
    expect(html).not.toContain("<script>x");
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain('value="ausserordentlich" checked');
    expect(html).toContain('role="alert">Bitte prüfen');
  });

  it("the page after a declaration shows what arrived, escaped", () => {
    const html = noticePage("Ihre Kündigung ist eingegangen", false, { paragraphs: ["Erhalten."], rows: [["Name", "<i>Max</i>"]] });
    expect(html).toContain("<dt>Name</dt><dd>&lt;i&gt;Max&lt;/i&gt;</dd>");
  });

  it("names the partnership and its partners as operator, controller and contracting party", () => {
    for (const which of ["impressum", "datenschutz"] as const) {
      expect(legalPage(which, false)).toContain("Ferdinand Reimer und Dimitris Kern GbR<br>Vertreten durch die Gesellschafter: Ferdinand Reimer und Dimitris Kern<br>");
    }
    expect(legalPage("impressum", false)).toContain("<p>Ferdinand Reimer und Dimitris Kern<br>Beide gemeinsam für alle Inhalte. Anschrift wie oben.</p>");
    expect(legalPage("agb", false)).toContain("vertreten durch die Gesellschafter Ferdinand Reimer und Dimitris Kern („wir“)");
    expect(legalPage("widerruf", false)).toContain("müssen Sie uns (Ferdinand Reimer und Dimitris Kern GbR, Stengelstraße 19");
  });

  it("has an English version of every page", () => {
    expect(legalPage("agb", true)).toContain("Terms and conditions");
    expect(legalPage("widerruf", true)).toContain("Confirm withdrawal");
    expect(legalPage("kuendigen", true)).toContain("cancel now");
  });
});

describe("terms as plain text (the order confirmation mail)", () => {
  it("contains every section of the terms and of the withdrawal notice", () => {
    const agb = plainText("Allgemeine Geschäftsbedingungen", AGB, false);
    for (const s of AGB) expect(agb).toContain(s.heading[0].toUpperCase());
    const notice = plainText("Widerrufsbelehrung", WIDERRUF, false, "Vorab.");
    expect(notice).toContain("Vorab.");
    expect(notice).toContain("– Hiermit widerrufe(n) ich/wir (*)");
    expect(notice).not.toContain("<");
  });
});
