import * as User from 'xxscreeps/engine/db/user/index.js';
import { hooks } from 'xxscreeps/backend/index.js';
import config from 'xxscreeps/config/index.js';
const { allowGuestAccess } = config.backend;
const sendUserInfo = hooks.makeMapped('sendUserInfo');

hooks.register('route', {
	path: '/api/auth/me',

	async execute(context) {
		await context.flushToken(true);
		if (context.state.providerId) {
			// Authenticated with provider, registration not complete
			return { ok: 1, _id: context.state.userId };

		} else if (context.state.userId) {
			// Real user
			const { userId } = context.state;
			const info = {};
			const [ user ] = await Promise.all([
				context.db.data.hmget(User.infoKey(userId), [ 'badge', 'username' ]),
				User.findProvidersForUser(context.db, userId),
				Promise.all(sendUserInfo(context.db, userId, info, true)),
			]);
			return Object.assign(info, {
				ok: 1,
				_id: userId,
				cpu: 100,
				username: user.username,
				badge: user.badge ? JSON.parse(user.badge) : undefined,
			});

		} else if (allowGuestAccess) {
			// Guest profile
			return {
				ok: 1,
				_id: 'guest',
				cpu: 100,
				username: 'Guest',
				email: 'nobody@example.com',
				badge: {
					type: {
						path1: 'm 60.493413,13.745781 -1.122536,7.527255 -23.302365,-6.118884 -24.097204,26.333431 6.412507,0.949878 -5.161481,19.706217 26.301441,24.114728 1.116562,-7.546193 23.350173,6.122868 24.097202,-26.318478 -6.462307,-0.95785 5.16845,-19.699243 z m -1.58271,10.611118 -0.270923,1.821013 C 57.330986,25.69819 55.969864,25.331543 54.570958,25.072546 Z m -8.952409,4.554029 c 11.653612,0 21.055294,9.408134 21.055294,21.069735 0,11.661603 -9.401682,21.068738 -21.055294,21.068738 -11.65361,0 -21.055297,-9.407135 -21.055297,-21.068738 0,-11.661601 9.401687,-21.069735 21.055297,-21.069735 z M 26.634018,40.123069 c -0.262324,0.618965 -0.494865,1.252967 -0.708185,1.895768 l -0.0508,-0.104656 -0.194228,-0.417627 c 0.261245,-0.385697 0.631962,-0.909531 0.953211,-1.373485 z m 47.391601,17.714764 0.115539,0.237219 0.214148,0.462479 c -0.380159,0.55986 -0.886342,1.281124 -1.3835,1.988466 0.400298,-0.870957 0.752837,-1.767746 1.053813,-2.688164 z M 41.364458,73.812322 c 0.694434,0.251619 1.40261,0.471895 2.123558,0.662817 l -2.303841,0.558165 z',
						path2: 'm 60.857962,24.035953 -6.397566,1.055531 c 6.084137,1.084905 11.78633,4.394548 15.786244,9.746957 5.741405,7.682749 6.465607,17.544704 2.736121,25.67958 1.511089,-2.147013 2.622575,-3.851337 2.622575,-3.851337 l 1.628526,0.241209 c 0.726895,-2.869027 1.004942,-5.843252 0.811775,-8.806053 l 1.185288,-8.634615 -3.768025,-3.072898 -2.908435,-3.21842 c -0.0103,-0.01383 -0.01958,-0.02805 -0.02988,-0.04186 -3.118009,-4.172293 -7.17889,-7.228662 -11.666624,-9.098091 z M 50.001124,37.965163 A 12.020784,12.029027 0 0 0 37.979913,49.994617 12.020784,12.029027 0 0 0 50.001124,62.024074 12.020784,12.029027 0 0 0 62.022337,49.994617 12.020784,12.029027 0 0 0 50.001124,37.965163 Z M 27.019485,39.55693 c -1.481686,2.114179 -2.5658,3.779575 -2.5658,3.779575 l -1.647451,-0.244197 c -0.69707,2.775045 -0.977606,5.64628 -0.81476,8.511019 l -1.22015,8.890775 3.768021,3.072896 3.422394,3.786551 c 2.921501,3.715734 6.608397,6.499915 10.668588,8.29872 l 5.050921,-1.223973 C 38.324728,73.038607 33.383805,69.887984 29.806406,65.100956 28.655972,63.561522 27.71377,61.932905 26.961715,60.249903 L 24.8272,48.359991 c 0.194234,-3.030146 0.935183,-6.015406 2.192285,-8.803061 z',
					},
					color1: '#735252',
					color2: '#390305',
					color3: '#ff0d39',
					flip: false,
				},
			};
		}
	},
});

hooks.register('route', {
	path: '/api/user/find',

	async execute(context) {
		const userId = await User.findUserByName(context.db, String(context.query.username));
		if (userId) {
			const info = {};
			const [ user ] = await Promise.all([
				context.db.data.hmget(User.infoKey(userId), [ 'badge', 'username' ]),
				Promise.all(sendUserInfo(context.db, userId, info, false)),
			]);
			return {
				ok: 1,
				user: Object.assign(info, {
					_id: userId,
					username: user.username,
					badge: user.badge ? JSON.parse(user.badge) : undefined,
				}),
			};
		}
	},
});
