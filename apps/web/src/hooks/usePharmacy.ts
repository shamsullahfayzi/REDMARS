import { useMutation, useQuery } from '@tanstack/react-query'
import {
  type BillPrescriptionRequest,
  confirmHandoverResponseSchema,
  dispenseResponseSchema,
  pharmacyPrescriptionSchema,
  pharmacyPrescriptionSearchResponseSchema,
  pharmacyQueueResponseSchema,
  type ReturnMedicineRequest,
  returnMedicineResponseSchema,
} from '@redmars/shared'
import { apiGet, apiPost } from '@/lib/api'
import { queryClient } from '@/lib/queryClient'

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

/**
 * The pharmacist's own patient finder — a prescription by MRN, name or phone, not the
 * whole patient register (`patient.search` is not theirs since 6b.9). Every status is
 * searchable, so a dispensed sheet a patient is returning for is still findable.
 */
export function usePharmacySearch(q: string) {
  const term = q.trim()
  return useQuery({
    queryKey: ['pharmacy', 'search', term],
    queryFn: () =>
      apiGet(
        `/pharmacy/prescriptions?q=${encodeURIComponent(term)}`,
        pharmacyPrescriptionSearchResponseSchema,
      ),
    enabled: term.length >= 2,
    staleTime: 0,
  })
}

/**
 * Task 6.10, step one — bill a prescription at whatever the pharmacist typed for each line
 * (`PharmacyDrugLine.suggestedUnitPrice` is only ever a pre-fill from the formulary; the
 * amount that actually lands on the invoice is this request's own `unitPrice`, per item).
 * The sheet STAYS on the queue — billing alone does not hand anything over — but the new
 * bill needs to show up wherever unpaid invoices are read from, which is why this
 * invalidates the same caches `useConfirmHandover` and every other billing mutation in this
 * app does: the register, and Collections, where reception will find it next.
 */
export function useBillPrescription() {
  return useMutation({
    mutationFn: ({
      prescriptionId,
      body,
    }: {
      prescriptionId: string
      body: BillPrescriptionRequest
    }) => apiPost(`/pharmacy/prescriptions/${prescriptionId}/bill`, body, dispenseResponseSchema),
    onSuccess: (_data, { prescriptionId }) => {
      void queryClient.invalidateQueries({ queryKey: ['pharmacy', 'prescription', prescriptionId] })
      void queryClient.invalidateQueries({ queryKey: ['invoices'] })
      void queryClient.invalidateQueries({ queryKey: ['collections'] })
    },
  })
}

/**
 * Task 6.10, step two — the actual handover, once the bill above is fully paid (reception
 * collects it; see PharmacyPage.tsx). This is the action that finally takes the sheet off
 * the queue, so — unlike billing — it invalidates the queue itself.
 */
export function useConfirmHandover() {
  return useMutation({
    mutationFn: (prescriptionId: string) =>
      apiPost(`/pharmacy/prescriptions/${prescriptionId}/handover`, {}, confirmHandoverResponseSchema),
    onSuccess: (_data, prescriptionId) => {
      void queryClient.invalidateQueries({ queryKey: ['pharmacy', 'queue'] })
      void queryClient.invalidateQueries({ queryKey: ['pharmacy', 'prescription', prescriptionId] })
    },
  })
}

/**
 * Return dispensed medicine (task 6.11, Rule R5) — the box comes back, the money goes back.
 * Cancels the pharmacy bill and reverses its payments, so the register and the invoice caches
 * drop with it.
 */
export function useReturnMedicine(prescriptionId: string) {
  return useMutation({
    mutationFn: (input: ReturnMedicineRequest) =>
      apiPost(`/pharmacy/prescriptions/${prescriptionId}/return`, input, returnMedicineResponseSchema),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['invoices'] })
      void queryClient.invalidateQueries({ queryKey: ['invoice'] })
      void queryClient.invalidateQueries({ queryKey: ['visit-bills'] })
    },
  })
}
