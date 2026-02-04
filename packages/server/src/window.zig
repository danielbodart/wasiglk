// window.zig - Glk window functions

const std = @import("std");
const types = @import("types.zig");
const state = @import("state.zig");
const stream = @import("stream.zig");
const dispatch = @import("dispatch.zig");
const protocol = @import("protocol.zig");

const glui32 = types.glui32;
const winid_t = types.winid_t;
const strid_t = types.strid_t;
const stream_result_t = types.stream_result_t;
const WindowData = state.WindowData;
const StreamData = state.StreamData;
const allocator = state.allocator;

export fn glk_window_get_root() callconv(.c) winid_t {
    return @ptrCast(state.root_window);
}

export fn glk_window_open(split: winid_t, method: glui32, size: glui32, win_type: glui32, rock: glui32) callconv(.c) winid_t {
    _ = split;
    _ = method;
    _ = size;

    // Output init message on first window open
    protocol.ensureGlkInitialized();

    const win = allocator.create(WindowData) catch return null;
    win.* = WindowData{
        .id = state.window_id_counter,
        .rock = rock,
        .win_type = win_type,
    };
    state.window_id_counter += 1;

    // Initialize grid buffer for grid windows
    if (win_type == types.wintype.TextGrid) {
        win.grid_buffer = allocator.create([state.MAX_GRID_HEIGHT][state.MAX_GRID_WIDTH]u8) catch {
            allocator.destroy(win);
            return null;
        };
        win.grid_dirty = allocator.create([state.MAX_GRID_HEIGHT]bool) catch {
            allocator.destroy(win.grid_buffer.?);
            allocator.destroy(win);
            return null;
        };
        // Initialize grid with spaces
        for (win.grid_buffer.?) |*row| {
            @memset(row, ' ');
        }
        // Clear dirty flags
        @memset(win.grid_dirty.?, false);
    }

    // Add to list
    win.next = state.window_list;
    if (state.window_list) |list| list.prev = win;
    state.window_list = win;

    // Create window stream
    win.stream = stream.createWindowStream(win);

    if (state.root_window == null) {
        state.root_window = win;
        // Set the first window's stream as current by default
        state.current_stream = win.stream;
    }

    // Register with dispatch system
    if (dispatch.object_register_fn) |register_fn| {
        win.dispatch_rock = register_fn(@ptrCast(win), dispatch.gidisp_Class_Window);
    }

    // Queue window creation update
    protocol.queueWindowUpdate(win);
    protocol.sendUpdate();

    return @ptrCast(win);
}

export fn glk_window_close(win_opaque: winid_t, result: ?*stream_result_t) callconv(.c) void {
    const win: ?*WindowData = @ptrCast(@alignCast(win_opaque));
    if (win == null) return;
    const w = win.?;

    if (result) |r| {
        if (w.stream) |s| {
            r.readcount = s.readcount;
            r.writecount = s.writecount;
        } else {
            r.readcount = 0;
            r.writecount = 0;
        }
    }

    // Close associated stream
    if (w.stream) |s| {
        s.win = null;
        stream.glk_stream_close(@ptrCast(s), null);
        w.stream = null;
    }

    // Unregister from dispatch system
    if (dispatch.object_unregister_fn) |unregister_fn| {
        unregister_fn(@ptrCast(w), dispatch.gidisp_Class_Window, w.dispatch_rock);
    }

    // Free grid buffer if allocated
    if (w.grid_buffer) |buf| {
        allocator.destroy(buf);
    }
    if (w.grid_dirty) |dirty| {
        allocator.destroy(dirty);
    }

    // Remove from list
    if (w.prev) |p| p.next = w.next else state.window_list = w.next;
    if (w.next) |n| n.prev = w.prev;

    if (state.root_window == w) state.root_window = null;

    allocator.destroy(w);
}

export fn glk_window_get_size(win_opaque: winid_t, widthptr: ?*glui32, heightptr: ?*glui32) callconv(.c) void {
    _ = win_opaque;
    if (widthptr) |w| w.* = 80;
    if (heightptr) |h| h.* = 24;
}

export fn glk_window_set_arrangement(win: winid_t, method: glui32, size: glui32, keywin: winid_t) callconv(.c) void {
    _ = win;
    _ = method;
    _ = size;
    _ = keywin;
}

