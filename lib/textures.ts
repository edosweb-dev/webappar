/**
 * Mapping from WooCommerce product slug to CDN texture URL.
 * Textures are seamless PNG tiles (min 2048×2048px) hosted on the Mattonflex CDN.
 *
 * During development, placeholder textures are generated client-side when CDN
 * textures are unavailable (CORS / not yet uploaded).
 */
export const TEXTURE_MAP: Record<string, string> = {
  'mattone-rivestimento-flessibile-cuntry':
    'https://cdn.mattonflex.it/textures/cuntry.png',
  'mattone-rivestimento-flessibile-avorio':
    'https://cdn.mattonflex.it/textures/avorio.png',
  'mattone-rivestimento-flessibile-rosso':
    'https://cdn.mattonflex.it/textures/rosso.png',
  'mattone-rivestimento-flessibile-grigio':
    'https://cdn.mattonflex.it/textures/grigio.png',
  'mattone-rivestimento-flessibile-nero':
    'https://cdn.mattonflex.it/textures/nero.png',
  'mattone-rivestimento-flessibile-bianco':
    'https://cdn.mattonflex.it/textures/bianco.png',
};

/** Base colors used when generating placeholder brick textures in development */
export const TEXTURE_BASE_COLORS: Record<string, { brick: string; mortar: string }> = {
  'mattone-rivestimento-flessibile-cuntry':  { brick: '#c8956a', mortar: '#d4b89a' },
  'mattone-rivestimento-flessibile-avorio':  { brick: '#e8d5b0', mortar: '#f0e4cc' },
  'mattone-rivestimento-flessibile-rosso':   { brick: '#b84040', mortar: '#c87060' },
  'mattone-rivestimento-flessibile-grigio':  { brick: '#7a7a7a', mortar: '#a0a0a0' },
  'mattone-rivestimento-flessibile-nero':    { brick: '#2a2a2a', mortar: '#4a4a4a' },
  'mattone-rivestimento-flessibile-bianco':  { brick: '#e8e8e8', mortar: '#f5f5f5' },
};

export function getTextureUrl(slug: string): string {
  return TEXTURE_MAP[slug] ?? `https://picsum.photos/seed/${encodeURIComponent(slug)}/512/512`;
}

/**
 * Generate a procedural brick pattern texture as a canvas data URL.
 * Used as a development fallback when CDN textures are unreachable.
 */
export function generatePlaceholderTexture(slug: string, size = 512): string {
  if (typeof window === 'undefined') return '';

  const colors = TEXTURE_BASE_COLORS[slug] ?? { brick: '#a08060', mortar: '#c0a080' };
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Mortar background
  ctx.fillStyle = colors.mortar;
  ctx.fillRect(0, 0, size, size);

  const cols = 8;
  const rows = 16;
  const brickW = size / cols;
  const brickH = size / rows;
  const gap = Math.max(2, size / 128);

  for (let row = 0; row < rows; row++) {
    const offset = row % 2 === 0 ? 0 : brickW / 2;
    for (let col = -1; col <= cols; col++) {
      const x = col * brickW + offset + gap;
      const y = row * brickH + gap;
      const w = brickW - gap * 2;
      const h = brickH - gap * 2;

      // Base brick color with slight per-brick variation
      const variation = ((col * 13 + row * 7) % 20) - 10;
      ctx.fillStyle = shiftColor(colors.brick, variation);
      ctx.fillRect(x, y, w, h);

      // Subtle highlight on top edge
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x, y, w, 2);

      // Subtle shadow on bottom edge
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(x, y + h - 2, w, 2);
    }
  }

  return canvas.toDataURL('image/png');
}

function shiftColor(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  return `rgb(${clamp(r + amount)}, ${clamp(g + amount)}, ${clamp(b + amount)})`;
}
