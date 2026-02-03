// garglk.zig - Garglk extension stubs
//
// These are informational functions used by some interpreters.
// For our JSON-over-stdin/stdout protocol, these are no-ops.

const types = @import("types.zig");

const glui32 = types.glui32;
const strid_t = types.strid_t;

export fn garglk_set_program_name(_: ?[*:0]const u8) callconv(.c) void {}
export fn garglk_set_program_info(_: ?[*:0]const u8) callconv(.c) void {}
export fn garglk_set_story_name(_: ?[*:0]const u8) callconv(.c) void {}
export fn garglk_set_story_title(_: ?[*:0]const u8) callconv(.c) void {}

export fn garglk_set_zcolors(fg: glui32, bg: glui32) callconv(.c) void {
    _ = fg;
    _ = bg;
}

export fn garglk_set_zcolors_stream(str: strid_t, fg: glui32, bg: glui32) callconv(.c) void {
    _ = str;
    _ = fg;
    _ = bg;
}

export fn garglk_set_reversevideo(reverse: glui32) callconv(.c) void {
    _ = reverse;
}

export fn garglk_set_reversevideo_stream(str: strid_t, reverse: glui32) callconv(.c) void {
    _ = str;
    _ = reverse;
}
