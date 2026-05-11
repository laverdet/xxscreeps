import { kMaxWorldSize, makeRoomName, parseRoomName } from './name.js';

// Sector centers sit at every 10th room in absolute coords. Internal `rx/ry` is offset by
// `kMaxWorldSize2`, so the modulus differs by quadrant: W rx → `rx%10===2`, E rx → `rx%10===3`.
const kMaxWorldSize2 = kMaxWorldSize >>> 1;

function isCentralAxis(coord: number): boolean {
	return coord < kMaxWorldSize2 ? coord % 10 === 2 : coord % 10 === 3;
}

function isCentralCoord(rx: number, ry: number): boolean {
	return isCentralAxis(rx) && isCentralAxis(ry);
}

export function isCentralRoom(roomName: string): boolean {
	const { rx, ry } = parseRoomName(roomName);
	return isCentralCoord(rx, ry);
}

// 11-room ring around a sector center: 4 corners + 9 rooms per side = 40 rooms total.
export function sectorEdgeRooms(centralRoom: string): string[] {
	const { rx, ry } = parseRoomName(centralRoom);
	if (!isCentralCoord(rx, ry)) return [];
	const out: string[] = [
		makeRoomName(rx - 5, ry - 5),
		makeRoomName(rx + 5, ry - 5),
		makeRoomName(rx - 5, ry + 5),
		makeRoomName(rx + 5, ry + 5),
	];
	for (let ii = -4; ii <= 4; ++ii) {
		out.push(makeRoomName(rx + ii, ry - 5));
		out.push(makeRoomName(rx + ii, ry + 5));
		out.push(makeRoomName(rx - 5, ry + ii));
		out.push(makeRoomName(rx + 5, ry + ii));
	}
	return out;
}

// Inverse: which centers claim this room as a ring member. Edge rooms belong to 1-2 sectors;
// corner rooms to 4. Centers and interior rooms return [].
export function sectorsForRoom(roomName: string): string[] {
	const { rx, ry } = parseRoomName(roomName);
	const xCandidates: number[] = [];
	const yCandidates: number[] = [];
	for (let dd = -5; dd <= 5; ++dd) {
		if (isCentralAxis(rx + dd)) xCandidates.push(rx + dd);
		if (isCentralAxis(ry + dd)) yCandidates.push(ry + dd);
	}
	const out: string[] = [];
	for (const cx of xCandidates) {
		const xOnRing = Math.abs(rx - cx) === 5;
		for (const cy of yCandidates) {
			if (xOnRing || Math.abs(ry - cy) === 5) {
				out.push(makeRoomName(cx, cy));
			}
		}
	}
	return out;
}

const SECTOR_HALF_EXTENT = 250;

// Returns a tile predicate for `roomName`'s membership in `centralRoom`'s 250-tile sector
// radius. Parses both room names once; the closure does two adds and two abs per call.
export function sectorContainsTile(centralRoom: string, roomName: string): (xx: number, yy: number) => boolean {
	const center = parseRoomName(centralRoom);
	const here = parseRoomName(roomName);
	const xBase = (here.rx - center.rx) * 50 - 24;
	const yBase = (here.ry - center.ry) * 50 - 24;
	return (xx, yy) => Math.abs(xBase + xx) < SECTOR_HALF_EXTENT && Math.abs(yBase + yy) < SECTOR_HALF_EXTENT;
}
