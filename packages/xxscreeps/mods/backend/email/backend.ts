import type { JSONSchemaType } from 'ajv';
import { hooks, makeValidatedPayloadRoute, makeValidatedQueryRoute } from 'xxscreeps/backend/index.js';
import { config } from 'xxscreeps/config/index.js';
import { checkEmail, emailForUser, findUserByEmail } from 'xxscreeps/engine/db/user/index.js';
import { mailer } from './mail.js';
import { pendingEmailForUser } from './model.js';
import { confirmEmailVerificationLink, emailVerifyPath, holdsPendingEmail, sendPendingEmailVerification, setAndVerifyEmail } from './verify.js';

interface EmailRequest {
	email: string;
}

const emailRequestSchema: JSONSchemaType<EmailRequest> = {
	type: 'object',
	properties: {
		email: { type: 'string' },
	},
	required: [ 'email' ],
};

// Tells the registration form whether an address is free before it is submitted
hooks.register('route', {
	method: 'get',
	path: '/api/register/check-email',

	execute: makeValidatedQueryRoute(emailRequestSchema, async context => {
		const { email } = context.request.query;
		if (!checkEmail(email)) {
			return { error: 'invalid' };
		}
		if (await findUserByEmail(context.db, email) !== null) {
			return { error: 'exists' };
		}
		return { ok: 1 };
	}),
});

// Report the address back to the account which owns it, and to nobody else. An address still
// awaiting confirmation is reported in place of the confirmed one, flagged: the client shows `email`
// as the address on file and reads `emailDirty` as "not confirmed yet".
hooks.register('sendUserInfo', async (db, userId, userInfo, privateSelf) => {
	if (privateSelf) {
		const [ email, pendingEmail ] = await Promise.all([
			emailForUser(db, userId),
			pendingEmailForUser(db, userId),
		]);
		if (pendingEmail !== null) {
			userInfo.email = pendingEmail;
			userInfo.emailDirty = true;
		} else if (email !== null) {
			userInfo.email = email;
		}
	}
});

const verifyMessages = {
	success: 'Your email address is confirmed.',
	expired: 'This confirmation link has expired. You can ask for a new one from your account settings.',
	stale: 'This confirmation link is for an address you have since changed. Open the link in the most recent confirmation mail instead.',
	failed: 'This email address could not be confirmed.',
};

// The target of the confirmation link mailed to the user. A human opens this in a browser, so every
// outcome — a good link, a forged or expired one, a superseded address — ends on a page saying so
// rather than an error payload.
hooks.register('route', {
	path: emailVerifyPath,

	async execute(context) {
		const { token } = context.request.query;
		const outcome = await confirmEmailVerificationLink(context.db, typeof token === 'string' ? token : undefined);
		context.type = 'html';
		context.body =
			`<!doctype html>
			<html>
				<head>
					<meta charset="utf-8">
					<meta name="viewport" content="width=device-width, initial-scale=1">
					<title>Email confirmation</title>
					<style>:root{background:#131520;color:#ccc;font-family:sans-serif}body{max-width:32em;margin:4em auto;padding:0 1em}a{color:#8af}</style>
				</head>
				<body>
					<p>${verifyMessages[outcome]}</p>
					<p><a href="/">Continue to the game</a></p>
				</body>
			</html>`;
		return true;
	},
});

// Change (or set) the logged-in user's email address. Per `email.autoVerify` the address is
// either confirmed immediately or held pending — `pending` in the response tells the client which.
// Any previously-confirmed address stays active until a pending one is confirmed.
hooks.register('route', {
	method: 'post',
	path: '/api/user/email',

	execute: makeValidatedPayloadRoute(emailRequestSchema, async context => {
		const { userId } = context.state;
		if (userId === undefined) {
			return { error: 'not authenticated' };
		}
		const { email } = context.request.body;
		if (!checkEmail(email)) {
			return { error: 'invalid' };
		}
		const owner = await findUserByEmail(context.db, email);
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
		if (await pendingEmailForUser(context.db, userId) === null) {
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
			console.error('`email.autoVerify` is off but no mod delivers mail — addresses will be held pending with no confirmation link to open');
		}
		if (config.backend.publicUrl === undefined) {
			console.error('`email.autoVerify` is off but `backend.publicUrl` is not set — there is no address to root a confirmation link at');
		}
	}
});
