import type { ConstructionSite } from './construction-site';
import type { RoomObject } from 'xxscreeps/game/objects/room-object';

export type StructureFactory = (constructionSite: ConstructionSite, name?: string) => RoomObject;
export const structureFactories = new Map<string, StructureFactory>();
