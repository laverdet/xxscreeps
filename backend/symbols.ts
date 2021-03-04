import type { Room } from 'xxscreeps/game/room';
import type { AnyEventLog } from 'xxscreeps/game/room/event-log';

export const eventRenderers = new Map<number, ((event: AnyEventLog, room: Room) => any)[]>();
export const MapRender = Symbol('render');
export const Render = Symbol('render');
