import badge from './badge';
import me from './me';
import messages from './messages';
import world from './world';
import './code';
import { hooks } from 'xxscreeps/backend';

export default [ ...badge, ...me, ...messages, ...world ];

hooks.register('route', {
	path: '/api/user/decorations/themes',
	execute() {
		return {
			ok: 1,
			list: [],
		};
	},
});
