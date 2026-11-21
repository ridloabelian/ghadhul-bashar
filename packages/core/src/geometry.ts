/**
 * Computes the rendered media rectangle inside an element's content box,
 * handling CSS object-fit (fill, contain, cover, none, scale-down) and object-position.
 */

export interface BoxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function parseObjectPositionToken(token: string, freeSpace: number): number {
  const t = token.trim().toLowerCase();
  if (t === 'left' || t === 'top') return 0;
  if (t === 'center') return freeSpace * 0.5;
  if (t === 'right' || t === 'bottom') return freeSpace;
  if (t.endsWith('%')) {
    const pct = parseFloat(t) / 100;
    return Number.isFinite(pct) ? freeSpace * pct : freeSpace * 0.5;
  }
  if (t.endsWith('px')) {
    const px = parseFloat(t);
    return Number.isFinite(px) ? px : freeSpace * 0.5;
  }
  return freeSpace * 0.5;
}

export function computeMediaContentRect(
  boxWidth: number,
  boxHeight: number,
  naturalWidth: number,
  naturalHeight: number,
  objectFit = 'fill',
  objectPosition = '50% 50%'
): BoxRect {
  if (boxWidth <= 0 || boxHeight <= 0) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }
  if (naturalWidth <= 0 || naturalHeight <= 0 || objectFit === 'fill') {
    return { x: 0, y: 0, w: boxWidth, h: boxHeight };
  }

  let renderW = boxWidth;
  let renderH = boxHeight;
  const imgAspect = naturalWidth / naturalHeight;
  const boxAspect = boxWidth / boxHeight;

  if (objectFit === 'contain' || (objectFit === 'scale-down' && (naturalWidth > boxWidth || naturalHeight > boxHeight))) {
    if (imgAspect > boxAspect) {
      renderW = boxWidth;
      renderH = boxWidth / imgAspect;
    } else {
      renderH = boxHeight;
      renderW = boxHeight * imgAspect;
    }
  } else if (objectFit === 'cover') {
    if (imgAspect > boxAspect) {
      renderH = boxHeight;
      renderW = boxHeight * imgAspect;
    } else {
      renderW = boxWidth;
      renderH = boxWidth / imgAspect;
    }
  } else if (objectFit === 'none' || objectFit === 'scale-down') {
    renderW = naturalWidth;
    renderH = naturalHeight;
  }

  const tokens = objectPosition.split(/\s+/);
  const posX = parseObjectPositionToken(tokens[0] ?? '50%', boxWidth - renderW);
  const posY = parseObjectPositionToken(tokens[1] ?? tokens[0] ?? '50%', boxHeight - renderH);

  return { x: posX, y: posY, w: renderW, h: renderH };
}

/**
 * Projects a normalized [0..1] detection box onto the visible element rectangle,
 * clipping cleanly to [0..boxWidth, 0..boxHeight].
 */
export function projectRegionToElement(
  region: BoxRect,
  contentRect: BoxRect,
  clipWidth: number,
  clipHeight: number
): BoxRect | null {
  const rawX = contentRect.x + region.x * contentRect.w;
  const rawY = contentRect.y + region.y * contentRect.h;
  const rawR = rawX + region.w * contentRect.w;
  const rawB = rawY + region.h * contentRect.h;

  const x = Math.max(0, Math.min(clipWidth, rawX));
  const y = Math.max(0, Math.min(clipHeight, rawY));
  const r = Math.max(0, Math.min(clipWidth, rawR));
  const b = Math.max(0, Math.min(clipHeight, rawB));
  const w = r - x;
  const h = b - y;
  if (w < 2 || h < 2) return null;
  return { x, y, w, h };
}
