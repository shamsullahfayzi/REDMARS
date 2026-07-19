import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  drugListResponseSchema,
  drugSummarySchema,
  importDrugsResponseSchema,
  type CreateDrugRequest,
  type DrugListResponse,
  type ImportDrugsResponse,
  type UpdateDrugRequest,
} from '@redmars/shared'
import { apiGet, apiPatch, apiPost } from '@/lib/api'

const DRUGS_KEY = ['drugs']

/** The formulary, optionally filtered by a search term. The term is part of the query key so each search is its own cache entry. Admin + pharmacist server-side. */
export function useDrugs(q: string) {
  const term = q.trim()
  return useQuery<DrugListResponse>({
    queryKey: [...DRUGS_KEY, term],
    queryFn: () =>
      apiGet(`/drugs${term ? `?q=${encodeURIComponent(term)}` : ''}`, drugListResponseSchema),
  })
}

export function useCreateDrug() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateDrugRequest) => apiPost('/drugs', input, drugSummarySchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DRUGS_KEY }),
  })
}

export function useUpdateDrug() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; input: UpdateDrugRequest }) =>
      apiPatch(`/drugs/${vars.id}`, vars.input, drugSummarySchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DRUGS_KEY }),
  })
}

export function useSetDrugActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; isActive: boolean }) =>
      apiPatch(`/drugs/${vars.id}/active`, { isActive: vars.isActive }, drugSummarySchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DRUGS_KEY }),
  })
}

export function useImportDrugs() {
  const queryClient = useQueryClient()
  return useMutation<ImportDrugsResponse, Error, string>({
    mutationFn: (csv: string) => apiPost('/drugs/import', { csv }, importDrugsResponseSchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DRUGS_KEY }),
  })
}
