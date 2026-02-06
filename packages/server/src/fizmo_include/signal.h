/* Wrapper signal.h for fizmo WASI builds.
 * Includes the real signal.h then adds sigaction compatibility. */

#include_next <signal.h>

#ifndef FIZMO_SIGACTION_COMPAT
#define FIZMO_SIGACTION_COMPAT

#ifndef SA_RESTART
#define SA_RESTART 0

struct sigaction {
  void (*sa_handler)(int);
  int sa_flags;
  int sa_mask;
};

static inline int sigemptyset(int *set) {
  if (set) *set = 0;
  return 0;
}

static inline int sigaction(int signum, const struct sigaction *act,
                            struct sigaction *oldact) {
  (void)oldact;
  if (act && act->sa_handler) {
    signal(signum, act->sa_handler);
  }
  return 0;
}

#endif /* SA_RESTART */

#endif /* FIZMO_SIGACTION_COMPAT */
