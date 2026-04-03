import { Variant } from 'xxscreeps/schema/index.js';
import { assert, describe, test } from 'xxscreeps/test/index.js';
import { decodeMapVisuals, visualsReader } from './model.js';
import { MapVisual, RoomVisual, flush, schema } from './visual.js';

// Each test uses a unique room name or calls clear() to avoid shared state.
// flush() is only called where it is the thing being tested (e.g. verifying
// that a new instance after flush starts fresh). The roundTrip helper is the
// one exception — it must call flush() to serialize the visuals into a blob
// for decode verification.

// Round-trip helper: draw on map visual, flush to binary, deserialize, decode
function roundTrip(draw: (vis: MapVisual) => void) {
	const vis = new MapVisual();
	draw(vis);
	const flushed = flush();
	assert.strictEqual(flushed.length, 1);
	assert.strictEqual(flushed[0].roomName, 'map');
	const visuals = visualsReader(flushed[0].blob);
	return [ ...decodeMapVisuals(visuals) ];
}

describe('MapVisual coordinate decode', () => {
	test('circle decodes to room-relative coordinates', () => {
		const decoded = roundTrip(vis => {
			vis.circle({ x: 25, y: 25, roomName: 'W1N1' });
		});
		assert.strictEqual(decoded.length, 1);
		const circle: any = decoded[0];
		assert.strictEqual(circle[Variant], 'c');
		assert.strictEqual(circle.n, 'W1N1');
		assert.strictEqual(circle.x, 25);
		assert.strictEqual(circle.y, 25);
	});

	test('rect decodes position but preserves dimensions', () => {
		const decoded = roundTrip(vis => {
			vis.rect({ x: 10, y: 20, roomName: 'E0S0' }, 5, 3);
		});
		assert.strictEqual(decoded.length, 1);
		const rect: any = decoded[0];
		assert.strictEqual(rect[Variant], 'r');
		assert.strictEqual(rect.n, 'E0S0');
		assert.strictEqual(rect.x, 10);
		assert.strictEqual(rect.y, 20);
		assert.strictEqual(rect.w, 5);
		assert.strictEqual(rect.h, 3);
	});

	test('text decodes to room-relative coordinates', () => {
		const decoded = roundTrip(vis => {
			vis.text('hello', { x: 30, y: 40, roomName: 'W5N5' });
		});
		assert.strictEqual(decoded.length, 1);
		const text: any = decoded[0];
		assert.strictEqual(text[Variant], 't');
		assert.strictEqual(text.n, 'W5N5');
		assert.strictEqual(text.x, 30);
		assert.strictEqual(text.y, 40);
	});

	test('line decodes both endpoints', () => {
		const decoded = roundTrip(vis => {
			vis.line(
				{ x: 0, y: 0, roomName: 'W1N1' },
				{ x: 49, y: 49, roomName: 'E0S0' },
			);
		});
		assert.strictEqual(decoded.length, 1);
		const line: any = decoded[0];
		assert.strictEqual(line[Variant], 'l');
		assert.strictEqual(line.n1, 'W1N1');
		assert.strictEqual(line.x1, 0);
		assert.strictEqual(line.y1, 0);
		assert.strictEqual(line.n2, 'E0S0');
		assert.strictEqual(line.x2, 49);
		assert.strictEqual(line.y2, 49);
	});

	test('poly decodes all points', () => {
		const decoded = roundTrip(vis => {
			vis.poly([
				{ x: 10, y: 10, roomName: 'W1N1' },
				{ x: 20, y: 20, roomName: 'W1N1' },
			]);
		});
		assert.strictEqual(decoded.length, 1);
		const poly: any = decoded[0];
		assert.strictEqual(poly[Variant], 'p');
		assert.strictEqual(poly.points[0].n, 'W1N1');
		assert.strictEqual(poly.points[0].x, 10);
		assert.strictEqual(poly.points[0].y, 10);
		assert.strictEqual(poly.points[1].n, 'W1N1');
		assert.strictEqual(poly.points[1].x, 20);
		assert.strictEqual(poly.points[1].y, 20);
	});
});

describe('RoomVisual getSize', () => {
	test('returns non-zero after drawing', () => {
		const vis = new RoomVisual('test_size_1');
		vis.circle(25, 25);
		assert(vis.getSize() > 0, 'getSize should return non-zero after drawing');
	});

	test('returns 0 when empty', () => {
		const vis = new RoomVisual('test_size_2');
		assert.strictEqual(vis.getSize(), 0);
	});

	test('increases with more visuals', () => {
		const vis = new RoomVisual('test_size_3');
		vis.circle(25, 25);
		const size1 = vis.getSize();
		vis.line(0, 0, 10, 10);
		const size2 = vis.getSize();
		assert(size2 > size1, 'size should increase with more visuals');
	});

	test('resets after clear', () => {
		const vis = new RoomVisual('test_size_4');
		vis.circle(25, 25);
		assert(vis.getSize() > 0);
		vis.clear();
		assert.strictEqual(vis.getSize(), 0);
	});

	test('shared across instances for same room', () => {
		const a = new RoomVisual('test_size_shared');
		const b = new RoomVisual('test_size_shared');
		a.circle(25, 25);
		assert.strictEqual(a.getSize(), b.getSize(), 'two instances for same room should share size');
		b.line(0, 0, 10, 10);
		assert.strictEqual(a.getSize(), b.getSize(), 'size should stay in sync after either draws');
	});

	test('fresh instance after flush has zero size', () => {
		const vis = new RoomVisual('test_size_flush');
		vis.circle(25, 25);
		assert(vis.getSize() > 0);
		// flush() is the thing being tested here — it clears tickVisuals
		flush();
		const vis2 = new RoomVisual('test_size_flush');
		assert.strictEqual(vis2.getSize(), 0, 'new instance after flush should have zero size');
	});

	test('rooms are independent', () => {
		const a = new RoomVisual('test_size_room_a');
		const b = new RoomVisual('test_size_room_b');
		a.circle(25, 25);
		assert(a.getSize() > 0);
		assert.strictEqual(b.getSize(), 0, 'different room should not be affected');
	});
});

