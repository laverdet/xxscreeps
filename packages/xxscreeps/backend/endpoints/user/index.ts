import { hooks } from 'xxscreeps/backend/index.js';
import badge from './badge.js';
import messages from './messages.js';
import './auth.js';
import './code.js';
import './profile.js';
import './stats.js';
import './world.js';

const endpoints = [ ...badge, ...messages ];
export default endpoints;

hooks.register('route', {
	path: '/api/user/decorations/themes',
	execute() {
		return {
			ok: 1,
			list: [],
		};
	},
});
