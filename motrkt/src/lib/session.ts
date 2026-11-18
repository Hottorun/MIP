/** Signs out and leaves nothing of the account in this browser. */
export async function signOut() {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  } finally {
    // Nothing of this account stays in the browser: the next person to sign in here would otherwise see the cached
    // portfolio, watchlist and chat, and the store would upload them into their account. Language and theme stay.
    try {
      for (const k of Object.keys(localStorage)) if (k !== "mip-lang" && k !== "mip-theme") localStorage.removeItem(k);
      sessionStorage.clear();
    } catch {
      /* storage blocked */
    }
    window.location.replace("/anmelden");
  }
}
