// unicode.zig - Glk Unicode support functions

const std = @import("std");
const types = @import("types.zig");
const state = @import("state.zig");
const stream = @import("stream.zig");

const glui32 = types.glui32;
const glsi32 = types.glsi32;
const strid_t = types.strid_t;

// ============== Character Case Conversion ==============

export fn glk_char_to_lower(ch: u8) callconv(.c) u8 {
    return std.ascii.toLower(ch);
}

export fn glk_char_to_upper(ch: u8) callconv(.c) u8 {
    return std.ascii.toUpper(ch);
}

export fn glk_buffer_to_lower_case_uni(buf: ?[*]glui32, len: glui32, numchars: glui32) callconv(.c) glui32 {
    const buf_ptr = buf orelse return numchars;
    const count = @min(numchars, len);
    for (buf_ptr[0..count]) |*ch| {
        if (ch.* >= 'A' and ch.* <= 'Z') {
            ch.* += 'a' - 'A';
        }
    }
    return numchars;
}

export fn glk_buffer_to_upper_case_uni(buf: ?[*]glui32, len: glui32, numchars: glui32) callconv(.c) glui32 {
    const buf_ptr = buf orelse return numchars;
    const count = @min(numchars, len);
    for (buf_ptr[0..count]) |*ch| {
        if (ch.* >= 'a' and ch.* <= 'z') {
            ch.* -= 'a' - 'A';
        }
    }
    return numchars;
}

export fn glk_buffer_to_title_case_uni(buf: ?[*]glui32, len: glui32, numchars: glui32, lowerrest: glui32) callconv(.c) glui32 {
    const buf_ptr = buf orelse return numchars;
    if (numchars == 0 or len == 0) return numchars;

    if (buf_ptr[0] >= 'a' and buf_ptr[0] <= 'z') {
        buf_ptr[0] -= 'a' - 'A';
    }

    if (lowerrest != 0) {
        const count = @min(numchars, len);
        for (buf_ptr[1..count]) |*ch| {
            if (ch.* >= 'A' and ch.* <= 'Z') {
                ch.* += 'a' - 'A';
            }
        }
    }
    return numchars;
}

export fn glk_buffer_canon_decompose_uni(buf: ?[*]glui32, len: glui32, numchars: glui32) callconv(.c) glui32 {
    _ = buf;
    _ = len;
    return numchars;
}

export fn glk_buffer_canon_normalize_uni(buf: ?[*]glui32, len: glui32, numchars: glui32) callconv(.c) glui32 {
    _ = buf;
    _ = len;
    return numchars;
}

// ============== Unicode Output ==============

export fn glk_put_char_uni(ch: glui32) callconv(.c) void {
    stream.putCharUniToStream(state.current_stream, ch);
}

export fn glk_put_string_uni(s: ?[*:0]const glui32) callconv(.c) void {
    const s_ptr = s orelse return;
    var ptr = s_ptr;
    while (ptr[0] != 0) : (ptr += 1) {
        stream.putCharUniToStream(state.current_stream, ptr[0]);
    }
}

export fn glk_put_buffer_uni(buf: ?[*]const glui32, len: glui32) callconv(.c) void {
    const buf_ptr = buf orelse return;
    for (buf_ptr[0..len]) |ch| {
        stream.putCharUniToStream(state.current_stream, ch);
    }
}

export fn glk_put_char_stream_uni(str: strid_t, ch: glui32) callconv(.c) void {
    stream.putCharUniToStream(@ptrCast(@alignCast(str)), ch);
}

export fn glk_put_string_stream_uni(str: strid_t, s: ?[*:0]const glui32) callconv(.c) void {
    const s_ptr = s orelse return;
    const str_data = @as(?*state.StreamData, @ptrCast(@alignCast(str)));
    var ptr = s_ptr;
    while (ptr[0] != 0) : (ptr += 1) {
        stream.putCharUniToStream(str_data, ptr[0]);
    }
}

export fn glk_put_buffer_stream_uni(str: strid_t, buf: ?[*]const glui32, len: glui32) callconv(.c) void {
    const buf_ptr = buf orelse return;
    const str_data = @as(?*state.StreamData, @ptrCast(@alignCast(str)));
    for (buf_ptr[0..len]) |ch| {
        stream.putCharUniToStream(str_data, ch);
    }
}

// ============== Unicode Input ==============

export fn glk_get_char_stream_uni(str: strid_t) callconv(.c) glsi32 {
    return stream.getCharUniFromStream(@ptrCast(@alignCast(str)));
}

export fn glk_get_buffer_stream_uni(str: strid_t, buf: ?[*]glui32, len: glui32) callconv(.c) glui32 {
    const buf_ptr = buf orelse return 0;
    const str_data: ?*state.StreamData = @ptrCast(@alignCast(str));
    for (buf_ptr[0..len], 0..) |*slot, i| {
        const ch = stream.getCharUniFromStream(str_data);
        if (ch < 0) return @intCast(i);
        slot.* = @intCast(ch);
    }
    return len;
}

export fn glk_get_line_stream_uni(str_opaque: strid_t, buf: ?[*]glui32, len: glui32) callconv(.c) glui32 {
    const buf_ptr = buf orelse return 0;
    if (len == 0) return 0;
    const str_data: ?*state.StreamData = @ptrCast(@alignCast(str_opaque));
    for (buf_ptr[0 .. len - 1], 0..) |*slot, i| {
        const ch = stream.getCharUniFromStream(str_data);
        if (ch < 0) return @intCast(i);
        slot.* = @intCast(ch);
        if (ch == '\n') return @intCast(i + 1);
    }
    return len - 1;
}
