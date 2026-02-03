// event.zig - Glk event handling

const std = @import("std");
const types = @import("types.zig");
const state = @import("state.zig");
const protocol = @import("protocol.zig");
const dispatch = @import("dispatch.zig");

const glui32 = types.glui32;
const winid_t = types.winid_t;
const event_t = types.event_t;
const evtype = types.evtype;
const keycode = types.keycode;
const WindowData = state.WindowData;
const allocator = state.allocator;

export fn glk_select(event: ?*event_t) callconv(.c) void {
    if (event == null) return;

    // Flush text buffer before waiting for input
    protocol.flushTextBuffer();

    event.?.type = evtype.None;
    event.?.win = null;
    event.?.val1 = 0;
    event.?.val2 = 0;

    // Find window with input request
    var win = state.window_list;
    while (win) |w| : (win = w.next) {
        if (w.char_request or w.line_request or w.char_request_uni or w.line_request_uni) {
            break;
        }
    }

    if (win == null) return;
    const w = win.?;

    // Queue input request and send update
    const input_type: protocol.TextInputType = if (w.line_request or w.line_request_uni) .line else .char;
    protocol.queueInputRequest(w.id, input_type);
    protocol.sendUpdate();

    // Read JSON input from stdin
    var json_buf: [4096]u8 = undefined;
    const json_line = protocol.readLineFromStdin(&json_buf) orelse {
        glk_exit();
    };

    // Parse the input event
    const input_event = protocol.parseInputEvent(json_line) orelse {
        return;
    };
    defer {
        allocator.free(input_event.type);
        if (input_event.value) |v| allocator.free(v);
    }

    const input_value = input_event.value orelse return;

    if (w.line_request) {
        if (w.line_buffer) |lb| {
            // Ensure we don't underflow if buflen is 0, leave room for null
            const max_copy = if (w.line_buflen > 1) w.line_buflen - 1 else 0;
            const copy_len: glui32 = @intCast(@min(input_value.len, max_copy));
            if (copy_len > 0) {
                @memcpy(lb[0..copy_len], input_value[0..copy_len]);
            }
            // Add null terminator for compatibility (even though Glk spec says not to)
            if (copy_len < w.line_buflen) {
                lb[copy_len] = 0;
            }

            event.?.type = evtype.LineInput;
            event.?.win = @ptrCast(w);
            event.?.val1 = copy_len;

            // Unregister the buffer so Glulxe copies data back to VM memory
            if (dispatch.retained_unregister_fn) |unregister_fn| {
                // Typecode for char array with passout: "&+#!Cn"
                var typecode = "&+#!Cn".*;
                unregister_fn(@ptrCast(lb), w.line_buflen, &typecode, w.line_buffer_rock);
            }
        }
        w.line_request = false;
        w.line_buffer = null;
        w.line_buffer_rock = .{ .num = 0 };
    } else if (w.char_request) {
        event.?.type = evtype.CharInput;
        event.?.win = @ptrCast(w);
        event.?.val1 = if (input_value.len > 0) input_value[0] else keycode.Return;
        w.char_request = false;
    }
}

export fn glk_select_poll(event: ?*event_t) callconv(.c) void {
    if (event == null) return;
    event.?.type = evtype.None;
    event.?.win = null;
    event.?.val1 = 0;
    event.?.val2 = 0;
}

export fn glk_request_timer_events(millisecs: glui32) callconv(.c) void {
    _ = millisecs;
}

export fn glk_request_line_event(win_opaque: winid_t, buf: ?[*]u8, maxlen: glui32, initlen: glui32) callconv(.c) void {
    _ = initlen;
    const win: ?*WindowData = @ptrCast(@alignCast(win_opaque));
    if (win == null) return;

    win.?.line_request = true;
    win.?.line_buffer = buf;
    win.?.line_buflen = maxlen;

    // Register the buffer with the retained registry so it gets copied back
    if (dispatch.retained_register_fn) |register_fn| {
        // Typecode "&+#!Cn" = reference, passout, array, retained, char
        var typecode = "&+#!Cn".*;
        win.?.line_buffer_rock = register_fn(@ptrCast(buf), maxlen, &typecode);
    }
}

export fn glk_request_char_event(win_opaque: winid_t) callconv(.c) void {
    const win: ?*WindowData = @ptrCast(@alignCast(win_opaque));
    if (win == null) return;
    win.?.char_request = true;
}

export fn glk_request_mouse_event(win: winid_t) callconv(.c) void {
    _ = win;
}

export fn glk_cancel_line_event(win_opaque: winid_t, event: ?*event_t) callconv(.c) void {
    const win: ?*WindowData = @ptrCast(@alignCast(win_opaque));
    if (win == null) return;

    if (event) |e| {
        e.type = evtype.None;
        e.win = null;
        e.val1 = 0;
        e.val2 = 0;
    }

    win.?.line_request = false;
    win.?.line_buffer = null;
}

export fn glk_cancel_char_event(win_opaque: winid_t) callconv(.c) void {
    const win: ?*WindowData = @ptrCast(@alignCast(win_opaque));
    if (win == null) return;
    win.?.char_request = false;
}

export fn glk_cancel_mouse_event(win: winid_t) callconv(.c) void {
    _ = win;
}

export fn glk_request_char_event_uni(win_opaque: winid_t) callconv(.c) void {
    const win: ?*WindowData = @ptrCast(@alignCast(win_opaque));
    if (win == null) return;
    win.?.char_request_uni = true;
}

export fn glk_request_line_event_uni(win_opaque: winid_t, buf: ?[*]glui32, maxlen: glui32, initlen: glui32) callconv(.c) void {
    _ = initlen;
    const win: ?*WindowData = @ptrCast(@alignCast(win_opaque));
    if (win == null) return;
    win.?.line_request_uni = true;
    win.?.line_buffer_uni = buf;
    win.?.line_buflen = maxlen;
}

// glk_exit is used by event handling
pub fn glk_exit() callconv(.c) noreturn {
    protocol.flushTextBuffer();
    if (protocol.pending_content_len > 0 or protocol.pending_windows_len > 0) {
        protocol.sendUpdate();
    }
    std.process.exit(0);
}
