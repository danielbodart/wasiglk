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
    if (ch < 0x80) {
        stream.glk_put_char(@intCast(ch));
    } else {
        // UTF-8 encode
        var utf8_buf: [4]u8 = undefined;
        const len = std.unicode.utf8Encode(@intCast(ch), &utf8_buf) catch return;
        for (utf8_buf[0..len]) |b| {
            stream.glk_put_char(b);
        }
    }
}

export fn glk_put_string_uni(s: ?[*:0]const glui32) callconv(.c) void {
    const s_ptr = s orelse return;
    var ptr = s_ptr;
    while (ptr[0] != 0) : (ptr += 1) {
        glk_put_char_uni(ptr[0]);
    }
}

export fn glk_put_buffer_uni(buf: ?[*]const glui32, len: glui32) callconv(.c) void {
    const buf_ptr = buf orelse return;
    for (buf_ptr[0..len]) |ch| {
        glk_put_char_uni(ch);
    }
}

export fn glk_put_char_stream_uni(str: strid_t, ch: glui32) callconv(.c) void {
    const save = state.current_stream;
    state.current_stream = @ptrCast(@alignCast(str));
    glk_put_char_uni(ch);
    state.current_stream = save;
}

export fn glk_put_string_stream_uni(str: strid_t, s: ?[*:0]const glui32) callconv(.c) void {
    const save = state.current_stream;
    state.current_stream = @ptrCast(@alignCast(str));
    glk_put_string_uni(s);
    state.current_stream = save;
}

export fn glk_put_buffer_stream_uni(str: strid_t, buf: ?[*]const glui32, len: glui32) callconv(.c) void {
    const save = state.current_stream;
    state.current_stream = @ptrCast(@alignCast(str));
    glk_put_buffer_uni(buf, len);
    state.current_stream = save;
}

// ============== Unicode Input ==============

export fn glk_get_char_stream_uni(str: strid_t) callconv(.c) glsi32 {
    return stream.glk_get_char_stream(str);
}

export fn glk_get_buffer_stream_uni(str: strid_t, buf: ?[*]glui32, len: glui32) callconv(.c) glui32 {
    const buf_ptr = buf orelse return 0;
    // Simplified - doesn't handle UTF-8 properly
    for (buf_ptr[0..len], 0..) |*slot, i| {
        const ch = stream.glk_get_char_stream(str);
        if (ch < 0) return @intCast(i);
        slot.* = @intCast(ch);
    }
    return len;
}

export fn glk_get_line_stream_uni(str_opaque: strid_t, buf: ?[*]glui32, len: glui32) callconv(.c) glui32 {
    const buf_ptr = buf orelse return 0;
    if (len == 0) return 0;
    for (buf_ptr[0 .. len - 1], 0..) |*slot, i| {
        const ch = stream.glk_get_char_stream(str_opaque);
        if (ch < 0) return @intCast(i);
        slot.* = @intCast(ch);
        if (ch == '\n') return @intCast(i + 1);
    }
    return len - 1;
}
