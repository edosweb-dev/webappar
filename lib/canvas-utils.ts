import type { Point } from '@/types/product';

// ---------------------------------------------------------------------------
// Affine transform helpers
// ---------------------------------------------------------------------------

/**
 * Compute the affine 2D transform that maps 3 source points to 3 destination points.
 *
 * Returns canvas `transform(a, b, c, d, e, f)` parameters where:
 *   x' = a*x + c*y + e
 *   y' = b*x + d*y + f
 *
 * Returns null if the source triangle is degenerate.
 */
export function computeAffineTransform(
  s0: Point,
  s1: Point,
  s2: Point,
  d0: Point,
  d1: Point,
  d2: Point
): [number, number, number, number, number, number] | null {
  const denom =
    (s1.x - s0.x) * (s2.y - s0.y) - (s2.x - s0.x) * (s1.y - s0.y);

  if (Math.abs(denom) < 1e-8) return null;

  // Coefficients for x'
  const a = ((d1.x - d0.x) * (s2.y - s0.y) - (d2.x - d0.x) * (s1.y - s0.y)) / denom;
  const c = ((d2.x - d0.x) * (s1.x - s0.x) - (d1.x - d0.x) * (s2.x - s0.x)) / denom;
  const e = d0.x - a * s0.x - c * s0.y;

  // Coefficients for y'
  const b = ((d1.y - d0.y) * (s2.y - s0.y) - (d2.y - d0.y) * (s1.y - s0.y)) / denom;
  const d = ((d2.y - d0.y) * (s1.x - s0.x) - (d1.y - d0.y) * (s2.x - s0.x)) / denom;
  const f = d0.y - b * s0.x - d * s0.y;

  return [a, b, c, d, e, f];
}

/**
 * Draw a clipped triangle of an image using an affine transform.
 * Clips to the destination triangle before drawing to avoid bleed.
 */
