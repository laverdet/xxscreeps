import { bindMapRenderer, bindRenderer, bindTerrainRenderer } from 'xxscreeps/backend/index.js';
import { Deposit } from './deposit.js';

bindMapRenderer(Deposit, () => 'd');
bindTerrainRenderer(Deposit, () => 0x777777);

bindRenderer(Deposit, (deposit, next) => ({
	...next(),
	cooldown: deposit.cooldown,
	depositType: deposit.depositType,
	lastCooldown: deposit.lastCooldown,
	nextDecayTime: deposit['#nextDecayTime'],
}));
