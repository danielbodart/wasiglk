// tads3_glk.cpp - GLK entry point for TADS 3 only.
// No TADS 2 dependencies.

#include <stdlib.h>
#include <string.h>

#include "os.h"
#include "t3std.h"
#include "vmmain.h"
#include "vmmaincn.h"
#include "vmhostsi.h"

extern "C" {
#include "glk.h"
#include "glkstart.h"
}

static int tads_argc;
static char **tads_argv;

glkunix_argumentlist_t glkunix_arguments[] = {
    { (char *)"", glkunix_arg_ValueFollows, (char *)"filename: The game file to load." },
    { NULL, glkunix_arg_End, NULL }
};

extern "C" int glkunix_startup_code(glkunix_startup_t *data)
{
    tads_argc = data->argc;
    tads_argv = data->argv;
    return TRUE;
}

void glk_main(void)
{
    CVmMainClientConsole clientifc;
    int stat;
    int argc = tads_argc;
    char **argv = tads_argv;
    CVmHostIfc *hostifc = new CVmHostIfcStdio(argv[0]);

    if (argc < 2) {
        winid_t mainwin = glk_window_open(0, 0, 0, wintype_TextBuffer, 0);
        glk_set_window(mainwin);
        glk_put_string("Error: no game file specified.\n");
        delete hostifc;
        return;
    }

    os_init(&argc, argv, 0, 0, 0);
    stat = vm_run_image_main(&clientifc, "t3run", argc, argv, TRUE, FALSE, hostifc);
    os_uninit();
    delete hostifc;
    t3_list_memory_blocks(0);
    os_expause();
    os_term(stat);
}
