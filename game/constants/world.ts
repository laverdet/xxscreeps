export type ErrorCode =
	typeof OK |
	typeof ERR_NOT_OWNER |
	typeof ERR_NO_PATH |
	typeof ERR_NAME_EXISTS |
	typeof ERR_BUSY |
	typeof ERR_NOT_FOUND |
	typeof ERR_NOT_ENOUGH_ENERGY |
	typeof ERR_NOT_ENOUGH_RESOURCES |
	typeof ERR_INVALID_TARGET |
	typeof ERR_FULL |
	typeof ERR_NOT_IN_RANGE |
	typeof ERR_INVALID_ARGS |
	typeof ERR_TIRED |
	typeof ERR_NO_BODYPART |
	typeof ERR_NOT_ENOUGH_EXTENSIONS |
	typeof ERR_RCL_NOT_ENOUGH |
	typeof ERR_GCL_NOT_ENOUGH;
export const OK = 0 as const;
export const ERR_NOT_OWNER = -1 as const;
export const ERR_NO_PATH = -2 as const;
export const ERR_NAME_EXISTS = -3 as const;
export const ERR_BUSY = -4 as const;
export const ERR_NOT_FOUND = -5 as const;
export const ERR_NOT_ENOUGH_ENERGY = -6 as const;
export const ERR_NOT_ENOUGH_RESOURCES = -6 as const;
export const ERR_INVALID_TARGET = -7 as const;
export const ERR_FULL = -8 as const;
export const ERR_NOT_IN_RANGE = -9 as const;
export const ERR_INVALID_ARGS = -10 as const;
export const ERR_TIRED = -11 as const;
export const ERR_NO_BODYPART = -12 as const;
export const ERR_NOT_ENOUGH_EXTENSIONS = -6 as const;
export const ERR_RCL_NOT_ENOUGH = -14 as const;
export const ERR_GCL_NOT_ENOUGH = -15 as const;

export const TOP = 1 as const;
export const TOP_RIGHT = 2 as const;
export const RIGHT = 3 as const;
export const BOTTOM_RIGHT = 4 as const;
export const BOTTOM = 5 as const;
export const BOTTOM_LEFT = 6 as const;
export const LEFT = 7 as const;
export const TOP_LEFT = 8 as const;

export const OBSTACLE_OBJECT_TYPES = [
	'spawn',
	'creep',
	'powerCreep',
	'source',
	'mineral',
	'deposit',
	'controller',
	'constructedWall',
	'extension',
	'link',
	'storage',
	'tower',
	'observer',
	'powerSpawn',
	'powerBank',
	'lab',
	'terminal',
	'nuker',
	'factory',
	'invaderCore',
];

export const WORLD_WIDTH = 202;
export const WORLD_HEIGHT = 202;

export const MODE_SIMULATION = null;
export const MODE_WORLD = null;

export const TERRAIN_MASK_WALL = 1;
export const TERRAIN_MASK_SWAMP = 2;
export const TERRAIN_MASK_LAVA = 4;

export const FLAGS_LIMIT = 10000;

export const COLOR_RED = 1 as const;
export const COLOR_PURPLE = 2 as const;
export const COLOR_BLUE = 3 as const;
export const COLOR_CYAN = 4 as const;
export const COLOR_GREEN = 5 as const;
export const COLOR_YELLOW = 6 as const;
export const COLOR_ORANGE = 7 as const;
export const COLOR_BROWN = 8 as const;
export const COLOR_GREY = 9 as const;
export const COLOR_WHITE = 10 as const;
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

export const PORTAL_DECAY = 30000;
export const PORTAL_UNSTABLE = 10 * 24 * 3600 * 1000;
export const PORTAL_MIN_TIMEOUT = 12 * 24 * 3600 * 1000;
export const PORTAL_MAX_TIMEOUT = 22 * 24 * 3600 * 1000;

export const POWER_BANK_RESPAWN_TIME = 50000;

export const INVADERS_ENERGY_GOAL = 100000;

export const ORDER_SELL = 'sell';
export const ORDER_BUY = 'buy';

export const MARKET_FEE = 0.05;

export const MARKET_MAX_ORDERS = 300;
export const MARKET_ORDER_LIFE_TIME = 1000 * 60 * 60 * 24 * 30;

export const SYSTEM_USERNAME = 'Screeps';

export const SIGN_PLANNED_AREA = 'A new Novice or Respawn Area is being planned somewhere in this sector. Please make sure all important rooms are reserved.';
export const SIGN_NOVICE_AREA = SIGN_PLANNED_AREA;
export const SIGN_RESPAWN_AREA = SIGN_PLANNED_AREA;

export const EVENT_ATTACK = 1;
export const EVENT_OBJECT_DESTROYED = 2;
export const EVENT_ATTACK_CONTROLLER = 3;
export const EVENT_BUILD = 4;
export const EVENT_HEAL = 6;
export const EVENT_REPAIR = 7;
export const EVENT_RESERVE_CONTROLLER = 8;
export const EVENT_UPGRADE_CONTROLLER = 9;
export const EVENT_EXIT = 10;
export const EVENT_POWER = 11;
export const EVENT_TRANSFER = 12;

export const EVENT_ATTACK_TYPE_MELEE = 1;
export const EVENT_ATTACK_TYPE_RANGED = 2;
export const EVENT_ATTACK_TYPE_RANGED_MASS = 3;
export const EVENT_ATTACK_TYPE_DISMANTLE = 4;
export const EVENT_ATTACK_TYPE_HIT_BACK = 5;
export const EVENT_ATTACK_TYPE_NUKE = 6;

export const EVENT_HEAL_TYPE_MELEE = 1;
export const EVENT_HEAL_TYPE_RANGED = 2;
