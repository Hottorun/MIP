"""VAT on top of a published auction result.

Auction houses publish the result as hammer price plus buyer's premium. For most cars that is what the buyer pays,
because they are sold under the margin scheme. Some lots, mostly young cars sold by a company, carry VAT on the full
purchase price instead, and the house only says so in the lot notes ("VATQ" at RM Sotheby's, "subject to VAT on the
full purchase price"). For those the real price is the published one plus VAT at the rate of the country of sale, for
example the 2024 911 S/T at RM Munich 2026: EUR 376,250 published, about EUR 447,700 paid.

vat_rate(text, country) returns the rate to add (0.19) or None. It only answers for statements that apply to every
buyer. Notes that depend on the buyer (temporary import, VAT only "if it is to remain in the EU", "may be considered
as new in certain jurisdictions") are not counted, so a price is never raised on a guess.

Used by rmfetch.py (lot notes), artcurialfetch.py (descriptions, lots sold "HT") and bonhamsfetch.py (lot symbols,
bonhams_vat). Checked in November 2026 and not needed: Osenat (lot pages carry only the general conditions), Broad
Arrow (lot texts removed after the sale), Gooding (no catalogue text), Aguttes (its price already includes VAT); in
the US sales tax depends on the buyer (Mecum, Barrett-Jackson, Bring a Trailer, PCarMarket, GAA).
"""
import html, re

# standard VAT rates by country of sale (ISO 3166-1 alpha-2), as of November 2026
RATES = {
    "DE": 0.19, "AT": 0.20, "FR": 0.20, "MC": 0.20, "IT": 0.22, "NL": 0.21, "BE": 0.21, "ES": 0.21, "LU": 0.17,
    "PT": 0.23, "IE": 0.23, "DK": 0.25, "SE": 0.25, "FI": 0.255, "PL": 0.23, "CZ": 0.21, "GB": 0.20, "UK": 0.20,
    "CH": 0.081, "LI": 0.081, "NO": 0.25,
}

# the statement that the lot is subject to VAT on the full purchase price, in the languages the houses use
FULL = re.compile(
    r"\bVATQ\b"
    r"|subject to VAT(?:\s*\((?P<pct>\d{1,2}(?:[.,]\d)?)\s*%\))? on the (?:full|entire|whole) purchase price"
    r"|Mehrwertsteuer auf den (?:gesamten|vollen) Kaufpreis"
    r"|soumis à la TVA sur (?:l['’]ensemble|la totalité) du prix d['’]achat"
    r"|soggett[oa] a IVA sull['’]intero prezzo di acquisto"
    # Artcurial: "L'adjudication du lot est HT. La TVA, au taux en vigueur de 20 %, s'ajoute à l'adjudication pour obtenir
    # un prix TTC sur lequel est calculée la commission de vente TTC" (English: "This lot is sold VAT excluded")
    r"|L['’]adjudication du lot est HT\b|lot is (?:being )?sold (?:with )?VAT excluded",
    re.I,
)
# the same words, but only for some buyers: not counted
CONDITIONAL = re.compile(r"if it is to remain in the EU|if the (?:object|item|car|lot) remains in (?:the )?EU|in certain jurisdictions"
                         r"|in bestimmten Ländern|temporary import|imported items|import(?:ed)? VAT|customs duty", re.I)


def vat_rate(text, country):
    """Rate to add to the published price, or None when the lot is not subject to VAT on the full price (or the
    country of sale is unknown)."""
    for m in FULL.finditer(text or ""):
        tail = text[m.end():m.end() + 80]
        if CONDITIONAL.search(tail): continue
        if m.group("pct"): return float(m.group("pct").replace(",", ".")) / 100
        return RATES.get((country or "").upper())
    return None


def with_vat(amount, rate):
    return round(amount * (1 + rate)) if amount and rate else amount


# Bonhams marks such lots with a symbol whose text says what the VAT is charged on: "†" on hammer price and buyer's
# premium ("subject to additional VAT on the hammer price and buyer's premium", in France and Belgium also "the
# prevailing rate of TVA ... is 20%"), "NMT" on the hammer price only. "Ω" and "*" are import VAT, refunded or not
# charged when the car leaves the country, so they depend on the buyer and are not counted.
ON_HAMMER = re.compile(r"subject to (?:additional )?VAT on the hammer price(?! and)", re.I)
ON_BOTH = re.compile(r"subject to (?:additional )?VAT on the hammer price and (?:the )?buyer['’]s premium|prevailing rate of TVA", re.I)


def bonhams_vat(symbols, country):
    """(rate, "full" | "hammer") for a Bonhams lot's symbols, or (None, None)."""
    for s in symbols or []:
        d = html.unescape(s.get("longDescription") or "")
        if CONDITIONAL.search(d): continue
        if s.get("symbol") == "NMT" or ON_HAMMER.search(d) and not ON_BOTH.search(d): base = "hammer"
        elif s.get("symbol") == "†" or ON_BOTH.search(d): base = "full"
        else: continue
        m = re.search(r"\b(\d{1,2}(?:[.,]\d)?)\s*%", d)
        rate = float(m.group(1).replace(",", ".")) / 100 if m else RATES.get((country or "").upper())
        if rate: return rate, base
    return None, None
