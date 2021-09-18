import type { SubscriptionEndpoint } from '../socket';
import Fn from 'xxscreeps/utility/functional';
import * as Code from 'xxscreeps/engine/db/user/code';

const CodeSubscription: SubscriptionEndpoint = {
	pattern: /^user:[^/]+\/code$/,

	async subscribe() {
		if (!this.user) {
			return () => {};
		}
		return Code.getUserCodeChannel(this.context.db, this.user).listen(message => {
			if (message.type === 'update') {
				(async() => {
					const modules = await Code.loadContent(this.context.db, this.user!, message.branch);
					if (modules) {
						this.send(JSON.stringify({
							branch: message.branch,
							modules: Fn.fromEntries(modules),
						}));
					}
				})().catch(console.error);
			}
		});
	},
};

const SetActiveBranchSubscription: SubscriptionEndpoint = {
	pattern: /^user:[^/]+\/set-active-branch$/,

	subscribe() {
		if (!this.user) {
			return () => {};
		}
		return Code.getUserCodeChannel(this.context.db, this.user).listen(message => {
			if (message.type === 'switch') {
				this.send(JSON.stringify({ activeName: 'activeWorld', branch: message.branch }));
			}
		});
	},
};

export const CodeSubscriptions = [ CodeSubscription, SetActiveBranchSubscription ];
