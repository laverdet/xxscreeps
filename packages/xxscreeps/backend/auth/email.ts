import { config } from 'xxscreeps/config/index.js';
import { checkSignedToken } from './token.js';

// Route which confirms an address; also the path baked into the link mailed to the user.
export const emailVerifyPath = '/api/auth/email/verify';

// Distinguishes these from login tokens, which share the signing key.
const kPurpose = 'email-verify';

// The token binds the exact address as well as the user, so a link only ever confirms what it was
// minted for, and never a later address the user has since asked for. `userId` never contains the
// separator, so the address is whatever follows it.
const kSeparator = ':';

export function validateEmail(email: string) {
	return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email);
}

/** Whether an address given to the backend is parked until the user proves the inbox is theirs. */
export function holdsPendingEmail() {
	return config.backend.autoVerifyEmail === false;
}

/** Read back the user and address a confirmation link was minted for, or `undefined`. */
export async function checkEmailVerificationToken(token: string) {
	const payload = await checkSignedToken(kPurpose, token);
	if (payload === undefined) {
		return;
	}
	const separator = payload.indexOf(kSeparator);
	if (separator === -1) {
		return;
	}
	return {
		userId: payload.slice(0, separator),
		email: payload.slice(separator + 1),
	};
}
