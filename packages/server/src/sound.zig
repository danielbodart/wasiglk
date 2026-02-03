// sound.zig - Glk sound channel stubs (not implemented)

const types = @import("types.zig");

const glui32 = types.glui32;
const schanid_t = types.schanid_t;

export fn glk_schannel_iterate(chan: schanid_t, rockptr: ?*glui32) callconv(.c) schanid_t {
    _ = chan;
    if (rockptr) |r| r.* = 0;
    return null;
}

export fn glk_schannel_get_rock(chan: schanid_t) callconv(.c) glui32 {
    _ = chan;
    return 0;
}

export fn glk_schannel_create(rock: glui32) callconv(.c) schanid_t {
    _ = rock;
    return null;
}

export fn glk_schannel_create_ext(rock: glui32, volume: glui32) callconv(.c) schanid_t {
    _ = rock;
    _ = volume;
    return null;
}

export fn glk_schannel_destroy(chan: schanid_t) callconv(.c) void {
    _ = chan;
}

export fn glk_schannel_play(chan: schanid_t, snd: glui32) callconv(.c) glui32 {
    _ = chan;
    _ = snd;
    return 0;
}

export fn glk_schannel_play_ext(chan: schanid_t, snd: glui32, repeats: glui32, notify: glui32) callconv(.c) glui32 {
    _ = chan;
    _ = snd;
    _ = repeats;
    _ = notify;
    return 0;
}

export fn glk_schannel_play_multi(chanarray: ?[*]schanid_t, chancount: glui32, sndarray: ?[*]glui32, soundcount: glui32, notify: glui32) callconv(.c) glui32 {
    _ = chanarray;
    _ = chancount;
    _ = sndarray;
    _ = soundcount;
    _ = notify;
    return 0;
}

export fn glk_schannel_stop(chan: schanid_t) callconv(.c) void {
    _ = chan;
}

export fn glk_schannel_set_volume(chan: schanid_t, vol: glui32) callconv(.c) void {
    _ = chan;
    _ = vol;
}

export fn glk_schannel_set_volume_ext(chan: schanid_t, vol: glui32, duration: glui32, notify: glui32) callconv(.c) void {
    _ = chan;
    _ = vol;
    _ = duration;
    _ = notify;
}

export fn glk_schannel_pause(chan: schanid_t) callconv(.c) void {
    _ = chan;
}

export fn glk_schannel_unpause(chan: schanid_t) callconv(.c) void {
    _ = chan;
}

export fn glk_sound_load_hint(snd: glui32, flag: glui32) callconv(.c) void {
    _ = snd;
    _ = flag;
}
