import { Button } from '@/components/ui/button'

/**
 * Placeholder home. Real content arrives with the role-based nav in 1.6.
 * For now it exists to prove Tailwind + shadcn render.
 */
export function HomePage() {
  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="text-2xl font-semibold text-foreground">REDMARS HMIS</h1>
      <p className="text-muted-foreground">Blank shell. Phase 0, task 0.5.</p>
      <Button>Shadcn button</Button>
    </div>
  )
}
