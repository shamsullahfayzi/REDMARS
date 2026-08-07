/**
 * Task 6c.7 — CSV export of a report already on screen.
 *
 * Every report tab has already fetched its numbers by the time this is called; this only
 * serialises what is rendered, so it needs no round trip and no gate of its own beyond the
 * one the tab is already behind. That is deliberate — see reports.ts: an aggregate report's
 * CSV is not `data.export` (R11), which is the raw patient register and stays admin-only,
 * reason-required, audited.
 */
function csvField(value: string | number): string {
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const lines = [headers, ...rows].map((row) => row.map(csvField).join(','))
  // Leading BOM so Excel opens UTF-8 (Dari/Pashto department and diagnosis names) correctly.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
