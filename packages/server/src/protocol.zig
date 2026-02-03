// protocol.zig - RemGlk JSON protocol implementation

const std = @import("std");
const types = @import("types.zig");
const state = @import("state.zig");

const glui32 = types.glui32;
const glsi32 = types.glsi32;
const wintype = types.wintype;
const WindowData = state.WindowData;
const allocator = state.allocator;

// ============== I/O Helpers ==============

pub fn writeStdout(data: []const u8) void {
    _ = std.posix.write(std.posix.STDOUT_FILENO, data) catch {};
}

pub fn readLineFromStdin(buf: []u8) ?[]u8 {
    var i: usize = 0;
    while (i < buf.len) {
        var byte: [1]u8 = undefined;
        const n = std.posix.read(std.posix.STDIN_FILENO, &byte) catch return null;
        if (n == 0) return null; // EOF
        if (byte[0] == '\n') return buf[0..i];
        buf[i] = byte[0];
        i += 1;
    }
    return buf[0..i];
}

// ============== RemGlk Protocol Types ==============

// Input event types (client -> interpreter)
pub const InputEvent = struct {
    type: []const u8,
    gen: u32 = 0,
    window: ?u32 = null,
    value: ?[]const u8 = null,
    metrics: ?Metrics = null,
    partial: ?std.json.Value = null,
};

pub const Metrics = struct {
    width: ?u32 = null,
    height: ?u32 = null,
    charwidth: ?f64 = null,
    charheight: ?f64 = null,
};

// Output types (interpreter -> client)
pub const WindowType = enum {
    buffer,
    grid,
    graphics,
    pair,
};

pub const TextInputType = enum {
    line,
    char,
};

pub const WindowUpdate = struct {
    id: u32,
    type: WindowType,
    rock: u32 = 0,
    left: f64 = 0,
    top: f64 = 0,
    width: f64,
    height: f64,
    gridwidth: ?u32 = null,
    gridheight: ?u32 = null,
};

pub const ContentUpdate = struct {
    id: u32,
    clear: ?bool = null,
    text: ?[]const u8 = null,
};

pub const InputRequest = struct {
    id: u32,
    type: TextInputType,
    gen: ?u32 = null,
    maxlen: ?u32 = null,
    initial: ?[]const u8 = null,
};

const StateUpdate = struct {
    type: []const u8 = "update",
    gen: u32,
    windows: ?[]const WindowUpdate = null,
    content: ?[]const ContentUpdate = null,
    input: ?[]const InputRequest = null,
};

const InitResponse = struct {
    type: []const u8 = "init",
    gen: u32 = 0,
    metrics: ?Metrics = null,
    support: []const []const u8 = &[_][]const u8{ "timer", "hyperlinks", "graphics", "graphicswin" },
};

const ErrorResponse = struct {
    type: []const u8 = "error",
    message: []const u8,
};

// ============== Protocol State ==============

pub var generation: u32 = 0;
pub var pending_windows: [16]WindowUpdate = undefined;
pub var pending_windows_len: usize = 0;
pub var pending_content: [64]ContentUpdate = undefined;
pub var pending_content_len: usize = 0;
pub var pending_input: [8]InputRequest = undefined;
pub var pending_input_len: usize = 0;

// ============== JSON Protocol Functions ==============

fn writeJson(value: anytype) void {
    var buf: [16384]u8 = undefined;
    const slice = std.fmt.bufPrint(&buf, "{f}", .{std.json.fmt(value, .{})}) catch return;
    writeStdout(slice);
    writeStdout("\n");
}

pub fn parseInputEvent(json_str: []const u8) ?InputEvent {
    const parsed = std.json.parseFromSlice(InputEvent, allocator, json_str, .{
        .ignore_unknown_fields = true,
    }) catch return null;
    defer parsed.deinit();

    // Copy to avoid lifetime issues
    return InputEvent{
        .type = allocator.dupe(u8, parsed.value.type) catch return null,
        .gen = parsed.value.gen,
        .window = parsed.value.window,
        .value = if (parsed.value.value) |v| allocator.dupe(u8, v) catch null else null,
        .metrics = parsed.value.metrics,
    };
}

