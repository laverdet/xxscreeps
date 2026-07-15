import { makeBrand } from 'xxscreeps/utility/brand.js';

const color = makeBrand<'color'>();
export const COLOR_RED = color(1);
export const COLOR_PURPLE = color(2);
export const COLOR_BLUE = color(3);
export const COLOR_CYAN = color(4);
export const COLOR_GREEN = color(5);
export const COLOR_YELLOW = color(6);
export const COLOR_ORANGE = color(7);
export const COLOR_BROWN = color(8);
export const COLOR_GREY = color(9);
export const COLOR_WHITE = color(10);
export const COLORS_ALL = [
	COLOR_RED,
	COLOR_PURPLE,
	COLOR_BLUE,
	COLOR_CYAN,
	COLOR_GREEN,
	COLOR_YELLOW,
	COLOR_ORANGE,
	COLOR_BROWN,
	COLOR_GREY,
	COLOR_WHITE,
];

export const FLAGS_LIMIT = 10000;

export const FIND_FLAGS = 110 as const;
export const LOOK_FLAGS = 'flag' as const;
