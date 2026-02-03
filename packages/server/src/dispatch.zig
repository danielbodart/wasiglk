// dispatch.zig - Glk dispatch layer for VM integration

const std = @import("std");
const types = @import("types.zig");
const state = @import("state.zig");

const glui32 = types.glui32;
const DispatchRock = types.DispatchRock;
const WindowData = state.WindowData;
const StreamData = state.StreamData;
const FileRefData = state.FileRefData;

// Object class constants (from Glk spec)
pub const gidisp_Class_Window: glui32 = 0;
pub const gidisp_Class_Stream: glui32 = 1;
pub const gidisp_Class_Fileref: glui32 = 2;
pub const gidisp_Class_Schannel: glui32 = 3;

// Use DispatchRock as the gidispatch_rock_t type
pub const gidispatch_rock_t = DispatchRock;

// Registry callbacks
pub var object_register_fn: ?*const fn (?*anyopaque, glui32) callconv(.c) gidispatch_rock_t = null;
pub var object_unregister_fn: ?*const fn (?*anyopaque, glui32, gidispatch_rock_t) callconv(.c) void = null;
pub var retained_register_fn: ?*const fn (?*anyopaque, glui32, [*:0]u8) callconv(.c) gidispatch_rock_t = null;
pub var retained_unregister_fn: ?*const fn (?*anyopaque, glui32, [*:0]u8, gidispatch_rock_t) callconv(.c) void = null;

export fn gidispatch_set_object_registry(
    regi: ?*const fn (?*anyopaque, glui32) callconv(.c) gidispatch_rock_t,
    unregi: ?*const fn (?*anyopaque, glui32, gidispatch_rock_t) callconv(.c) void,
) callconv(.c) void {
    object_register_fn = regi;
    object_unregister_fn = unregi;

    // Register all existing objects
    if (regi) |register_fn| {
        // Register all windows
        var win = state.window_list;
        while (win) |w| : (win = w.next) {
            w.dispatch_rock = register_fn(@ptrCast(w), gidisp_Class_Window);
        }
        // Register all streams
        var str = state.stream_list;
        while (str) |s| : (str = s.next) {
            s.dispatch_rock = register_fn(@ptrCast(s), gidisp_Class_Stream);
        }
        // Register all file references
        var fref = state.fileref_list;
        while (fref) |f| : (fref = f.next) {
            f.dispatch_rock = register_fn(@ptrCast(f), gidisp_Class_Fileref);
        }
    }
}

export fn gidispatch_get_objrock(obj: ?*anyopaque, objclass: glui32) callconv(.c) gidispatch_rock_t {
    if (obj == null) return gidispatch_rock_t{ .num = 0 };

    switch (objclass) {
        gidisp_Class_Window => {
            const win: *WindowData = @ptrCast(@alignCast(obj));
            return win.dispatch_rock;
        },
        gidisp_Class_Stream => {
            const str: *StreamData = @ptrCast(@alignCast(obj));
            return str.dispatch_rock;
        },
        gidisp_Class_Fileref => {
            const fref: *FileRefData = @ptrCast(@alignCast(obj));
            return fref.dispatch_rock;
        },
        else => return gidispatch_rock_t{ .num = 0 },
    }
}

export fn gidispatch_set_retained_registry(
    regi: ?*const fn (?*anyopaque, glui32, [*:0]u8) callconv(.c) gidispatch_rock_t,
    unregi: ?*const fn (?*anyopaque, glui32, [*:0]u8, gidispatch_rock_t) callconv(.c) void,
) callconv(.c) void {
    retained_register_fn = regi;
    retained_unregister_fn = unregi;
}

export fn gidispatch_set_autorestore_registry(
    locatearr: ?*const fn (?*anyopaque, glui32, [*:0]u8, gidispatch_rock_t, *c_int) callconv(.c) c_long,
    restorearr: ?*const fn (c_long, glui32, [*:0]u8, *?*anyopaque) callconv(.c) gidispatch_rock_t,
) callconv(.c) void {
    _ = locatearr;
    _ = restorearr;
}
