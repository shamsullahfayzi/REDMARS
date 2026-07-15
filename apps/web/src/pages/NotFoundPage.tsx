import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="text-2xl font-semibold text-foreground">404</h1>
      <p className="text-muted-foreground">That page does not exist.</p>
      <Link to="/" className="text-sm underline underline-offset-4">
        Back to start
      </Link>
    </div>
  )
}
