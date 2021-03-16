import type { Game } from '.';
export const gameInitializers: ((game: Game) => void)[] = [];
export const globals: Record<string, any> = Object.create(null);
