// For when a plain promise is just too unwieldy
export class Deferred<Type = void> {
	promise: Promise<Type>;
	resolve!: (payload: Type) => void;
	reject!: (error: Error) => void;
	constructor() {
		this.promise = new Promise<Type>((resolve, reject) => {
			this.resolve = resolve;
			this.reject = reject;
		});
	}
}
