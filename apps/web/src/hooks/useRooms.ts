import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  roomListResponseSchema,
  roomSummarySchema,
  type CreateRoomRequest,
  type RoomListResponse,
} from '@redmars/shared'
import { apiGet, apiPatch, apiPost } from '@/lib/api'

const ROOMS_KEY = ['rooms']

/** Every room in the facility, active and inactive. The page groups them by department. Admin-only server-side. */
export function useRooms() {
  return useQuery<RoomListResponse>({
    queryKey: ROOMS_KEY,
    queryFn: () => apiGet('/rooms', roomListResponseSchema),
  })
}

export function useCreateRoom() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateRoomRequest) => apiPost('/rooms', input, roomSummarySchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ROOMS_KEY }),
  })
}

export function useSetRoomActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; isActive: boolean }) =>
      apiPatch(`/rooms/${vars.id}/active`, { isActive: vars.isActive }, roomSummarySchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ROOMS_KEY }),
  })
}
