import { config } from 'xxscreeps/config/index.js';

export function validateEmail(email: string) {
	return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email);
}

/** Whether an address given to the backend is parked until the user proves the inbox is theirs. */
export function holdsPendingEmail() {
	return config.backend.autoVerifyEmail === false;
}
