import badge from './badge.js';
import messages from './messages.js';
import './auth.js';
import './code.js';
import './profile.js';
import './stats.js';
import './world.js';
import { hooks } from 'xxscreeps/backend/index.js';

export default [ ...badge, ...messages ];

hooks.register('route', {
	path: '/api/user/decorations/themes',
	execute() {
		return {
			ok: 1,
			list: [],
		};
	},
});
