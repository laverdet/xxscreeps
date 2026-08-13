import type { MailRefusal } from 'xxscreeps/backend/mail.js';
import type { Database } from 'xxscreeps/engine/db/index.js';
import { mailer } from 'xxscreeps/backend/mail.js';
import { config } from 'xxscreeps/config/index.js';
import { pendingEmailForUser, setEmail } from 'xxscreeps/engine/db/user/index.js';
import { checkSignedToken, makeSignedToken } from './token.js';

// Route which confirms an address; also the path baked into the link mailed to the user.
export const emailVerifyPath = '/api/auth/email/verify';

// Distinguishes these from login tokens, which share the signing key.
const kPurpose = 'email-verify';
const kDefaultTtlHours = 24;

// The token binds the exact address as well as the user, so a link only ever confirms what it was
// minted for, and never a later address the user has since asked for. `userId` never contains the
// separator, so the address is whatever follows it.
const kSeparator = ':';

export function validateEmail(email: string) {
	return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email);
}

/**
 * Build the confirmation link for `email`. It is rooted at `backend.publicUrl` rather than at the
 * origin of the request which triggered the mail: that origin is the `Host` header, so a forged one
 * would have us mail a link pointing at somebody else's server.
 *
 * The link stays valid for `backend.emailVerifyTtlHours`.
 */
async function makeEmailVerificationLink(base: string, userId: string, email: string) {
	const ttl = (config.backend.emailVerifyTtlHours ?? kDefaultTtlHours) * 60 * 60;
	const token = await makeSignedToken(kPurpose, `${userId}${kSeparator}${email}`, ttl);
	return `${base.replace(/\/+$/, '')}${emailVerifyPath}?token=${encodeURIComponent(token)}`;
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

/** Whether an address given to the backend is parked until the user proves the inbox is theirs. */
export function holdsPendingEmail() {
	return config.backend.autoVerifyEmail === false;
}

/**
 * Mail `userId` the link confirming whichever address they are waiting on, if any. Returns a refusal
 * when the mail was deliberately not sent, and nothing when it is on its way or the user has nothing
 * pending — the caller which cares about that difference has already read the pending address.
 */
export async function sendPendingEmailVerification(db: Database, userId: string) {
	const email = await pendingEmailForUser(db, userId);
	if (email === null) {
		return;
	}
	const base = config.backend.publicUrl;
	if (base === undefined) {
		// Nothing to point the user at. `backendReady` says so once at startup; here it is the same
		// answer a mailer gives when it declines, since the caller has the same nothing to report.
		return { reason: 'no public url' };
	}
	const url = await makeEmailVerificationLink(base, userId, email);
	return mailer.current.send({
		to: email,
		subject: 'Confirm your email address',
		text: 'Please confirm this address by opening the link below:\n\n' +
			`${url}\n\n` +
			"If you didn't ask for this you can ignore this message.",
		html: '<p>Please confirm this address by opening the link below:</p>' +
			`<p><a href="${url}">Confirm my email address</a></p>` +
			`<p>Or paste this into your browser:<br><code>${url}</code></p>` +
			"<p>If you didn't ask for this you can ignore this message.</p>",
	});
}

/**
 * Set `email` as the user's address, holding it pending when this server confirms addresses, and
 * mail the confirmation link when it does. Reports whether the address is pending and why no mail
 * went out, if that is the case.
 */
export async function setAndVerifyEmail(db: Database, userId: string, email: string) {
	const { pending } = await setEmail(db, userId, email, holdsPendingEmail());
	const refusal = pending ? await sendPendingEmailVerification(db, userId) : undefined;
	return { pending, refusal };
}

/**
 * Log a confirmation mail which was deliberately not sent. Registration has no field to carry the
 * reason, and the user can ask for the mail again from their account page once they are in.
 */
export function reportUnsentVerification(userId: string, refusal: MailRefusal | undefined) {
	if (refusal !== undefined) {
		console.error(`Could not mail an address confirmation to user ${userId}: ${refusal.reason}`);
	}
}
