import badge from './badge';
import messages from './messages';
import './auth';
import './code';
import './profile';
import './stats';
import './world';
import { hooks } from 'xxscreeps/backend';

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
