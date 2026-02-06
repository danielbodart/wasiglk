// WASI compatibility stubs for TADS interpreter.
// WASI doesn't have POSIX user/group APIs or dup().

#ifdef __wasi__

#include <sys/types.h>

int dup(int fd) {
    return -1;
}

uid_t geteuid(void) {
    return 0;
}

gid_t getegid(void) {
    return 0;
}

int getgroups(int size, gid_t list[]) {
    return 0;
}

#endif
