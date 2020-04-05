import { Endpoint } from '~/backend/endpoint';

const UnreadCountEndpoint: Endpoint = {
	path: '/messages/unread-count',

	execute() {
		return {
			ok: 1,
			count: 0,
		};
	},
};

export default [ UnreadCountEndpoint ];
