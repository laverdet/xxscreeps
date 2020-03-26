import { Creep } from '~/engine/game/objects/creep';
import * as Store from './store';
import { bindRenderer } from '.';

export default function() {
	bindRenderer(Creep, function render() {
		return {
			_id: this.id,
			type: 'creep',
			x: this.pos.x,
			y: this.pos.y,
			name: this.name,
			body: this.body,
			...Store.render.call(this.store),
			user: '123',
			hits: this.hits,
			hitsMax: 100,
			spawning: false,
			fatigue: 0,
			ageTime: 0,
			actionLog: {
				attacked: null,
				healed: null,
				attack: null,
				rangedAttack: null,
				rangedMassAttack: null,
				rangedHeal: null,
				harvest: null,
				heal: null,
				repair: null,
				build: null,
				say: null,
				upgradeController: null,
				reserveController: null,
			},
			meta: {
				revision: Math.random() * 0xffff | 0,
				updated: Date.now(),
			},
		};
	});
}
