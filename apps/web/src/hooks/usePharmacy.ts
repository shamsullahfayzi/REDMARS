import { useQuery } from '@tanstack/react-query'
import { pharmacyPrescriptionSchema, pharmacyQueueResponseSchema } from '@redmars/shared'
import { apiGet } from '@/lib/api'

/**
 * The pharmacy queue (task 6.8) — the doctor's active orders, oldest first. Kept fresh
 * (staleTime 0) and polled, so a prescription written in a consult shows at the bench
 * without a manual reload, and a dispensed one drops off.
 */
export function usePharmacyQueue() {
  return useQuery({
    queryKey: ['pharmacy', 'queue'],
    queryFn: () => apiGet('/pharmacy/queue', pharmacyQueueResponseSchema),
    staleTime: 0,
    refetchInterval: 30_000,
  })
}

/**
 * One prescription, drugs and allergies only (task 6.9, R6). Fetched when a queue row is
 * opened; the server returns nothing else clinical, so nothing else can be shown.
 */
export function usePharmacyPrescription(prescriptionId: string | null) {
  return useQuery({
    queryKey: ['pharmacy', 'prescription', prescriptionId],
    queryFn: () => apiGet(`/pharmacy/prescriptions/${prescriptionId}`, pharmacyPrescriptionSchema),
    enabled: !!prescriptionId,
    staleTime: 30_000,
  })
}
