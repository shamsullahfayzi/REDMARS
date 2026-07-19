import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  specialityListResponseSchema,
  specialitySummarySchema,
  type CreateSpecialityRequest,
  type SpecialityListResponse,
} from '@redmars/shared'
import { apiGet, apiPost } from '@/lib/api'

const SPECIALITIES_KEY = ['specialities']

/** The global speciality lookup. Admin-only server-side (practitioner.manage). */
export function useSpecialities() {
  return useQuery<SpecialityListResponse>({
    queryKey: SPECIALITIES_KEY,
    queryFn: () => apiGet('/specialities', specialityListResponseSchema),
  })
}

export function useCreateSpeciality() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateSpecialityRequest) =>
      apiPost('/specialities', input, specialitySummarySchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SPECIALITIES_KEY }),
  })
}
