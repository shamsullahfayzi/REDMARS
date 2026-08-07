import { useQuery } from '@tanstack/react-query'
import {
  auditLogResponseSchema,
  censusReportResponseSchema,
  diagnosisReportResponseSchema,
  errorLogResponseSchema,
  revenueReportResponseSchema,
  waitTimeReportResponseSchema,
} from '@redmars/shared'
import { apiGet } from '@/lib/api'

/** The from/to/department/practitioner filter every report tab shares (task 6c). */
export interface ReportRange {
  from: string
  to: string
  departmentId?: string
  /** Ignored server-side by `revenue` — a payment belongs to a till, not a doctor. */
  practitionerId?: string
}

function rangeSearch(range: ReportRange): string {
  const params = new URLSearchParams({ from: range.from, to: range.to })
  if (range.departmentId) params.set('departmentId', range.departmentId)
  if (range.practitionerId) params.set('practitionerId', range.practitionerId)
  return `?${params.toString()}`
}

export function useCensusReport(range: ReportRange, enabled: boolean) {
  return useQuery({
    queryKey: ['reports', 'census', range],
    queryFn: () => apiGet(`/reports/census${rangeSearch(range)}`, censusReportResponseSchema),
    enabled,
  })
}

export function useWaitTimeReport(range: ReportRange, enabled: boolean) {
  return useQuery({
    queryKey: ['reports', 'wait-times', range],
    queryFn: () => apiGet(`/reports/wait-times${rangeSearch(range)}`, waitTimeReportResponseSchema),
    enabled,
  })
}

export function useRevenueReport(range: ReportRange, enabled: boolean) {
  return useQuery({
    queryKey: ['reports', 'revenue', range],
    queryFn: () => apiGet(`/reports/revenue${rangeSearch(range)}`, revenueReportResponseSchema),
    enabled,
  })
}

export function useDiagnosisReport(range: ReportRange, enabled: boolean) {
  return useQuery({
    queryKey: ['reports', 'diagnoses', range],
    queryFn: () => apiGet(`/reports/diagnoses${rangeSearch(range)}`, diagnosisReportResponseSchema),
    enabled,
  })
}

export interface AuditLogFilter {
  from: string
  to: string
  userId?: string
  action?: string
  entity?: string
  page: number
}

export function useAuditLogReport(filter: AuditLogFilter, enabled: boolean) {
  return useQuery({
    queryKey: ['reports', 'audit-log', filter],
    queryFn: () => {
      const params = new URLSearchParams({
        from: filter.from,
        to: filter.to,
        page: String(filter.page),
      })
      if (filter.userId) params.set('userId', filter.userId)
      if (filter.action) params.set('action', filter.action)
      if (filter.entity) params.set('entity', filter.entity)
      return apiGet(`/reports/audit-log?${params.toString()}`, auditLogResponseSchema)
    },
    enabled,
  })
}

export interface ErrorLogFilter {
  from: string
  to: string
  statusCode?: number
  page: number
}

export function useErrorLogReport(filter: ErrorLogFilter, enabled: boolean) {
  return useQuery({
    queryKey: ['reports', 'error-log', filter],
    queryFn: () => {
      const params = new URLSearchParams({
        from: filter.from,
        to: filter.to,
        page: String(filter.page),
      })
      if (filter.statusCode) params.set('statusCode', String(filter.statusCode))
      return apiGet(`/reports/error-log?${params.toString()}`, errorLogResponseSchema)
    },
    enabled,
  })
}
