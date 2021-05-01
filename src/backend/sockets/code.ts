import type { SubscriptionEndpoint } from '../socket';
import { getRunnerUserChannel } from 'xxscreeps/engine/runner/channel';
// import * as Fn from 'xxscreeps/utility/functional';

/*
const CodeSubscription: SubscriptionEndpoint = {
	pattern: /^user:[^/]+\/code$/,

	async subscribe() {
		const channel = await Channel.connect<Code.Message>(`code/${this.user}`);
		return channel.listen(message => {
			 (async() => {
				if (message.type === 'branch') {
					const code = Code.read(await this.context.persistence.load(`user/${this.user}/${message.id}`));
					this.send(JSON.stringify({
						branch: message.name,
						modules: Fn.fromEntries(code.modules),
						timestamp: Date.now(),
					}));
				}
			})().catch(console.error);
		});
	},
};
*/

const SetActiveBranchSubscription: SubscriptionEndpoint = {
	pattern: /^user:[^/]+\/set-active-branch$/,

	subscribe() {
		if (!this.user) {
			return () => {};
		}
		return getRunnerUserChannel(this.context.shard, this.user).listen(message => {
			if (message.type === 'code') {
				this.send(JSON.stringify({ activeName: 'activeWorld', branch: message.name }));
			}
		});
	},
};

export const CodeSubscriptions = [ /*CodeSubscription,*/ SetActiveBranchSubscription ];
