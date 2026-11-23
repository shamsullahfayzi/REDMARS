import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { availabilitySchema } from '@redmars/shared'
import { useAuth } from '@/auth/authContext'
import { apiGet } from '@/lib/api'

export function useAvailability(ids: string[]) {
  const { roles, user } = useAuth()
  const key = [...new Set(ids)].sort().join(',')
  const [settled, setSettled] = useState(key)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(key), 180)
    return () => clearTimeout(timer)
  }, [key])
  const enabled = roles.some((r) => ['doctor', 'pharmacist', 'admin'].includes(r))
  const query = useQuery({
    queryKey: ['stock-availability', user?.id, settled],
    queryFn: async () => {
      const list = settled.split(',')
      const chunks = []
      for (let i = 0; i < list.length; i += 80)
        chunks.push(
          apiGet(
            '/pharmacy/inventory/availability?ids=' + list.slice(i, i + 80).join(','),
            availabilitySchema,
          ),
        )
      return (await Promise.all(chunks)).flat()
    },
    enabled: enabled && !!settled && settled === key,
    staleTime: 5000,
    refetchInterval: 5000,
    retry: 1,
  })
  return {
    enabled,
    failed: query.isError || (query.isSuccess && settled === key),
    entries: query.isError || settled !== key ? [] : (query.data ?? []),
  }
}
