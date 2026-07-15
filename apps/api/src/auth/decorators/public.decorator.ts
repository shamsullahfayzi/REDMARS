import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'redmars:isPublic';

/**
 * Marks a route reachable without a token.
 *
 * The guards are global, so every route is protected unless it says otherwise.
 * That is the right default — a new endpoint is born locked, and opening it is
 * a visible line in a diff rather than an omission nobody spots.
 *
 * There should be very few of these. Today: login (you cannot present a token
 * before you have one) and health (the thing that checks whether we are up
 * cannot depend on us being up enough to authenticate it).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
