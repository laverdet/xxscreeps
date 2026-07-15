import { makeBrand } from 'xxscreeps/utility/brand.js';

/** @public */
export type ErrorCode =
	typeof OK |
	typeof ERR_NOT_OWNER |
	typeof ERR_NO_PATH |
	typeof ERR_NAME_EXISTS |
	typeof ERR_BUSY |
	typeof ERR_NOT_FOUND |
	typeof ERR_NOT_ENOUGH_ENERGY |
	// eslint-disable-next-line @typescript-eslint/no-duplicate-type-constituents
	typeof ERR_NOT_ENOUGH_RESOURCES |
	typeof ERR_INVALID_TARGET |
	typeof ERR_FULL |
	typeof ERR_NOT_IN_RANGE |
	typeof ERR_INVALID_ARGS |
	typeof ERR_TIRED |
	typeof ERR_NO_BODYPART |
	// eslint-disable-next-line @typescript-eslint/no-duplicate-type-constituents
	typeof ERR_NOT_ENOUGH_EXTENSIONS |
	typeof ERR_RCL_NOT_ENOUGH |
	typeof ERR_GCL_NOT_ENOUGH;

const error = makeBrand<'error'>();

/**
 * The operation has been scheduled successfully.
 * @public
 */
export const OK = error(0);
export type OK = typeof OK;

/**
 *
 * You are not the owner of this creep or the target controller.
 * @public
 */
export const ERR_NOT_OWNER = error(-1);

/**
 * No path to the target could be found.
 * @public
 */
export const ERR_NO_PATH = error(-2);

/**
 * An object with the same name already exists.
 * @public
 */
export const ERR_NAME_EXISTS = error(-3);

/**
 * The creep is still being spawned.
 * @public
 */
export const ERR_BUSY = error(-4);

/**
 * The object required for this operation could not be found.
 * @public
 */
export const ERR_NOT_FOUND = error(-5);

/**
 * The creep or structure does not have enough resources for this operation.
 * @public
 */
export const ERR_NOT_ENOUGH_RESOURCES = error(-6);

/**
 * The creep or structure does not have enough energy for this operation.
 * @public
 */
export const ERR_NOT_ENOUGH_ENERGY = ERR_NOT_ENOUGH_RESOURCES;

/**
 * The target is not a valid object for this operation.
 * @public
 */
export const ERR_INVALID_TARGET = error(-7);

/**
 * The target cannot receive any more resources.
 * @public
 */
export const ERR_FULL = error(-8);

/**
 * The target is too far away.
 * @public
 */
export const ERR_NOT_IN_RANGE = error(-9);

/**
 * The arguments provided are incorrect.
 * @public
 */
export const ERR_INVALID_ARGS = error(-10);

/**
 * The creep's fatigue indicator is non-zero, or the structure is still cooling down.
 * @public
 */
export const ERR_TIRED = error(-11);

/**
 * The creep does not have the required body parts for this operation.
 * @public
 */

export const ERR_NO_BODYPART = error(-12);

/**
 * The spawns and extensions in the room do not contain enough energy.
 * @public
 */
export const ERR_NOT_ENOUGH_EXTENSIONS = ERR_NOT_ENOUGH_RESOURCES;

/**
 * The Room Controller Level is not enough for this operation.
 * @public
 */

export const ERR_RCL_NOT_ENOUGH = error(-14);

/**
 * The Global Control Level is not enough for this operation.
 * @public
 */
export const ERR_GCL_NOT_ENOUGH = error(-15);

const dir = makeBrand<'dir'>();
export const TOP = dir(1);
export const TOP_RIGHT = dir(2);
export const RIGHT = dir(3);
export const BOTTOM_RIGHT = dir(4);
export const BOTTOM = dir(5);
export const BOTTOM_LEFT = dir(6);
export const LEFT = dir(7);
export const TOP_LEFT = dir(8);

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

export const PORTAL_DECAY = 30000;
export const PORTAL_UNSTABLE = 10 * 24 * 3600 * 1000;
export const PORTAL_MIN_TIMEOUT = 12 * 24 * 3600 * 1000;
export const PORTAL_MAX_TIMEOUT = 22 * 24 * 3600 * 1000;

export const POWER_BANK_RESPAWN_TIME = 50000;

export const ORDER_SELL = 'sell';
export const ORDER_BUY = 'buy';

export const MARKET_FEE = 0.05;

export const MARKET_MAX_ORDERS = 300;
export const MARKET_ORDER_LIFE_TIME = 1000 * 60 * 60 * 24 * 30;

export const SYSTEM_USERNAME = 'Screeps';

export const SIGN_PLANNED_AREA = 'A new Novice or Respawn Area is being planned somewhere in this sector. Please make sure all important rooms are reserved.';
export const SIGN_NOVICE_AREA = SIGN_PLANNED_AREA;
export const SIGN_RESPAWN_AREA = SIGN_PLANNED_AREA;

export const EVENT_OBJECT_DESTROYED = 2;
export const EVENT_BUILD = 4;
export const EVENT_REPAIR = 7;
export const EVENT_EXIT = 10;
export const EVENT_POWER = 11;
export const EVENT_TRANSFER = 12;
