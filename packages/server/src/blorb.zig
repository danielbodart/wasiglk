// blorb.zig - Blorb resource file support

const types = @import("types.zig");

const glui32 = types.glui32;
const strid_t = types.strid_t;

// Blorb types
pub const giblorb_err_t = glui32;
pub const giblorb_map_t = opaque {};

// Image info structure (matches gi_blorb.h)
pub const giblorb_image_info_t = extern struct {
    chunktype: glui32,
    width: glui32,
    height: glui32,
    alttext: ?[*:0]u8,
};

// Blorb chunk type constants
pub const giblorb_ID_PNG: glui32 = 0x504e4720; // 'PNG '
pub const giblorb_ID_JPEG: glui32 = 0x4a504547; // 'JPEG'

pub var blorb_map: ?*giblorb_map_t = null;

// These are provided by gi_blorb.c
pub extern fn giblorb_create_map(file: strid_t, newmap: *?*giblorb_map_t) callconv(.c) giblorb_err_t;
pub extern fn giblorb_destroy_map(map: ?*giblorb_map_t) callconv(.c) giblorb_err_t;
pub extern fn giblorb_load_image_info(map: ?*giblorb_map_t, resnum: glui32, res: *giblorb_image_info_t) callconv(.c) giblorb_err_t;

export fn giblorb_set_resource_map(file: strid_t) callconv(.c) giblorb_err_t {
    if (blorb_map != null) {
        _ = giblorb_destroy_map(blorb_map);
        blorb_map = null;
    }

    if (file == null) return 0; // giblorb_err_None

    return giblorb_create_map(file, &blorb_map);
}

export fn giblorb_get_resource_map() callconv(.c) ?*giblorb_map_t {
    return blorb_map;
}
