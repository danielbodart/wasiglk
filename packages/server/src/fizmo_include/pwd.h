/* Minimal pwd.h stub for WASI */
#ifndef FIZMO_PWD_H
#define FIZMO_PWD_H

#include <stddef.h>

struct passwd {
  char *pw_dir;
};

static inline struct passwd *getpwuid(int uid) {
  (void)uid;
  return NULL;
}

static inline int getuid(void) {
  return 0;
}

#endif
