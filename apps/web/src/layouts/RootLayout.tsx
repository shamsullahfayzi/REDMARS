import { Outlet } from 'react-router'

/**
 * App shell. Deliberately bare.
 *
 * Note the logical properties (ps-/pe-, ms-/me-, start/end) used from here on
 * instead of left/right — they are what let dir="rtl" mirror the layout in 0.6
 * without a parallel stylesheet.
 */
export function RootLayout() {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-4">
          <span className="font-semibold">REDMARS</span>
          {/* Role-based nav lands in 1.6; language toggle in 0.6. */}
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-4">
        <Outlet />
      </main>
    </div>
  )
}
