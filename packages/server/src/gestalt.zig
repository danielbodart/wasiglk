// gestalt.zig - Glk gestalt (capability query) and core functions

const std = @import("std");
const types = @import("types.zig");
const blorb = @import("blorb.zig");
const protocol = @import("protocol.zig");

const glui32 = types.glui32;
const gestalt = types.gestalt;

export fn glk_gestalt(sel: glui32, val: glui32) callconv(.c) glui32 {
    return glk_gestalt_ext(sel, val, null, 0);
}

export fn glk_gestalt_ext(sel: glui32, val: glui32, arr: ?[*]glui32, arrlen: glui32) callconv(.c) glui32 {
    switch (sel) {
        gestalt.Version => return 0x00000706, // 0.7.6
        gestalt.CharInput => {
            if (val <= 0x7F or (val >= 0xA0 and val <= 0xFF)) return 1;
            if (val >= 0xffffffff - 28) return 1; // Special keys
            return 0;
        },
        gestalt.LineInput => {
            if (val <= 0x7F or (val >= 0xA0 and val <= 0xFF)) return 1;
            return 0;
        },
        gestalt.CharOutput => {
            if (val <= 0x7F or (val >= 0xA0 and val <= 0xFF)) {
                if (arr != null and arrlen >= 1) arr.?[0] = 1;
                return gestalt.CharOutput_ExactPrint;
            }
            if (arr != null and arrlen >= 1) arr.?[0] = 0;
            return gestalt.CharOutput_CannotPrint;
        },
        gestalt.Unicode, gestalt.UnicodeNorm => return 1,
        gestalt.Timer => return 0,
        gestalt.Graphics, gestalt.DrawImage, gestalt.GraphicsTransparency => {
            // Graphics supported if Blorb map with images is loaded
            return if (blorb.blorb_map != null) @as(glui32, 1) else @as(glui32, 0);
        },
        gestalt.GraphicsCharInput => return 0,
        gestalt.Sound, gestalt.SoundVolume, gestalt.SoundNotify, gestalt.SoundMusic, gestalt.Sound2 => return 0,
        gestalt.Hyperlinks, gestalt.HyperlinkInput => return 1,
        gestalt.MouseInput => {
            // Mouse input is supported for grid and graphics windows
            const wintype = types.wintype;
            if (val == wintype.TextGrid or val == wintype.Graphics) return 1;
            return 0;
        },
        gestalt.DateTime => return 1,
        gestalt.LineInputEcho, gestalt.LineTerminators => return 1,
        gestalt.LineTerminatorKey => return 0,
        gestalt.ResourceStream => return 1,
        else => return 0,
    }
}

pub export fn glk_exit() callconv(.c) noreturn {
    protocol.flushTextBuffer();
    protocol.flushGridWindows();
    // Always send a final update with exit: true
    protocol.queueExit();
    protocol.sendUpdate();
    std.process.exit(0);
}

export fn glk_set_interrupt_handler(_: ?*const fn () callconv(.c) void) callconv(.c) void {
    // WASI doesn't support interrupts
}

export fn glk_tick() callconv(.c) void {
    // No-op for WASI
}
