import type { CheckInResponse } from '@redmars/shared'
import { InvoiceReceipt } from '@/components/InvoiceReceipt'

/**
 * The bill handed over at check-in (task 3.6). The layout now lives in InvoiceReceipt, so
 * this slip and the invoice reprint (task 6.1) are the same paper — a field can no longer
 * drift between "the bill you were given" and "the bill you get again".
 *
 * The receipt date is the visit's start: on a fresh check-in that is when the patient
 * arrived, which is what the desk's bill has always shown.
 */
export function CheckInReceipt({ result }: { result: CheckInResponse }) {
  return (
    <InvoiceReceipt
      facility={result.facility}
      patient={result.patient}
      visit={result.visit}
      invoice={result.invoice}
      receiptDate={result.visit.startedAt}
    />
  )
}
