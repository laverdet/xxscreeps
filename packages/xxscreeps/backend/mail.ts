import type { MaybePromise } from 'xxscreeps/utility/types.js';
import { makeProviderRegistration } from 'xxscreeps/utility/hook.js';

/** A mail the backend wants delivered, rendered and ready to send. */
export interface EmailMessage {
	to: string;
	subject: string;
	text: string;
	html?: string;
}

/** Why a mailer declined to send, e.g. an address it rate-limits or refuses outright. */
export interface MailRefusal {
	reason: string;
	/** When the caller may try again, for a refusal which is only temporary. */
	retryInSeconds?: number;
}

export interface Mailer {
	/**
	 * Deliver `message`. Return nothing once it is on its way, or a refusal to report that it was
	 * deliberately not sent — which is not a failure and reaches the user as an explanation. Throwing
	 * is for delivery actually breaking.
	 */
	send: (message: EmailMessage) => MaybePromise<MailRefusal | undefined>;
}

/**
 * How mail leaves the server. There is deliberately room for exactly one implementation — SMTP or a
 * provider's API, not both at once — so two mods fighting over delivery fail loudly instead of
 * quietly mailing everything twice. With none registered every message is refused, which is what
 * lets a caller say so rather than pretend it sent something.
 */
export const mailer = makeProviderRegistration<Mailer>('mail', {
	send: () => ({ reason: 'no mailer' }),
});
