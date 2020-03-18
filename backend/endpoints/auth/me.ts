import { Endpoint } from '~/backend/endpoint';

export const MeEndpoint: Endpoint = {
	method: 'get',
	path: '/me',

	execute() {
		return {
			ok: 1,
			_id: '123',
			email: 'webmaster@example.com',
			username: 'The_General',
			password: true,
			cpu: 100,
			gcl: 1,
			money: 0,
			power: 0,
			badge: {
				type: 15,
				color1: 67,
				color2: 26,
				color3: 67,
				param: 100,
				flip: true,
			},
			lastChargeTime: 0,
			lastRespawnDate: 0,
			blocked: false,
			steam: {
				id: '123',
			},
			notifyPrefs: {
				disabled: true,
				disabledOnMessages: true,
				errorsInterval: 100000,
				sendOnline: true,
			},
			powerExperimentations: 30,
			powerExperimentationTime: 0,
		};
	},
};
