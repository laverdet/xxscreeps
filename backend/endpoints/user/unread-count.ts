import { Endpoint } from '~/backend/endpoint';

export const UnreadCountEndpoint: Endpoint = {
	path: '/messages/unread-count',

	execute() {
		return {
			ok: 1,
			count: 0,
		};
	},
};
