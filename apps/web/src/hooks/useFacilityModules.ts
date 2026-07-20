import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  facilityModuleListResponseSchema,
  facilityModuleSummarySchema,
  type ModuleKey,
} from '@redmars/shared'
import { apiGet, apiPatch } from '@/lib/api'

const MODULES_KEY = ['facility-modules']

/** The full set of toggleable modules and their on/off state. Admin server-side. */
export function useFacilityModules() {
  return useQuery({
    queryKey: MODULES_KEY,
    queryFn: () => apiGet('/facility-modules', facilityModuleListResponseSchema),
  })
}

/** Flip one module on or off, then refresh the list. */
export function useSetFacilityModule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { module: ModuleKey; enabled: boolean }) =>
      apiPatch(
        `/facility-modules/${vars.module}`,
        { enabled: vars.enabled },
        facilityModuleSummarySchema,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MODULES_KEY }),
  })
}
