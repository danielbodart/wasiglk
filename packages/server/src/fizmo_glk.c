/* fizmo_glk.c - Glk entry point for fizmo Z-machine interpreter.
 *
 * Based on fizmo-glktermw.c by Andrew Plotkin and Christoph Ender.
 * BSD-3-Clause license.
 */

#include "glk.h"
#include "glk_interface/glk_interface.h"
#include "glk_interface/glk_screen_if.h"
#include "glk_interface/glk_blorb_if.h"
#include "glk_interface/glk_filesys_if.h"
#include "glkstart.h"

#include <interpreter/fizmo.h>
#include <interpreter/config.h>
#include <tools/unused.h>

static char *init_err = NULL;
static char *init_err2 = NULL;
static strid_t gamefilestream = NULL;

glkunix_argumentlist_t glkunix_arguments[] = {
  { "", glkunix_arg_ValueFollows, "filename: The game file to load." },
  { NULL, glkunix_arg_End, NULL }
};

int glkunix_startup_code(glkunix_startup_t *data)
{
  int ix;
  char *filename = NULL;
  strid_t gamefile = NULL;
  fizmo_register_filesys_interface(&glkint_filesys_interface);

  for (ix=1; ix<data->argc; ix++) {
    if (filename) {
      init_err = "You must supply exactly one game file.";
      return 1;
    }
    filename = data->argv[ix];
  }

  if (!filename) {
    init_err = "You must supply the name of a game file.";
    return 1;
  }

  gamefile = glkunix_stream_open_pathname(filename, 0, 1);
  if (!gamefile) {
    init_err = "The game file could not be opened.";
    init_err2 = filename;
    return 1;
  }

  gamefilestream = gamefile;
  return 1;
}

static z_file *open_game_stream(z_file *current_stream)
{
  if (!current_stream)
    current_stream = zfile_from_glk_strid(gamefilestream, "Game",
      FILETYPE_DATA, FILEACCESS_READ);
  else
    zfile_replace_glk_strid(current_stream, gamefilestream);

  return current_stream;
}

void glk_main(void)
{
  z_file *story_stream;

  if (init_err) {
    glkint_fatal_error_handler(init_err, NULL, init_err2, 0, 0);
    return;
  }

  set_configuration_value("savegame-path", NULL);
  set_configuration_value("savegame-default-filename", "");

  fizmo_register_screen_interface(&glkint_screen_interface);
  fizmo_register_blorb_interface(&glkint_blorb_interface);

  story_stream = glkint_open_interface(&open_game_stream);
  if (!story_stream)
    return;
  fizmo_start(story_stream, NULL, NULL);
}
