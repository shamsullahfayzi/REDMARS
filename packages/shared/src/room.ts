import { z } from 'zod'

/**
 * Room contract (task 2.1) — the child of Department. A room belongs to exactly
 * one department (departmentId) and, like a department, carries a per-facility
 * unique code. No local names: the Room model has none.
 */

export const roomSummarySchema = z.object({
  id: z.uuid(),
  departmentId: z.uuid(),
  code: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
})
export type RoomSummary = z.infer<typeof roomSummarySchema>

export const roomListResponseSchema = z.object({
  rooms: z.array(roomSummarySchema),
})
export type RoomListResponse = z.infer<typeof roomListResponseSchema>

export const createRoomRequestSchema = z.object({
  // The parent. Validated server-side against a department in the caller's
  // facility, so a room can never be hung off another tenant's department.
  departmentId: z.uuid(),
  code: z.string().trim().min(1, 'Code is required').max(20),
  name: z.string().trim().min(2, 'Room name is required').max(80),
})
export type CreateRoomRequest = z.infer<typeof createRoomRequestSchema>
