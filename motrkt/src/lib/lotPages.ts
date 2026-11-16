/** Lot pages (not search or result lists) of the houses in our sales data; shared by server/lotPhotos.ts and the app. */
export const LOT_PAGES: RegExp[] = [
  /^https:\/\/bringatrailer\.com\/listing\/[^/?#]+\/?$/,
  /^https:\/\/www\.mecum\.com\/lots\/(?:[A-Z]{2}\d{2}-)?\d+\/[^/?#]+\/?$/,
  /^https:\/\/rmsothebys\.com\/(?:[a-z]{2}\/)?auctions\/[^/]+\/lots\/[^/?#]+\/?$/,
  /^https:\/\/www\.goodingco\.com\/lot\/[^/?#]+\/?$/,
  /^https:\/\/www\.iconicauctioneers\.com\/(?:online\/)?(?:[^/?#]+-)?recc?\d+-\d+[^/?#]*$/i,
  /^https:\/\/(?:cars|www)\.bonhams\.com\/auction\/\d+\/lot\/[^?#]+$/,
  /^https:\/\/www\.broadarrowauctions\.com\/vehicles\/[a-z0-9_]+\/[^/?#]+\/?$/,
  /^https:\/\/www\.artcurial\.com\/(?:en|fr)\/sales\/\d+\/lots\/[^/?#]+\/?$/,
  /^https:\/\/www\.osenat\.com\/lot\/\d+\/[^/?#]+$/,
  /^https:\/\/www\.aguttes\.com\/lot\/[^?#]+$/,
];

export const isLotPage = (url: string) => LOT_PAGES.some((r) => r.test(url));

/**
 * Where a result without any link of its own leads: the house's past results, else its home page (houses whose lot
 * pages we cannot read or match, see scripts/market/lotlinks.py). Houses that no longer exist (Russo and Steele,
 * Leake, Rick Cole, The Finest, Sackey & Co.) have no page left and stay without a link.
 */
export const HOUSE_PAGES: Record<string, string> = {
  "Barrett-Jackson": "https://www.barrett-jackson.com/",
  "Historics Auctioneers": "https://www.historics.co.uk/auctions/",
  Mecum: "https://www.mecum.com/auctions/",
  "Kruse Auctions": "https://kruseauctions.com/",
  COYS: "https://www.coys.co.uk/",
  "GAA Classic Cars": "https://www.gaaclassiccars.com/vehicles/results",
  "Iconic Auctioneers": "https://www.iconicauctioneers.com/",
  "H&H": "https://www.handh.co.uk/",
  Finarte: "https://www.finarte.it/",
  "BINGO (BH Auction Co.)": "https://bhauction.com/en/",
  PCARMARKET: "https://www.pcarmarket.com/",
  // RM Sotheby's took over Auctions America
  "Auctions America": "https://rmsothebys.com/",
};

export const isHousePage = (url: string) => Object.values(HOUSE_PAGES).includes(url);
