/**
 * Graphics Renderer Interface
 *
 * Pluggable interface for rendering graphics windows.
 * Applications can implement this to render graphics however they want.
 */

export interface GraphicsRenderer {
  /** Mount the renderer to a container element */
  mount(container: HTMLElement): void;

  /** Set the renderer size */
  setSize(width: number, height: number): void;

  /** Set the background color for the window */
  setBackgroundColor(color: number): void;

  /** Fill a rectangle with a color */
  fillRect(
    color: number,
    x: number,
    y: number,
    width: number,
    height: number
  ): void;

  /** Erase a rectangle (fill with background color) */
  eraseRect(x: number, y: number, width: number, height: number): void;

  /** Draw an image at a position */
  drawImage(
    url: string,
    x: number,
    y: number,
    width?: number,
    height?: number
  ): void;

  /** Clear all graphics */
  clear(): void;

  /** Clean up resources */
  dispose(): void;
}

/**
 * Convert a GLK color value (24-bit RGB) to CSS color string
 */
export function colorToCSS(color: number): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `rgb(${r}, ${g}, ${b})`;
}
