import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { brandingSchema } from '@redmars/shared'
import { useAuth } from '@/auth/authContext'
import { apiGet } from '@/lib/api'

export function useBranding() {
  const { user, status } = useAuth()
  return useQuery({
    queryKey: ['branding', user?.facilityId ?? 'public'],
    queryFn: () =>
      apiGet(
        user ? '/settings/branding' : '/settings/public-branding',
        brandingSchema,
      ),
    enabled: status !== 'loading',
    staleTime: 60000,
  })
}

export function DocumentBranding() {
  const { data } = useBranding()
  useEffect(() => {
    document.title = data?.name ? 'REDMARS - ' + data.name : 'REDMARS'
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (icon) {
      icon.type = data?.logo ? 'image/png' : 'image/svg+xml'
      icon.href = data?.logo ?? '/favicon.svg'
    }
  }, [data])
  return null
}
