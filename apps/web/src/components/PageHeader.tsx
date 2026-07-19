interface PageHeaderProps {
  title: string
  description?: string
}

/** The heading block every management screen opens with. One place, so every page's title sits at the same size and rhythm. */
export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <div className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  )
}
