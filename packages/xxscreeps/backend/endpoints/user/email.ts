import type { JSONSchemaType } from 'ajv';
import { checkEmailVerificationToken, emailVerifyPath, holdsPendingEmail, sendPendingEmailVerification, setAndVerifyEmail, validateEmail } from 'xxscreeps/backend/auth/email.js';
import { hooks, makeValidatedPayloadRoute } from 'xxscreeps/backend/index.js';
import { mailer } from 'xxscreeps/backend/mail.js';
import { config } from 'xxscreeps/config/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';

// Report the outcome as a query parameter, ahead of any fragment: the client routes on the hash, so
// a destination like `/#!/account` has to keep its fragment last.
function redirectTarget(verified: boolean) {
	const base = config.backend.emailVerifyRedirect ?? '/';
	const hash = base.indexOf('#');
	const [ path, fragment ] = hash === -1 ? [ base, '' ] : [ base.slice(0, hash), base.slice(hash) ];
	return `${path}${path.includes('?') ? '&' : '?'}emailVerified=${verified ? 1 : 0}${fragment}`;
}

// The target of the confirmation link mailed to the user. A human opens this in a browser, so every
// outcome — a good link, a forged or expired one, a superseded address — ends in a redirect rather
// than an error payload; the destination reads `emailVerified` to tell the user what happened.
hooks.register('route', {
	path: emailVerifyPath,

	async execute(context) {
		const { token } = context.request.query;
		const link = typeof token === 'string' ? await checkEmailVerificationToken(token) : undefined;
		const verified = link !== undefined &&
			await User.verifyPendingEmail(context.db, link.userId, link.email);
		context.redirect(redirectTarget(verified));
		return true;
	},
});

interface SetEmailRequest {
	email: string;
}

const setEmailRequestSchema: JSONSchemaType<SetEmailRequest> = {
	type: 'object',
	properties: {
		email: { type: 'string' },
	},
	required: [ 'email' ],
};

// Change (or set) the logged-in user's email address. Per `backend.autoVerifyEmail` the address is
// either confirmed immediately or held pending — `pending` in the response tells the client which.
// Any previously-confirmed address stays active until a pending one is confirmed.
hooks.register('route', {
	method: 'post',
	path: '/api/user/email',

	execute: makeValidatedPayloadRoute(setEmailRequestSchema, async context => {
		const { userId } = context.state;
		if (userId === undefined) {
			return { error: 'not authenticated' };
		}
		const { email } = context.request.body;
		if (!validateEmail(email)) {
			return { error: 'invalid' };
		}
		const owner = await User.findUserByProvider(context.db, 'email', email);
		if (owner !== null && owner !== userId) {
			return { error: 'exists' };
		}
		const { pending, refusal } = await setAndVerifyEmail(context.db, userId, email);
		return { ok: 1, pending, ...refusal !== undefined && { error: refusal.reason } };
	}),
});

// Ask for the confirmation mail again — one can be lost, junked, or simply expire, and without this
// the only way out of a pending address is setting it all over again.
hooks.register('route', {
	method: 'post',
	path: '/api/user/email/resend',

	async execute(context) {
		const { userId } = context.state;
		if (userId === undefined) {
			return { error: 'not authenticated' };
		}
		if (await User.pendingEmailForUser(context.db, userId) === null) {
			// Nothing to confirm: no address at all, or it is confirmed already.
			return { ok: 1, pending: false };
		}
		const refusal = await sendPendingEmailVerification(context.db, userId);
		if (refusal !== undefined) {
			// A mailer declining is the user's answer, not an error of ours: it carries why, and when
			// to come back if that is only for now.
			return { error: refusal.reason, ...refusal.retryInSeconds !== undefined && { retryInSeconds: refusal.retryInSeconds } };
		}
		return { ok: 1, pending: true };
	},
});

// Holding addresses pending is a promise that someone will ask the user to confirm them, and the
// backend can't keep it alone. Say so once rather than leaving registrations quietly stranded.
hooks.register('backendReady', () => {
	if (holdsPendingEmail()) {
		if (!mailer.registered) {
			console.error('`backend.autoVerifyEmail` is off but no mod delivers mail — addresses will be held pending with no confirmation link to open');
		}
		if (config.backend.publicUrl === undefined) {
			console.error('`backend.autoVerifyEmail` is off but `backend.publicUrl` is not set — there is no address to root a confirmation link at');
		}
	}
});
