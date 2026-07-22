import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown } from 'lucide-react'
import { searchCodes, type PrescriptionCode } from '@redmars/shared'
import { cn } from '@/lib/utils'

/**
 * A combobox over a short list of medical abbreviations.
 *
 * BUILT FOR ZERO HUNTING, which is the entire requirement:
 *
 *  - Focusing it opens the whole list. Nothing has to be typed to discover what exists,
 *    so a prescriber who does not know the code for "under the skin" can read it off.
 *  - Typing filters on the CODE, the plain-language LABEL and a keyword list — "injection"
 *    finds IM, IV and SC; "night" finds ON; "twice" finds BD. A doctor who thinks in words
 *    never has to know the abbreviation, and one who thinks in abbreviations types two
 *    letters and presses Enter.
 *  - Enter takes the highlighted row, which starts on the first match. Type "iv", Enter,
 *    done — two keystrokes and no mouse, matching the rest of the consult screen.
 *  - The list is ordered by how often each is used, not alphabetically. PO is written many
 *    times a day and PV essentially never.
 *
 * `allowFree` is the difference between route/frequency (closed sets, the contract refuses
 * anything else) and dose/duration (presets over an open field, because "½ tab" and "until
 * review" are real answers no list will contain).
 */
export function CodePicker({
  id,
  label,
  value,
  codes,
  allowFree = false,
  disabled = false,
  invalid = false,
  placeholder,
  onChange,
}: {
  id: string
  label: string
  value: string
  codes: readonly PrescriptionCode[]
  allowFree?: boolean
  disabled?: boolean
  invalid?: boolean
  placeholder?: string
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const wrapper = useRef<HTMLDivElement>(null)
  const listId = useId()

  // While closed the box shows the chosen code; while open it shows what is being typed,
  // so opening never wipes a value the doctor may decide to keep.
  const matches = useMemo(() => searchCodes(query, codes), [query, codes])
  const selected = codes.find((entry) => entry.code === value)

  useEffect(() => {
    setActive(0)
  }, [query])

  // Click outside closes. For a closed set the typed text is discarded, because a
  // half-typed "int" is not a route and storing it would defeat the point of the list.
  useEffect(() => {
    if (!open) return
    function onDocumentClick(event: MouseEvent) {
      if (wrapper.current?.contains(event.target as Node)) return
      setOpen(false)
      if (allowFree && query.trim()) onChange(query.trim())
      setQuery('')
    }
    document.addEventListener('mousedown', onDocumentClick)
    return () => document.removeEventListener('mousedown', onDocumentClick)
  }, [open, allowFree, query, onChange])

  function commit(code: string) {
    onChange(code)
    setQuery('')
    setOpen(false)
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((current) => (current + step + matches.length) % Math.max(matches.length, 1))
      return
    }

    if (event.key === 'Enter') {
      // Only claim Enter when there is something to take. Otherwise it belongs to the
      // form — a doctor pressing Enter on a completed row means "save".
      if (open && matches[active]) {
        event.preventDefault()
        commit(matches[active].code)
      } else if (open && allowFree && query.trim()) {
        event.preventDefault()
        commit(query.trim())
      }
      return
    }

    if (event.key === 'Escape' && open) {
      // Stopped here so Escape closes the list rather than reaching task 4.2's leave key.
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      setQuery('')
    }
  }

  return (
    <div className="space-y-1" ref={wrapper}>
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={invalid || undefined}
          autoComplete="off"
          disabled={disabled}
          // The chosen code while closed; what is being typed while open.
          value={open ? query : value}
          placeholder={placeholder ?? t('codes.placeholder')}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onKeyDown={onKeyDown}
          className={cn(
            'h-10 w-full rounded-lg border bg-background px-3 pe-8 text-sm text-foreground',
            'placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            'disabled:cursor-not-allowed disabled:opacity-60',
            invalid ? 'border-destructive' : 'border-input',
          )}
        />
        <ChevronDown
          className="pointer-events-none absolute end-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
      </div>

      {/* The plain-language reading of the chosen code, so "PO" never sits there
          unexplained for someone who has not memorised the list yet. */}
      {!open && selected?.label && (
        <p className="text-xs text-muted-foreground">{selected.label}</p>
      )}

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-56 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
        >
          {matches.length === 0 && (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">
              {allowFree ? t('codes.freeHint') : t('codes.noMatch')}
            </li>
          )}
          {matches.map((entry, index) => (
            <li key={entry.code}>
              <button
                type="button"
                role="option"
                aria-selected={entry.code === value}
                // Mouse down rather than click: the outside-click handler fires first
                // otherwise and closes the list before the choice lands.
                onMouseDown={(e) => {
                  e.preventDefault()
                  commit(entry.code)
                }}
                onMouseEnter={() => setActive(index)}
                className={cn(
                  'flex w-full items-baseline gap-2 rounded px-2 py-1.5 text-start text-sm',
                  index === active ? 'bg-muted' : 'hover:bg-muted/60',
                )}
              >
                <span className="min-w-10 font-mono font-semibold text-primary" dir="ltr">
                  {entry.code}
                </span>
                <span className="flex-1 text-foreground">{entry.label}</span>
                {entry.code === value && <Check className="size-3.5 text-primary" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
