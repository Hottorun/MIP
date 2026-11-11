import { handleRequest } from "../server/app.ts";

// Vercel function behind every request (vercel.json rewrites all paths here): sign-in gate, APIs and the app itself.
// The built app is bundled into this function (includeFiles), never published on the CDN.
export default handleRequest;
