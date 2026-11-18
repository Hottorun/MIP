/**
 * What the forum's server (server/forum.ts) and its interface (src/components/market/Forum.tsx) agree on: the ids
 * stored with a topic and sent as filters. Labels live in the interface. No imports here: the server loads this file.
 */

/** Every topic sits in one category; "allgemein" is the fallback and where older topics are. */
export const FORUM_CATEGORIES = ["kaufberatung", "technik", "markt", "historie", "teile", "erfahrung", "allgemein"] as const;
export type ForumCategory = (typeof FORUM_CATEGORIES)[number];

/** A question can be marked as answered (one reply is its solution); a discussion cannot. */
export const FORUM_KINDS = ["frage", "diskussion"] as const;
export type ForumKind = (typeof FORUM_KINDS)[number];

/** Filter of the topic list (?status=). */
export const FORUM_STATUS = ["alle", "offen", "geklaert", "unbeantwortet", "besitzer", "meine"] as const;
export type ForumStatus = (typeof FORUM_STATUS)[number];

/** Order of the topic list (?sortierung=). */
export const FORUM_SORTS = ["aktiv", "neu", "antworten"] as const;
export type ForumSort = (typeof FORUM_SORTS)[number];

export const oneOf = <T extends string>(list: readonly T[], v: unknown): T | null => (list as readonly unknown[]).includes(v) ? (v as T) : null;
