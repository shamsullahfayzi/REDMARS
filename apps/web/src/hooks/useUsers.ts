import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  userListResponseSchema,
  userSummarySchema,
  type CreateUserRequest,
  type UserListResponse,
} from '@redmars/shared'
import { apiGet, apiPatch, apiPost } from '@/lib/api'

const USERS_KEY = ['users']

/** The staff list. Admin-only server-side; a non-admin call comes back 403 and surfaces as an error. */
export function useUsers() {
  return useQuery<UserListResponse>({
    queryKey: USERS_KEY,
    queryFn: () => apiGet('/users', userListResponseSchema),
  })
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateUserRequest) => apiPost('/users', input, userSummarySchema),
    // Refetch the list rather than patching it by hand: the server is the source
    // of truth for what a new account looks like (roles resolved, timestamps set).
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  })
}

export function useSetUserActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; isActive: boolean }) =>
      apiPatch(`/users/${vars.id}/active`, { isActive: vars.isActive }, userSummarySchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  })
}
