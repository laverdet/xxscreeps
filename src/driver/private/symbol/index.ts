export const isPrivate = false as boolean;

export function makeSymbol(name?: string) {
	// By default this provides no privacy. `isolated-vm.ts` is used instead to create private
	// symbols.
	return Symbol(name);
}
