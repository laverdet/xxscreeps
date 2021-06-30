import badge from './badge';
import messages from './messages';
import world from './world';
import './auth';
import './code';
import './me';
import './profile';
import { hooks } from 'xxscreeps/backend';

export default [ ...badge, ...messages, ...world ];

hooks.register('route', {
	path: '/api/user/decorations/themes',
	execute() {
		return {
			ok: 1,
			list: [],
		};
	},
});
