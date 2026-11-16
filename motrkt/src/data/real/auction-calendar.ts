import data from "./auction-calendar.json";

/**
 * Coming auctions of the houses in our data (scripts/market/upcoming.py, refreshed by the daily update): sales the
 * fetchers see in the houses' lot lists, plus dates entered by hand in scripts/market/manual/auktionstermine.csv.
 */
export type CalendarSale = {
  house: string;
  name: string;
  /** First day (ISO). */
  date: string;
  /** Last day when the sale runs over several days. */
  end: string | null;
  place: string;
  country: string;
  url: string | null;
  /** Porsche lots in the catalogue so far; null for dates entered by hand. */
  porsche: number | null;
  online: boolean;
};

const D = data as unknown as { asOf: string; sales: CalendarSale[] };

export const CALENDAR_AS_OF = D.asOf;
export const calendarSales: CalendarSale[] = D.sales ?? [];

/** Auction calendar of every house in our sales data that still holds sales, for the links below the list. */
export const HOUSE_CALENDARS: { house: string; url: string; online?: boolean }[] = [
  { house: "Bring a Trailer", url: "https://bringatrailer.com/auctions/", online: true },
  { house: "PCARMARKET", url: "https://www.pcarmarket.com/", online: true },
  { house: "RM Sotheby's", url: "https://rmsothebys.com/upcoming/" },
  { house: "Mecum", url: "https://www.mecum.com/auctions/" },
  { house: "Bonhams", url: "https://cars.bonhams.com/auctions/" },
  { house: "Gooding & Company", url: "https://www.goodingco.com/" },
  { house: "Barrett-Jackson", url: "https://www.barrett-jackson.com/auctions" },
  { house: "Broad Arrow", url: "https://www.broadarrowauctions.com/" },
  { house: "Iconic Auctioneers", url: "https://www.iconicauctioneers.com/" },
  { house: "Artcurial", url: "https://www.artcurial.com/en" },
  { house: "Historics", url: "https://www.historics.co.uk/auctions/" },
  { house: "Russo and Steele", url: "https://www.russoandsteele.com/" },
  { house: "Osenat", url: "https://www.osenat.com/" },
  { house: "Aguttes", url: "https://www.aguttes.com/ventes/prochaines-ventes" },
  { house: "COYS", url: "https://www.coys.co.uk/" },
  { house: "GAA Classic Cars", url: "https://www.gaaclassiccars.com/" },
  { house: "H&H", url: "https://www.handh.co.uk/" },
  { house: "Finarte", url: "https://www.finarte.it/" },
];
