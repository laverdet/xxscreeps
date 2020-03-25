import { Endpoint } from '~/backend/endpoint';

export const CheckEmailEndpoint: Endpoint = {
	method: 'get',
	path: '/check-email',

	execute() {
		return { ok: 1 };
	},
};

export const CheckUsernameEndpoint: Endpoint = {
	method: 'get',
	path: '/check-username',

	execute() {
		return { ok: 1 };
	},
};

export const SubmitRegistrationEndpoint: Endpoint = {
	method: 'post',
	path: '/submit',

	execute() {
		return { ok: 1 };
	},
};
