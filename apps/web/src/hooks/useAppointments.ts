import { useMutation, useQuery } from '@tanstack/react-query'
import {
  appointmentListResponseSchema,
  appointmentSummarySchema,
  type AppointmentListQuery,
  type CloseAppointmentRequest,
  type CreateAppointmentRequest,
} from '@redmars/shared'
import { apiGet, apiPatch, apiPost } from '@/lib/api'
import { queryClient } from '@/lib/queryClient'

const APPOINTMENTS_KEY = ['appointments']

/** The book, for a day or for everything still to come. */
export function useAppointments(filters: Partial<AppointmentListQuery>) {
  const params = new URLSearchParams()
  if (filters.date) params.set('date', filters.date)
  if (filters.upcoming) params.set('upcoming', 'true')
  if (filters.patientId) params.set('patientId', filters.patientId)
  if (filters.practitionerId) params.set('practitionerId', filters.practitionerId)
  if (filters.departmentId) params.set('departmentId', filters.departmentId)
  if (filters.status) params.set('status', filters.status)
  const query = params.toString()

  return useQuery({
    queryKey: [...APPOINTMENTS_KEY, query],
    queryFn: () =>
      apiGet(`/appointments${query ? `?${query}` : ''}`, appointmentListResponseSchema),
  })
}

/** "Come back on the fifth" — held by the doctor as well as the desk (task 3.10). */
export function useCreateAppointment() {
  return useMutation({
    mutationFn: (input: CreateAppointmentRequest) =>
      apiPost('/appointments', input, appointmentSummarySchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: APPOINTMENTS_KEY }),
  })
}

/**
 * Cancelled or no-show — two different facts kept apart, because the difference is the
 * only number that says whether the clinic's follow-ups actually work.
 */
export function useCloseAppointment(id: string) {
  return useMutation({
    mutationFn: (input: CloseAppointmentRequest) =>
      apiPatch(`/appointments/${id}/close`, input, appointmentSummarySchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: APPOINTMENTS_KEY }),
  })
}
