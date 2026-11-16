/** Lot pages (not search or result lists) of the houses in our sales data; shared by server/lotPhotos.ts and the app. */
export const LOT_PAGES: RegExp[] = [
  /^https:\/\/bringatrailer\.com\/listing\/[^/?#]+\/?$/,
  /^https:\/\/www\.mecum\.com\/lots\/\d+\/[^/?#]+\/?$/,
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