pub fn sendUpdate() void {
    const update = StateUpdate{
        .gen = generation,
        .windows = if (pending_windows_len > 0) pending_windows[0..pending_windows_len] else null,
        .content = if (pending_content_len > 0) pending_content[0..pending_content_len] else null,
        .input = if (pending_input_len > 0) pending_input[0..pending_input_len] else null,
    };
    writeJson(update);

    pending_windows_len = 0;
    pending_content_len = 0;
    pending_input_len = 0;
    generation += 1;
}

pub fn sendError(message: []const u8) void {
    writeJson(ErrorResponse{ .message = message });
}

pub fn sendInitResponse() void {
    writeJson(InitResponse{});
}

pub fn queueWindowUpdate(win: *WindowData) void {
    if (pending_windows_len >= pending_windows.len) return;
    const wtype: WindowType = switch (win.win_type) {
        wintype.TextBuffer => .buffer,
        wintype.TextGrid => .grid,
        wintype.Graphics => .graphics,
        else => .buffer,
    };
    pending_windows[pending_windows_len] = .{
        .id = win.id,
        .type = wtype,
        .rock = win.rock,
        .width = @floatFromInt(state.client_metrics.width),
        .height = @floatFromInt(state.client_metrics.height),
        .gridwidth = if (wtype == .grid) state.client_metrics.width else null,
        .gridheight = if (wtype == .grid) state.client_metrics.height else null,
    };
    pending_windows_len += 1;
}

pub fn queueContentUpdate(win_id: u32, text: ?[]const u8, clear: bool) void {
    if (pending_content_len >= pending_content.len) return;
    pending_content[pending_content_len] = .{
        .id = win_id,
        .clear = if (clear) true else null,
        .text = text,
    };
    pending_content_len += 1;
}

pub fn queueInputRequest(win_id: u32, input_type: TextInputType) void {
    if (pending_input_len >= pending_input.len) return;
    pending_input[pending_input_len] = .{
        .id = win_id,
        .type = input_type,
        .gen = generation,
    };
    pending_input_len += 1;
}

// ============== Special Update Functions ==============

// Send an image content update directly (bypasses normal queue to handle JSON array format)
pub fn sendImageUpdate(win_id: u32, image: glui32, alignment: glsi32, img_width: glui32, img_height: glui32) void {
    // Flush any pending updates first
    if (pending_content_len > 0 or pending_windows_len > 0 or pending_input_len > 0) {
        sendUpdate();
    }

    // Build the JSON manually to get the correct array format for text
    var buf: [1024]u8 = undefined;
    const json = std.fmt.bufPrint(&buf,
        \\{{"type":"update","gen":{d},"content":[{{"id":{d},"text":[{{"special":{{"type":"image","image":{d},"alignment":{d},"width":{d},"height":{d}}}}}]}}]}}
    , .{ generation, win_id, image, alignment, img_width, img_height }) catch return;

    writeStdout(json);
    writeStdout("\n");
    generation += 1;
}

// Send a graphics window image update (includes x, y position)
pub fn sendGraphicsImageUpdate(win_id: u32, image: glui32, x: glsi32, y: glsi32, img_width: glui32, img_height: glui32) void {
    if (pending_content_len > 0 or pending_windows_len > 0 or pending_input_len > 0) {
        sendUpdate();
    }

    var buf: [1024]u8 = undefined;
    const json = std.fmt.bufPrint(&buf,
        \\{{"type":"update","gen":{d},"content":[{{"id":{d},"text":[{{"special":{{"type":"image","image":{d},"x":{d},"y":{d},"width":{d},"height":{d}}}}}]}}]}}
    , .{ generation, win_id, image, x, y, img_width, img_height }) catch return;

    writeStdout(json);
    writeStdout("\n");
    generation += 1;
}

