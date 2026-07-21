import { useEffect, useState } from 'react'

/**
 * The value, settled — updates only once it has stopped changing for `delay` ms.
 *
 * Extracted at the third use (ICD lookup, patient search, duplicate check). Two copies
 * were a duplicate; three is a shared thing.
 */
export function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}
