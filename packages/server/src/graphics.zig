// graphics.zig - Glk graphics and image functions

const std = @import("std");
const types = @import("types.zig");
const state = @import("state.zig");
const protocol = @import("protocol.zig");
const blorb = @import("blorb.zig");

const glui32 = types.glui32;
const glsi32 = types.glsi32;
const winid_t = types.winid_t;
const wintype = types.wintype;
const WindowData = state.WindowData;

export fn glk_image_get_info(image: glui32, width: ?*glui32, height: ?*glui32) callconv(.c) glui32 {
    const map = blorb.blorb_map orelse {
        if (width) |w| w.* = 0;
        if (height) |h| h.* = 0;
        return 0;
    };

    var info: blorb.giblorb_image_info_t = undefined;
    const err = blorb.giblorb_load_image_info(map, image, &info);
    if (err != 0) {
        if (width) |w| w.* = 0;
        if (height) |h| h.* = 0;
        return 0;
    }

    if (width) |w| w.* = info.width;
    if (height) |h| h.* = info.height;
    return 1;
}

export fn glk_image_draw(win: winid_t, image: glui32, val1: glsi32, val2: glsi32) callconv(.c) glui32 {
    const w: ?*WindowData = @ptrCast(@alignCast(win));
    if (w == null) return 0;

    const map = blorb.blorb_map orelse return 0;

    // Get image info from Blorb
    var info: blorb.giblorb_image_info_t = undefined;
    const err = blorb.giblorb_load_image_info(map, image, &info);
    if (err != 0) return 0;

    // Flush any pending text
    protocol.flushTextBuffer();

    // For text buffer windows, val1 is alignment, val2 is unused
    // For graphics windows, val1 is x, val2 is y
    if (w.?.win_type == wintype.TextBuffer) {
        protocol.sendImageUpdate(w.?.id, image, val1, info.width, info.height);
    } else if (w.?.win_type == wintype.Graphics) {
        // Graphics window: val1=x, val2=y
        protocol.sendGraphicsImageUpdate(w.?.id, image, val1, val2, info.width, info.height);
    }

    return 1;
}

export fn glk_image_draw_scaled(win: winid_t, image: glui32, val1: glsi32, val2: glsi32, width: glui32, height: glui32) callconv(.c) glui32 {
    const w: ?*WindowData = @ptrCast(@alignCast(win));
    if (w == null) return 0;

    const map = blorb.blorb_map orelse return 0;

    // Verify image exists
    var info: blorb.giblorb_image_info_t = undefined;
    const err = blorb.giblorb_load_image_info(map, image, &info);
    if (err != 0) return 0;

    // Flush any pending text
    protocol.flushTextBuffer();

    // Use provided dimensions instead of actual image size
    if (w.?.win_type == wintype.TextBuffer) {
        protocol.sendImageUpdate(w.?.id, image, val1, width, height);
    } else if (w.?.win_type == wintype.Graphics) {
        protocol.sendGraphicsImageUpdate(w.?.id, image, val1, val2, width, height);
    }

    return 1;
}

export fn glk_window_flow_break(win: winid_t) callconv(.c) void {
    const w: ?*WindowData = @ptrCast(@alignCast(win));
    if (w == null) return;
    if (w.?.win_type != wintype.TextBuffer) return;

    protocol.flushTextBuffer();
    protocol.sendFlowBreakUpdate(w.?.id);
}

export fn glk_window_erase_rect(win: winid_t, left: glsi32, top: glsi32, width: glui32, height: glui32) callconv(.c) void {
    const w: ?*WindowData = @ptrCast(@alignCast(win));
    if (w == null) return;
    if (w.?.win_type != wintype.Graphics) return;

    protocol.flushTextBuffer();
    protocol.sendGraphicsEraseUpdate(w.?.id, left, top, width, height);
}

export fn glk_window_fill_rect(win: winid_t, color: glui32, left: glsi32, top: glsi32, width: glui32, height: glui32) callconv(.c) void {
    const w: ?*WindowData = @ptrCast(@alignCast(win));
    if (w == null) return;
    if (w.?.win_type != wintype.Graphics) return;

    protocol.flushTextBuffer();
    protocol.sendGraphicsFillUpdate(w.?.id, color, left, top, width, height);
}

export fn glk_window_set_background_color(win: winid_t, color: glui32) callconv(.c) void {
    const w: ?*WindowData = @ptrCast(@alignCast(win));
    if (w == null) return;
    if (w.?.win_type != wintype.Graphics) return;

    protocol.flushTextBuffer();
    protocol.sendGraphicsSetColorUpdate(w.?.id, color);
}
