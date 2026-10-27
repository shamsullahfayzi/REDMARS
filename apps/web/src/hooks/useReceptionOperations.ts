import { useMutation, useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import {
  patientReceptionProfileSchema,
  receptionWorkspaceSchema,
  type PatientReceptionProfile,
} from '@redmars/shared'
import { apiDownload, apiGet, apiPatch, apiPost } from '@/lib/api'
import { withCommandKey } from '@/lib/commandKey'
import { queryClient } from '@/lib/queryClient'

const WORKSPACE_KEY = ['reception', 'operations'] as const
const resultSchema = z.unknown()

export function useReceptionWorkspace() {
  return useQuery({
    queryKey: WORKSPACE_KEY,
    queryFn: () => apiGet('/reception/operations', receptionWorkspaceSchema),
    refetchInterval: 30_000,
  })
}

const receptionAuditSchema = z.object({
  logs: z.array(z.object({
    id: z.string(), userId: z.string().nullable(), action: z.string(), entity: z.string(),
    entityId: z.string().nullable(), createdAt: z.string(),
  })),
})

export function useReceptionAudit(enabled: boolean) {
  return useQuery({
    queryKey: [...WORKSPACE_KEY, 'audit'],
    queryFn: () => apiGet('/reception/operations/audit', receptionAuditSchema),
    enabled,
  })
}

export function usePatientReceptionProfile(patientId: string | undefined) {
  return useQuery<PatientReceptionProfile>({
    queryKey: [...WORKSPACE_KEY, 'patient', patientId],
    queryFn: () => apiGet(`/reception/operations/patients/${patientId}`, patientReceptionProfileSchema),
    enabled: Boolean(patientId),
  })
}

async function refresh(patientId?: string) {
  await queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY })
  if (patientId)
    await queryClient.invalidateQueries({ queryKey: [...WORKSPACE_KEY, 'patient', patientId] })
}

export function useReceptionCommand(path: string, method: 'post' | 'patch' = 'post', patientId?: string) {
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => {
      const payload = withCommandKey(input)
      return method === 'post'
        ? apiPost(path, payload, resultSchema)
        : apiPatch(path, payload, resultSchema)
    },
    onSuccess: () => refresh(patientId),
  })
}

export function downloadPatientDocument(patientId: string, documentId: string) {
  return apiDownload(`/reception/operations/patients/${patientId}/documents/${documentId}`)
}
