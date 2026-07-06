import { KeyvalScript } from 'xxscreeps/engine/db/storage/script.js';

type UpdateArgv = [ version: number, relativeOffset: number, type: 'double' | 'int32', value: number, operation: 'min' | 'max' | 'incr' | 'set' ];

/**
 * Update the given schema struct field in place
 */
export const UpdateSchemaBlob = new KeyvalScript((keyval, [ key ]: [ string ], [ version, relativeOffset, type, value, operation ]: UpdateArgv) => {
	// Read DataView blob
	const blob = keyval.blob.getSync(key);
	if (blob === null) {
		return null;
	}
	const dv = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
	// Check magic number & version
	if (dv.getUint32(0, true) !== 0x00fff35a || dv.getUint32(4, true) !== version) {
		return null;
	}
	// Extract numeric value
	const offset = relativeOffset + 16;
	const current = function() {
		switch (type) {
			case 'double': return dv.getFloat64(offset, true);
			case 'int32': return dv.getInt32(offset, true);
		}
	}();
	// Apply operation
	const next = function() {
		switch (operation) {
			case 'min': return Math.min(current, value);
			case 'max': return Math.max(current, value);
			case 'incr': return current + value;
			case 'set': return value;
		}
	}();
	// Write new bytes
	const nextBlob = new Uint8Array(new SharedArrayBuffer(blob.buffer.byteLength));
	nextBlob.set(blob);
	const nextDv = new DataView(nextBlob.buffer);
	switch (type) {
		case 'double': nextDv.setFloat64(offset, next, true); break;
		case 'int32': nextDv.setInt32(offset, next, true); break;
	}
	// nb: `set` operation is always synchronous, because it just updates an internal cache
	keyval.blob.set(key, nextBlob);
	return type === 'double' ? String(next) : next;
}, {
	lua:
`local width = (ARGV[3] == 'double') and 8 or 4
local offset = tonumber(ARGV[2]) + 16
local blob = redis.call('GETRANGE', KEYS[1], 0, offset + width - 1)
if #blob < offset + width or struct.unpack('<I', blob, 1) ~= 0x00fff35a then
	return false
end
if struct.unpack('<I', blob, 5) ~= tonumber(ARGV[1]) then
	return false
end
local fmt = (ARGV[3] == 'double') and '<d' or '<i'
local current = struct.unpack(fmt, blob, offset + 1)
local value = tonumber(ARGV[4])
local next
if ARGV[5] == 'min' then
	next = math.min(current, value)
elseif ARGV[5] == 'max' then
	next = math.max(current, value)
elseif ARGV[5] == 'incr' then
	next = current + value
else
	next = value
end
redis.call('SETRANGE', KEYS[1], offset, struct.pack(fmt, next))
if ARGV[3] == 'double' then
	return tostring(next)
else
	return next
end`,
});
