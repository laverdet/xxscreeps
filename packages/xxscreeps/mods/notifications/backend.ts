import type { JSONSchemaType } from 'ajv';
import type { NotifyPrefs } from './prefs.js';
import { hooks, makeValidatedPayloadRoute } from 'xxscreeps/backend/index.js';
import { getNotifyPrefs, setNotifyPrefs } from './prefs.js';

// Mirrors the allowed values from the original screeps-server `/api/user/notify-prefs` handler.
// Out-of-range values are silently ignored rather than rejected, matching vanilla behavior.
const kIntervalValues = new Set([ 5, 10, 30, 60, 180, 360, 720, 1440, 4320 ]);
const kErrorsIntervalValues = new Set([ 0, 5, 10, 30, 60, 180, 360, 720, 1440, 4320, 100000 ]);

interface NotifyPrefsRequest {
	disabled?: boolean | null;
	disabledOnMessages?: boolean | null;
	sendOnline?: boolean | null;
	interval?: number | null;
	errorsInterval?: number | null;
}

// Note: unlike vanilla (which coerces with `!!`, so a string "false" becomes true), these are
// validated as real JSON booleans. A client sending strings will get `{ error: 'invalid' }`.
const notifyPrefsRequestSchema: JSONSchemaType<NotifyPrefsRequest> = {
	type: 'object',
	properties: {
		disabled: { type: 'boolean', nullable: true },
		disabledOnMessages: { type: 'boolean', nullable: true },
		sendOnline: { type: 'boolean', nullable: true },
		interval: { type: 'number', nullable: true },
		errorsInterval: { type: 'number', nullable: true },
	},
	additionalProperties: false,
};

hooks.register('route', {
	path: '/api/user/notify-prefs',
	method: 'post',

	execute: makeValidatedPayloadRoute(notifyPrefsRequestSchema, async context => {
		const { userId } = context.state;
		if (userId == null) {
			return;
		}

		const body = context.request.body;
		const prefs: Partial<NotifyPrefs> = {};
		if (body.disabled != null) {
			prefs.disabled = body.disabled;
		}
		if (body.disabledOnMessages != null) {
			prefs.disabledOnMessages = body.disabledOnMessages;
		}
		if (body.sendOnline != null) {
			prefs.sendOnline = body.sendOnline;
		}
		// Invalid interval values are silently ignored, as in the original server.
		if (body.interval != null && kIntervalValues.has(body.interval)) {
			prefs.interval = body.interval;
		}
		if (body.errorsInterval != null && kErrorsIntervalValues.has(body.errorsInterval)) {
			prefs.errorsInterval = body.errorsInterval;
		}

		await setNotifyPrefs(context.db, userId, prefs);
		return { ok: 1 };
	}),
});

// Surface the user's own notification prefs on `/api/auth/me` so the account UI can render the
// current toggle/interval state. The client reads `Me.notifyPrefs.*` to decide what to flip.
hooks.register('sendUserInfo', async (db, userId, userInfo, privateSelf) => {
	if (privateSelf) {
		userInfo.notifyPrefs = await getNotifyPrefs(db, userId);
	}
});
