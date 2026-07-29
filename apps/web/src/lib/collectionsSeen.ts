const STORAGE_KEY = 'redmars.collections.lastSeenAt'

/**
 * Task 6b.7 — "a badge for new arrivals" on the Collections worklist. Per-browser, like the
 * theme choice (theme.ts): the first time this ever runs there is nothing to compare
 * against, so it seeds "now" rather than counting every pre-existing unpaid bill as new —
 * the badge is for a bill that just landed, not a backlog dump on first use.
 */
export function getCollectionsLastSeen(): string {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) return stored
  const now = new Date().toISOString()
  localStorage.setItem(STORAGE_KEY, now)
  return now
}

export function markCollectionsSeen(): void {
  localStorage.setItem(STORAGE_KEY, new Date().toISOString())
}
