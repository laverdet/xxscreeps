import { bindMapRenderer, bindRenderer, bindTerrainRenderer } from 'xxscreeps/backend/index.js';
import { Deposit } from './deposit.js';

bindMapRenderer(Deposit, () => 'd');
bindTerrainRenderer(Deposit, () => 0x777777);

bindRenderer(Deposit, (deposit, next) => ({
	...next(),
	cooldownTime: deposit['#cooldownTime'],
	depositType: deposit.depositType,
	lastCooldown: deposit.lastCooldown,
	nextDecayTime: deposit['#nextDecayTime'],
}));