function drawAffineTriangle(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  src: [Point, Point, Point],
  dst: [Point, Point, Point]
): void {
  const transform = computeAffineTransform(src[0], src[1], src[2], dst[0], dst[1], dst[2]);
  if (!transform) return;

  const [a, b, c, d, e, f] = transform;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(dst[0].x, dst[0].y);
  ctx.lineTo(dst[1].x, dst[1].y);
  ctx.lineTo(dst[2].x, dst[2].y);
  ctx.closePath();
  ctx.clip();

  // canvas.transform(a, b, c, d, e, f) applies:  x' = a*x + c*y + e,  y' = b*x + d*y + f
  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(img, 0, 0);

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Bilinear / perspective helpers
// ---------------------------------------------------------------------------

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Bilinear interpolation of a 2D point given 4 quad corners.
 * corners order: [top-left, top-right, bottom-left, bottom-right]
 */
function bilerp(
  tl: Point,
  tr: Point,
  bl: Point,
  br: Point,
  u: number,
  v: number
): Point {
  return {
    x: lerp(lerp(tl.x, tr.x, u), lerp(bl.x, br.x, u), v),
    y: lerp(lerp(tl.y, tr.y, u), lerp(bl.y, br.y, u), v),
  };
}

// ---------------------------------------------------------------------------
// Main perspective draw function
// ---------------------------------------------------------------------------

/**
 * Draw an image onto a canvas quad using a perspective-approximating approach:
 * subdivide both source and destination quads into N×N cells, then draw each
 * cell using an affine (per-triangle) transform. With N≥8 the result is
 * visually indistinguishable from a true perspective-correct mapping for
 * typical architectural surfaces.
 *
 * @param ctx       Target canvas context
 * @param img       Source image (texture)
 * @param dstQuad   4 destination points: [tl, tr, br, bl] in canvas px coords
 * @param subdivisions  Number of grid divisions per axis (default 8)
 */
export function drawPerspective(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | HTMLCanvasElement,
  dstQuad: [Point, Point, Point, Point],
  subdivisions = 8
): void {
  const iw = 'naturalWidth' in img ? img.naturalWidth : img.width;
  const ih = 'naturalHeight' in img ? img.naturalHeight : img.height;

  const [dtl, dtr, dbr, dbl] = dstQuad;

  for (let iy = 0; iy < subdivisions; iy++) {
    for (let ix = 0; ix < subdivisions; ix++) {
      const u0 = ix / subdivisions;
      const u1 = (ix + 1) / subdivisions;
      const v0 = iy / subdivisions;
      const v1 = (iy + 1) / subdivisions;

      // Source texture coordinates for this cell
      const stl: Point = { x: u0 * iw, y: v0 * ih };
      const str: Point = { x: u1 * iw, y: v0 * ih };
      const sbr: Point = { x: u1 * iw, y: v1 * ih };
      const sbl: Point = { x: u0 * iw, y: v1 * ih };

      // Destination points via bilinear interpolation of the quad corners
      const p00 = bilerp(dtl, dtr, dbl, dbr, u0, v0);
      const p10 = bilerp(dtl, dtr, dbl, dbr, u1, v0);
      const p11 = bilerp(dtl, dtr, dbl, dbr, u1, v1);
      const p01 = bilerp(dtl, dtr, dbl, dbr, u0, v1);

      // Two triangles per cell
      drawAffineTriangle(ctx, img, [stl, str, sbr], [p00, p10, p11]);
      drawAffineTriangle(ctx, img, [stl, sbr, sbl], [p00, p11, p01]);
    }
  }
}

// ---------------------------------------------------------------------------
// Tiled texture helpers
// ---------------------------------------------------------------------------

/**
 * Compute the average pixel width and height of a quad.
 */
export function computeQuadDimensions(
  quad: [Point, Point, Point, Point]
): { width: number; height: number } {
  const [tl, tr, br, bl] = quad;
  const topW = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const botW = Math.hypot(br.x - bl.x, br.y - bl.y);
  const leftH = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  const rightH = Math.hypot(br.x - tr.x, br.y - tr.y);
  return {
    width: (topW + botW) / 2,
    height: (leftH + rightH) / 2,
  };
}

/**
 * Create an offscreen canvas with the texture tiled to fill the given dimensions.
 *
 * @param texture     Source texture image
 * @param width       Target canvas width in pixels
 * @param height      Target canvas height in pixels
 * @param tileFraction  Fraction of wall width per tile (default 0.3 → ~3.3 tiles across)
 */
export function createTiledCanvas(
  texture: HTMLImageElement,
  width: number,
  height: number,
  tileFraction = 0.3
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d')!;

  const aspect = texture.naturalHeight / texture.naturalWidth;
  const tileW = Math.round(width * tileFraction);
  const tileH = Math.round(tileW * aspect);

  if (tileW < 1 || tileH < 1) {
    ctx.drawImage(texture, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  for (let y = 0; y < height + tileH; y += tileH) {
    for (let x = 0; x < width + tileW; x += tileW) {
      ctx.drawImage(texture, x, y, tileW, tileH);
    }
  }

  return canvas;
}

// ---------------------------------------------------------------------------
// Real-world surface area computation
// ---------------------------------------------------------------------------

/**
 * Area of a quadrilateral (in square pixels) via the shoelace formula.
 * Points must be ordered: [top-left, top-right, bottom-right, bottom-left].
 */
export function computeQuadAreaPx(pts: [Point, Point, Point, Point]): number {
  const [a, b, c, d] = pts;
  return 0.5 * Math.abs(
    (a.x * b.y - b.x * a.y) +
    (b.x * c.y - c.x * b.y) +
    (c.x * d.y - d.x * c.y) +
    (d.x * a.y - a.x * d.y)
  );
}

export interface SurfaceCalcResult {
  /** Real area of the selected quad in m² */
  areaSqM: number;
  /** Area + 10% cut/waste margin */
  areaWithMarginSqM: number;
  /** Number of panels required (each panel = PANEL_SQM m²) */
  panelsNeeded: number;
  /** Estimated total price in euros */
  totalPrice: number;
  /** Scale factor: metres per pixel */
  mPerPx: number;
}

/** Standard Mattonflex panel size: 80 × 40 cm */
export const PANEL_SQM = 0.32;

/**
 * Compute the real-world surface area from the selected pixel quad.
 *
 * @param pts         4 corner points in video pixel coordinates
 * @param realWidthM  User-supplied real width of the selection in metres
 * @param pricePerSqM  Product price per m² (from WooCommerce)
 */
export function computeSurfaceArea(
  pts: [Point, Point, Point, Point],
  realWidthM: number,
  pricePerSqM: number
): SurfaceCalcResult {
  const { width: avgWidthPx } = computeQuadDimensions(pts);
  if (avgWidthPx < 1 || realWidthM <= 0) {
    return { areaSqM: 0, areaWithMarginSqM: 0, panelsNeeded: 0, totalPrice: 0, mPerPx: 0 };
  }

  const mPerPx = realWidthM / avgWidthPx;
  const areaPx = computeQuadAreaPx(pts);
  const areaSqM = areaPx * mPerPx * mPerPx;
  const areaWithMarginSqM = areaSqM * 1.1; // +10% waste margin
  const panelsNeeded = Math.ceil(areaWithMarginSqM / PANEL_SQM);
  const totalPrice = areaSqM * pricePerSqM; // price per m² × area

  return {
    areaSqM: Math.round(areaSqM * 100) / 100,
    areaWithMarginSqM: Math.round(areaWithMarginSqM * 100) / 100,
    panelsNeeded,
    totalPrice: Math.round(totalPrice * 100) / 100,
    mPerPx,
  };
}

// ---------------------------------------------------------------------------
// Watermark
// ---------------------------------------------------------------------------

/**
 * Stamp a translucent "mattonflex.it" watermark in the bottom-right corner.
 */
export function addWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  const fontSize = Math.max(14, Math.min(28, Math.round(width / 25)));
  ctx.save();
  ctx.font = `bold ${fontSize}px Inter, sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';

  // Drop shadow for legibility on any background
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';

  const padding = Math.max(10, Math.round(width / 80));
  ctx.fillText('mattonflex.it', width - padding, height - padding);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Image loading
// ---------------------------------------------------------------------------

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

// ---------------------------------------------------------------------------
// Auto wall detection
// ---------------------------------------------------------------------------

/**
 * Heuristic wall area detection.
 *
 * Attempts to locate the largest uniform vertical surface by running a simple
 * brightness-variance scan. Falls back to an inset rectangle (10% margin on
 * each side) when no clear region is found.
 *
 * Returns 4 points: [tl, tr, br, bl] in photo pixel coordinates.
 */
export function detectWallArea(
  imageData: ImageData,
  width: number,
  height: number
): [Point, Point, Point, Point] {
  const defaultMargin = 0.1;

  try {
    const { data } = imageData;
    const blockSize = Math.max(8, Math.round(Math.min(width, height) / 40));

    let bestX = Math.round(width * defaultMargin);
    let bestY = Math.round(height * defaultMargin);
    let bestW = Math.round(width * (1 - 2 * defaultMargin));
    let bestH = Math.round(height * (1 - 2 * defaultMargin));
    let lowestVariance = Infinity;

    // Scan for 3×2 grid of blocks with the lowest brightness variance
    const stepX = Math.round(width / 6);
    const stepY = Math.round(height / 4);
    const blockW = stepX * 3;
    const blockH = stepY * 2;

    for (let startY = 0; startY + blockH <= height; startY += stepY) {
      for (let startX = 0; startX + blockW <= width; startX += stepX) {
        let sum = 0;
        let sumSq = 0;
        let count = 0;

        for (let y = startY; y < startY + blockH; y += blockSize) {
          for (let x = startX; x < startX + blockW; x += blockSize) {
            const idx = (y * width + x) * 4;
            const brightness =
              (data[idx] * 299 + data[idx + 1] * 587 + data[idx + 2] * 114) / 1000;
            sum += brightness;
            sumSq += brightness * brightness;
            count++;
          }
        }

        if (count === 0) continue;
        const mean = sum / count;
        const variance = sumSq / count - mean * mean;

        if (variance < lowestVariance) {
          lowestVariance = variance;
          bestX = startX;
          bestY = startY;
          bestW = blockW;
          bestH = blockH;
        }
      }
    }

    // Expand the detected region slightly
    const pad = Math.round(Math.min(width, height) * 0.03);
    const x = Math.max(0, bestX - pad);
    const y = Math.max(0, bestY - pad);
    const x2 = Math.min(width, bestX + bestW + pad);
    const y2 = Math.min(height, bestY + bestH + pad);

    return [
      { x, y },
      { x: x2, y },
      { x: x2, y: y2 },
      { x, y: y2 },
    ];
  } catch {
    // Fallback: center 80% of the image
    const m = defaultMargin;
    return [
      { x: Math.round(width * m),       y: Math.round(height * m) },
      { x: Math.round(width * (1 - m)), y: Math.round(height * m) },
      { x: Math.round(width * (1 - m)), y: Math.round(height * (1 - m)) },
      { x: Math.round(width * m),       y: Math.round(height * (1 - m)) },
    ];
  }
}