export fn glk_window_get_arrangement(win: winid_t, methodptr: ?*glui32, sizeptr: ?*glui32, keywinptr: ?*winid_t) callconv(.c) void {
    _ = win;
    if (methodptr) |m| m.* = 0;
    if (sizeptr) |s| s.* = 0;
    if (keywinptr) |k| k.* = null;
}

export fn glk_window_iterate(win_opaque: winid_t, rockptr: ?*glui32) callconv(.c) winid_t {
    var win: ?*WindowData = @ptrCast(@alignCast(win_opaque));
    if (win == null) {
        win = state.window_list;
    } else {
        win = win.?.next;
    }

    if (win) |w| {
        if (rockptr) |r| r.* = w.rock;
    }
    return @ptrCast(win);
}

export fn glk_window_get_rock(win_opaque: winid_t) callconv(.c) glui32 {
    const win: ?*WindowData = @ptrCast(@alignCast(win_opaque));
    if (win) |w| return w.rock;
    return 0;
}

export fn glk_window_get_type(win_opaque: winid_t) callconv(.c) glui32 {
    const win: ?*WindowData = @ptrCast(@alignCast(win_opaque));
    if (win) |w| return w.win_type;
    return 0;
}

export fn glk_window_get_parent(win_opaque: winid_t) callconv(.c) winid_t {
    const win: ?*WindowData = @ptrCast(@alignCast(win_opaque));
    if (win) |w| return @ptrCast(w.parent);
    return null;
}

export fn glk_window_get_sibling(win_opaque: winid_t) callconv(.c) winid_t {
    const win: ?*WindowData = @ptrCast(@alignCast(win_opaque));
    if (win) |w| {
        if (w.parent) |p| {
            if (p.child1 == w) return @ptrCast(p.child2);
            return @ptrCast(p.child1);
        }
    }
    return null;
}

export fn glk_window_clear(win_opaque: winid_t) callconv(.c) void {
    const win: ?*WindowData = @ptrCast(@alignCast(win_opaque));
    if (win == null) return;
    const w = win.?;

    protocol.flushTextBuffer();

    // For grid windows, also clear the grid buffer and reset cursor
    if (w.win_type == types.wintype.TextGrid) {
        if (w.grid_buffer) |buf| {
            for (buf) |*row| {
                @memset(row, ' ');
            }
        }
        if (w.grid_dirty) |dirty| {
            @memset(dirty, false);
        }
        w.cursor_x = 0;
        w.cursor_y = 0;
    }

    protocol.queueContentUpdate(w.id, null, true);
    protocol.sendUpdate();
}

export fn glk_window_move_cursor(win_opaque: winid_t, xpos: glui32, ypos: glui32) callconv(.c) void {
    const win: ?*WindowData = @ptrCast(@alignCast(win_opaque));
    if (win == null) return;
    const w = win.?;

    // Only valid for grid windows
    if (w.win_type != types.wintype.TextGrid) return;

    // Flush any pending text before moving cursor
    protocol.flushTextBuffer();

    // Clamp to grid dimensions
    w.cursor_x = if (xpos < w.grid_width) xpos else w.grid_width -| 1;
    w.cursor_y = if (ypos < w.grid_height) ypos else w.grid_height -| 1;
}

export fn glk_window_get_stream(win_opaque: winid_t) callconv(.c) strid_t {
    const win: ?*WindowData = @ptrCast(@alignCast(win_opaque));
    if (win) |w| return @ptrCast(w.stream);
    return null;
}

export fn glk_window_set_echo_stream(win_opaque: winid_t, str_opaque: strid_t) callconv(.c) void {
    const win: ?*WindowData = @ptrCast(@alignCast(win_opaque));
    const str: ?*StreamData = @ptrCast(@alignCast(str_opaque));
    if (win) |w| w.echo_stream = str;
}

export fn glk_window_get_echo_stream(win_opaque: winid_t) callconv(.c) strid_t {
    const win: ?*WindowData = @ptrCast(@alignCast(win_opaque));
    if (win) |w| return @ptrCast(w.echo_stream);
    return null;
}

export fn glk_set_window(win_opaque: winid_t) callconv(.c) void {
    const win: ?*WindowData = @ptrCast(@alignCast(win_opaque));
    if (win) |w| {
        state.current_stream = w.stream;
    } else {
        state.current_stream = null;
    }
}
