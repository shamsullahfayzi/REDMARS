import { useMutation, useQuery } from '@tanstack/react-query'
import {
  allergyListResponseSchema,
  allergySchema,
  type RecordAllergyRequest,
  type UpdateAllergyRequest,
} from '@redmars/shared'
import { apiGet, apiPatch, apiPost } from '@/lib/api'
import { queryClient } from '@/lib/queryClient'

/** Task 4.6 — every allergy on the patient, retracted ones included. */
export function useAllergies(patientId: string | undefined) {
  return useQuery({
    queryKey: ['patients', 'allergies', patientId],
    queryFn: () => apiGet(`/patients/${patientId}/allergies`, allergyListResponseSchema),
    enabled: Boolean(patientId),
  })
}

/**
 * Both writers invalidate the VISIT tree as well as the patient's allergy list, because
 * the consult banner is served by the visit context — recording an allergy that did not
 * change the banner would be the worst possible bug in this feature.
 */
export function useAllergyWriters(patientId: string) {
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['patients', 'allergies', patientId] })
    void queryClient.invalidateQueries({ queryKey: ['visits'] })
  }

  const add = useMutation({
    mutationFn: (input: RecordAllergyRequest) =>
      apiPost(`/patients/${patientId}/allergies`, input, allergySchema),
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAllergyRequest }) =>
      apiPatch(`/patients/${patientId}/allergies/${id}`, input, allergySchema),
    onSuccess: invalidate,
  })

  return { add, update }
}
