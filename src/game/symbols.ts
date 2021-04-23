import type { Game } from '.';
export const gameInitializers: ((game: Game) => void)[] = [];
export const globals: Record<string, any> = Object.create(null);

export function registerGlobal(name: string, value: any): void;
export function registerGlobal(fn: Function): void;
export function registerGlobal(...args: [ string, any ] | [ Function ]) {
	const { name, value } = args.length === 1 ?
		{ name: args[0].name, value: args[0] } :
		{ name: args[0], value: args[1] };
	globals[name] = value;
}
