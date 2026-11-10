// The app was called MOTRKT before; carry saved settings, portfolio and imports over to the new MIP keys once.
// Imported first in main.tsx so it runs before any module reads localStorage.
const RENAMED: [string, string][] = [
  ["motrkt:v1", "mip:v1"],
  ["motrkt:sales-import", "mip:sales-import"],
  ["motrkt-lang", "mip-lang"],
];
try {
  for (const [from, to] of RENAMED) {
    const old = localStorage.getItem(from);
    if (old !== null && localStorage.getItem(to) === null) localStorage.setItem(to, old);
    if (old !== null) localStorage.removeItem(from);
  }
} catch {
  // storage blocked (private mode etc.): nothing to migrate
}