pub fn sendFlowBreakUpdate(win_id: u32) void {
    if (pending_content_len > 0 or pending_windows_len > 0 or pending_input_len > 0) {
        sendUpdate();
    }

    var buf: [256]u8 = undefined;
    const json = std.fmt.bufPrint(&buf,
        \\{{"type":"update","gen":{d},"content":[{{"id":{d},"text":[{{"special":{{"type":"flowbreak"}}}}]}}]}}
    , .{ generation, win_id }) catch return;

    writeStdout(json);
    writeStdout("\n");
    generation += 1;
}

pub fn sendGraphicsFillUpdate(win_id: u32, color: glui32, x: glsi32, y: glsi32, width: glui32, height: glui32) void {
    if (pending_content_len > 0 or pending_windows_len > 0 or pending_input_len > 0) {
        sendUpdate();
    }

    var buf: [512]u8 = undefined;
    const json = std.fmt.bufPrint(&buf,
        \\{{"type":"update","gen":{d},"content":[{{"id":{d},"text":[{{"special":{{"type":"fill","color":{d},"x":{d},"y":{d},"width":{d},"height":{d}}}}}]}}]}}
    , .{ generation, win_id, color, x, y, width, height }) catch return;

    writeStdout(json);
    writeStdout("\n");
    generation += 1;
}

pub fn sendGraphicsEraseUpdate(win_id: u32, x: glsi32, y: glsi32, width: glui32, height: glui32) void {
    if (pending_content_len > 0 or pending_windows_len > 0 or pending_input_len > 0) {
        sendUpdate();
    }

    var buf: [512]u8 = undefined;
    const json = std.fmt.bufPrint(&buf,
        \\{{"type":"update","gen":{d},"content":[{{"id":{d},"text":[{{"special":{{"type":"fill","x":{d},"y":{d},"width":{d},"height":{d}}}}}]}}]}}
    , .{ generation, win_id, x, y, width, height }) catch return;

    writeStdout(json);
    writeStdout("\n");
    generation += 1;
}

pub fn sendGraphicsSetColorUpdate(win_id: u32, color: glui32) void {
    if (pending_content_len > 0 or pending_windows_len > 0 or pending_input_len > 0) {
        sendUpdate();
    }

    var buf: [256]u8 = undefined;
    const json = std.fmt.bufPrint(&buf,
        \\{{"type":"update","gen":{d},"content":[{{"id":{d},"text":[{{"special":{{"type":"setcolor","color":{d}}}}}]}}]}}
    , .{ generation, win_id, color }) catch return;

    writeStdout(json);
    writeStdout("\n");
    generation += 1;
    pending_content_len += 1;
}

// ============== Text Buffer Management ==============

pub fn flushTextBuffer() void {
    if (state.text_buffer_len > 0 and state.text_buffer_win != null) {
        // Need to copy text since we're queuing it
        const text_copy = allocator.dupe(u8, state.text_buffer[0..state.text_buffer_len]) catch return;
        queueContentUpdate(state.text_buffer_win.?.id, text_copy, false);
        state.text_buffer_len = 0;
    }
}

pub fn ensureGlkInitialized() void {
    if (!state.glk_initialized) {
        state.glk_initialized = true;

        // Wait for client's init message
        var buf: [4096]u8 = undefined;
        const line = readLineFromStdin(&buf) orelse {
            sendError("No init message received");
            return;
        };

        // Parse the init event
        if (parseInputEvent(line)) |event| {
            if (std.mem.eql(u8, event.type, "init")) {
                if (event.metrics) |m| {
                    if (m.width) |w| state.client_metrics.width = w;
                    if (m.height) |h| state.client_metrics.height = h;
                }
            }
            // Free the type string we allocated
            allocator.free(event.type);
            if (event.value) |v| allocator.free(v);
        }

        // Send our init response
        sendInitResponse();
    }
}
