/**
 * The browser's token store.
 *
 * localStorage, chosen deliberately for 1.6: it survives a page refresh, which is
 * what lets AuthProvider call /auth/me and rehydrate a session instead of throwing
 * the user back to the login screen every reload. The cost is that a successful
 * XSS could read these — but this app runs same-origin on a hospital LAN, the
 * access token lives 15 minutes, and the refresh flow (1.8) is the containment.
 * Memory-only storage would trade all of that away for a worse daily experience.
 *
 * Reads are wrapped in try/catch because localStorage is not guaranteed — it
 * throws in private-mode browsers and when the quota is blown. A token store that
 * can crash the whole app on getItem is not a store, so a failure reads as "no
 * token", which routes the user to a clean login rather than a white screen.
 */

const ACCESS_KEY = 'redmars.accessToken';
const REFRESH_KEY = 'redmars.refreshToken';

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_KEY);
  } catch {
    return null;
  }
}

export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

export function setTokens(tokens: { accessToken: string; refreshToken: string }): void {
  try {
    localStorage.setItem(ACCESS_KEY, tokens.accessToken);
    localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
  } catch {
    // If we cannot persist the token, the session will not survive a refresh.
    // That is a degraded experience, not a broken one — the in-memory auth state
    // still works for this page load. Nothing to do but carry on.
  }
}

export function clearTokens(): void {
  try {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  } catch {
    // Nothing we can do; a store we cannot write is also one we cannot clear.
  }
}
