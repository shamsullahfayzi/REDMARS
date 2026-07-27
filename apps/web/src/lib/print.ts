/**
 * Print one of several sheets that live hidden on the same screen.
 *
 * The consult page mounts more than one print-only sheet (the prescription, the lab result
 * report). `window.print()` alone would put every one of them on the paper. This stamps the
 * document root with which sheet is wanted; the print stylesheet shows that one and hides the
 * rest, then the stamp is cleared once the dialog closes so the screen is unaffected.
 *
 * The default F4 prescription flow calls `window.print()` with no target — the stylesheet
 * treats "no target" as the prescription, so that path is untouched.
 *
 * `history-lab` is task 6b.6's addition — a second, independent lab-report target so
 * printing a PAST visit's results from the History tab can never collide with `lab`, the
 * CURRENT visit's own report mounted on the same page.
 */
export function printTarget(target: 'lab' | 'history-lab'): void {
  const root = document.documentElement
  root.setAttribute('data-print-target', target)
  const clear = () => {
    root.removeAttribute('data-print-target')
    window.removeEventListener('afterprint', clear)
  }
  window.addEventListener('afterprint', clear)
  window.print()
}
