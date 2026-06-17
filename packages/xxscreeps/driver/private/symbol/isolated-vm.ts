import ivm from 'isolated-vm';

export const isPrivate = true;
export function makeSymbol(name?: string): symbol {
	return ivm.lib.privateSymbol(name);
}
