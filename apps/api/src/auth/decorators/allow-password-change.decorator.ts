import { SetMetadata } from '@nestjs/common';

export const ALLOW_PASSWORD_CHANGE_KEY = 'allowPasswordChangeRequired';
/** Only identity and password-change endpoints may run with a temporary password. */
export const AllowPasswordChange = () => SetMetadata(ALLOW_PASSWORD_CHANGE_KEY, true);
