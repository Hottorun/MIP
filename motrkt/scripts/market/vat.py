"""VAT on top of a published auction result.

Auction houses publish the result as hammer price plus buyer's premium. For most cars that is what the buyer pays,
because they are sold under the margin scheme. Some lots, mostly young cars sold by a company, carry VAT on the full
purchase price instead, and the house only says so in the lot notes ("VATQ" at RM Sotheby's, "subject to VAT on the
full purchase price"). For those the real price is the published one plus VAT at the rate of the country of sale, for
example the 2024 911 S/T at RM Munich 2026: EUR 376,250 published, about EUR 447,700 paid.

vat_rate(text, country) returns the rate to add (0.19) or None. It only answers for statements that apply to every
buyer. Notes that depend on the buyer (temporary import, VAT only "if it is to remain in the EU", "may be considered
as new in certain jurisdictions") are not counted, so a price is never raised on a guess.
"""
import re

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
    r"|soggett[oa] a IVA sull['’]intero prezzo di acquisto",
    re.I,
)
# the same words, but only for some buyers: not counted
CONDITIONAL = re.compile(r"if it is to remain in the EU|in certain jurisdictions|in bestimmten Ländern|temporary import", re.I)


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