describe('Visual size limits', () => {
	test('room visuals throw at 500 KB', () => {
		const vis = new RoomVisual('test_limit_room');
		const limit = 500 << 10;
		// Measure a single entry
		vis.circle(25, 25);
		const entrySize = vis.getSize();
		// Fill to just under the limit
		while (vis.getSize() + entrySize <= limit) {
			vis.circle(25, 25);
		}
		assert(vis.getSize() <= limit, `size ${vis.getSize()} should be at or under ${limit}`);
		assert(vis.getSize() + entrySize > limit, 'next entry should exceed limit');
		assert.throws(() => vis.circle(25, 25), /RoomVisual in room .* exceeded 500 KB limit/);
	});

	test('map visuals throw at 1000 KB', () => {
		const mv = new MapVisual();
		mv.clear();
		const limit = 1000 << 10;
		const pos = { x: 25, y: 25, roomName: 'W1N1' };
		mv.circle(pos);
		const entrySize = mv.getSize();
		while (mv.getSize() + entrySize <= limit) {
			mv.circle(pos);
		}
		assert(mv.getSize() <= limit, `size ${mv.getSize()} should be at or under ${limit}`);
		assert(mv.getSize() + entrySize > limit, 'next entry should exceed limit');
		assert.throws(() => mv.circle(pos), /MapVisual .* exceeded 1000 KB limit/);
	});

	test('import respects size limits', () => {
		// Build a chunk to import
		const chunk = new RoomVisual('test_limit_import_chunk');
		while (chunk.getSize() < 10000) {
			chunk.circle(25, 25);
		}
		const exported = chunk.export();
		const chunkSize = chunk.getSize();
		const limit = 500 << 10;
		// Import chunks until the next one would exceed
		const vis = new RoomVisual('test_limit_import');
		while (vis.getSize() + chunkSize <= limit) {
			vis.import(exported);
		}
		assert(vis.getSize() <= limit);
		assert.throws(() => vis.import(exported), /RoomVisual in room .* exceeded 500 KB limit/);
	});

	test('failed push does not change size', () => {
		const vis = new RoomVisual('test_limit_preserve');
		const limit = 500 << 10;
		vis.circle(25, 25);
		const entrySize = vis.getSize();
		while (vis.getSize() + entrySize <= limit) {
			vis.circle(25, 25);
		}
		const sizeAtLimit = vis.getSize();
		assert.throws(() => vis.circle(25, 25), /exceeded 500 KB limit/);
		assert.strictEqual(vis.getSize(), sizeAtLimit, 'size should not change after failed push');
	});
});

describe('MapVisual class', () => {
	test('shares size tracking with RoomVisual("map")', () => {
		const mv = new MapVisual();
		mv.clear();
		const rv = new RoomVisual('map');
		mv.circle({ x: 25, y: 25, roomName: 'W1N1' });
		assert.strictEqual(rv.getSize(), mv.getSize(), 'MapVisual and RoomVisual("map") should share size');
	});

	test('methods are chainable and draw all types', () => {
		const mv = new MapVisual();
		mv.clear();
		const pos = { x: 25, y: 25, roomName: 'W1N1' };
		const result = mv
			.circle(pos)
			.line(pos, pos)
			.rect(pos, 1, 1)
			.text('hi', pos)
			.poly([ pos, pos ]);
		assert(result instanceof MapVisual, 'chained methods should return MapVisual');
		const flushed = flush();
		const mapEntry = flushed.find(entry => entry.roomName === 'map');
		assert(mapEntry !== undefined, 'should have map visuals');
		const visuals = [ ...visualsReader(mapEntry.blob) ];
		assert.strictEqual(visuals.length, 5);
		assert.strictEqual(visuals[0][Variant], 'c');
		assert.strictEqual(visuals[1][Variant], 'l');
		assert.strictEqual(visuals[2][Variant], 'r');
		assert.strictEqual(visuals[3][Variant], 't');
		assert.strictEqual(visuals[4][Variant], 'p');
	});

	test('clear, export, and import preserve size', () => {
		const mv = new MapVisual();
		mv.clear();
		mv.circle({ x: 25, y: 25, roomName: 'W1N1' });
		const sizeBeforeExport = mv.getSize();
		const exported = mv.export();
		assert(exported.length > 0, 'export should return non-empty string');
		mv.clear();
		assert.strictEqual(mv.getSize(), 0, 'clear should reset size');
		mv.import(exported);
		assert.strictEqual(mv.getSize(), sizeBeforeExport, 'import should restore original size');
	});
});
