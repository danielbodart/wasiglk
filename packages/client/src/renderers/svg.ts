/**
 * SVG Graphics Renderer
 *
 * Renders GLK graphics operations to an SVG element.
 * Provides automatic scaling and clean DOM structure.
 */

import { type GraphicsRenderer, colorToCSS } from './types';

export class SvgRenderer implements GraphicsRenderer {
  private svg: SVGSVGElement | null = null;
  private defs: SVGDefsElement | null = null;
  private width = 0;
  private height = 0;
  private backgroundColor = 0xffffff;

  mount(container: HTMLElement): void {
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.style.width = '100%';
    this.svg.style.height = '100%';
    this.svg.style.display = 'block';

    // Create defs for patterns/clips if needed
    this.defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    this.svg.appendChild(this.defs);

    container.appendChild(this.svg);
    this.updateViewBox();
  }

  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.updateViewBox();
  }

  setBackgroundColor(color: number): void {
    this.backgroundColor = color;
    if (this.svg) {
      this.svg.style.backgroundColor = colorToCSS(color);
    }
  }

  fillRect(
    color: number,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    if (!this.svg) return;

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(width));
    rect.setAttribute('height', String(height));
    rect.setAttribute('fill', colorToCSS(color));

    this.svg.appendChild(rect);
  }

  eraseRect(x: number, y: number, width: number, height: number): void {
    this.fillRect(this.backgroundColor, x, y, width, height);
  }

  drawImage(
    url: string,
    x: number,
    y: number,
    width?: number,
    height?: number
  ): void {
    if (!this.svg) return;

    const image = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'image'
    );
    image.setAttribute('x', String(x));
    image.setAttribute('y', String(y));
    image.setAttributeNS('http://www.w3.org/1999/xlink', 'href', url);

    if (width !== undefined) {
      image.setAttribute('width', String(width));
    }
    if (height !== undefined) {
      image.setAttribute('height', String(height));
    }

    // Preserve aspect ratio
    image.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    this.svg.appendChild(image);
  }

  clear(): void {
    if (!this.svg) return;

    // Remove all children except defs
    while (this.svg.lastChild && this.svg.lastChild !== this.defs) {
      this.svg.removeChild(this.svg.lastChild);
    }
  }

  dispose(): void {
    if (this.svg?.parentNode) {
      this.svg.parentNode.removeChild(this.svg);
    }
    this.svg = null;
    this.defs = null;
  }

  private updateViewBox(): void {
    if (this.svg && this.width > 0 && this.height > 0) {
      this.svg.setAttribute(
        'viewBox',
        `0 0 ${this.width} ${this.height}`
      );
    }
  }
}
