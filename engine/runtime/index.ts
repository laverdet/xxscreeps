export type UserCode = {
	modules: {
		name: string;
		data: string;
	}[];
};

export let gameTime: number;

export function setCurrentGameTime(time: number) {
	gameTime = time;
}
