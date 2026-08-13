import { checkEmailVerificationToken, emailVerifyPath } from 'xxscreeps/backend/auth/email.js';
import { hooks } from 'xxscreeps/backend/index.js';
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
