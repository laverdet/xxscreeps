import { connect, create, ResponderClient, ResponderHost } from './responder';

export abstract class Queue<Type> {
	disconnect!: () => void;
	abstract pop(): Promise<Type | undefined>;
	abstract push(entries: Type[]): Promise<void>;
	abstract version(version: any): void;
	protected currentVersion: any;

	static connect<Type = string>(name: string): Promise<Queue<Type>> {
		return connect(name, QueueClient, QueueHost);
	}

	static create<Type = string>(name: string): Promise<Queue<Type>> {
		return Promise.resolve(create(name, QueueHost));
	}

	request(method: string, payload?: any): any {
		if (payload.version !== this.currentVersion) {
			return Promise.resolve();
		}
		if (method === 'pop') {
			return this.pop();
		} else if (method === 'push') {
			return this.push(payload);
		} else {
			return Promise.reject(new Error(`Unknown method: ${method}`));
		}
	}

	async *[Symbol.asyncIterator]() {
		for (
			let value = await this.pop();
			value !== undefined;
			value = await this.pop()
		) {
			yield value;
		}
	}
}

const QueueHost = ResponderHost(class QueueHost extends Queue<any> {
	readonly queue: any[] = [];

	pop() {
		return Promise.resolve(this.queue.shift());
	}

	push(entries: any[]) {
		this.queue.push(...entries);
		return Promise.resolve();
	}

	version(version: any) {
		if (this.currentVersion !== version) {
			this.currentVersion = version;
			this.queue.splice(0, this.queue.length);
		}
	}
});

const QueueClient = ResponderClient(class QueueClient extends Queue<any> {
	pop(): Promise<any> {
		return this.request('pop', { version: this.currentVersion });
	}

	push(entries: any[]): Promise<void> {
		return this.request('push', { version: this.currentVersion, entries });
	}

	version(version: any) {
		this.currentVersion = version;
	}
});
