import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { setDataset } from "../data/real/dataset";

// The app loads the market data at start (src/main.tsx); tests get it from the files directly.
const REAL = fileURLToPath(new URL("../data/real/", import.meta.url));
const json = (f: string) => JSON.parse(readFileSync(REAL + f, "utf8"));
setDataset({ model: json("market-model.json"), asks: json("asks.json"), history: json("listing-history.json"), salesCsv: readFileSync(REAL + "sales.csv", "utf8") });
