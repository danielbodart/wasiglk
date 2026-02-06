// tads2_glk.c - GLK entry point for TADS 2 only.
// Pure C, no TADS 3 dependencies.

#include <stdlib.h>
#include <string.h>

#include "os.h"
#include "trd.h"

#include "glk.h"
#include "glkstart.h"

static int tads_argc;
static char **tads_argv;

glkunix_argumentlist_t glkunix_arguments[] = {
    { (char *)"", glkunix_arg_ValueFollows, (char *)"filename: The game file to load." },
    { NULL, glkunix_arg_End, NULL }
};

int glkunix_startup_code(glkunix_startup_t *data)
{
    tads_argc = data->argc;
    tads_argv = data->argv;
    return TRUE;
}

void glk_main(void)
{
    int stat;
    int argc = tads_argc;
    char **argv = tads_argv;

    if (argc < 2) {
        winid_t mainwin = glk_window_open(0, 0, 0, wintype_TextBuffer, 0);
        glk_set_window(mainwin);
        glk_put_string("Error: no game file specified.\n");
        return;
    }

    os_init(&argc, argv, 0, 0, 0);
    os_instbrk(1);
    stat = os0main2(argc, argv, trdmain, "", 0, 0);
    os_instbrk(0);
    os_uninit();
    os_expause();
    os_term(stat);
}
