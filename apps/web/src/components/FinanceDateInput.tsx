import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react'
import { gregorianToShamsi, shamsiToGregorian } from '@redmars/shared'
import { Input } from '@/components/ui/input'

/** Shamsi editing at the UI boundary; callers keep unambiguous Gregorian wire dates. */
export function FinanceDateInput({
  value,
  onChange,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string
  onChange: (value: string) => void
}) {
  const [edit, setEdit] = useState<{ source: string; text: string } | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.setCustomValidity('')
  }, [value])
  const text = edit?.source === value ? edit.text : value ? gregorianToShamsi(value) : ''
  return (
    <Input
      {...props}
      ref={ref}
      type="text"
      dir="ltr"
      placeholder="1404-07-05"
      inputMode="numeric"
      pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}"
      title="Shamsi date: YYYY-MM-DD (1350–1499)"
      value={text}
      onChange={(event) => {
        const entered = event.target.value
        setEdit({ source: value, text: entered })
        try {
          const converted = shamsiToGregorian(entered)
          event.target.setCustomValidity('')
          setEdit(null)
          onChange(converted)
        } catch {
          event.target.setCustomValidity('Enter a valid Shamsi date, for example 1404-07-05.')
        }
      }}
    />
  )
}
