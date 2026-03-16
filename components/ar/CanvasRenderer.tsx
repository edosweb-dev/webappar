'use client';

import {
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useCallback,
  useState,
} from 'react';
import type { WooProduct, PhotoData, Point } from '@/types/product';
import {
  drawPerspective,
  createTiledCanvas,
  computeQuadDimensions,
  addWatermark,
  loadImage,
} from '@/lib/canvas-utils';
import { getTextureUrl, generatePlaceholderTexture } from '@/lib/textures';

export interface CanvasRendererHandle {
  /** Returns the canvas as a JPG data URL with watermark applied */
  getJpegWithWatermark(): string | null;
}

interface Props {
  photo: PhotoData;
  wallPoints: [Point, Point, Point, Point];
  selectedProduct: WooProduct;
}

const CanvasRenderer = forwardRef<CanvasRendererHandle, Props>(function CanvasRenderer(
  { photo, wallPoints, selectedProduct },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const photoImgRef = useRef<HTMLImageElement | null>(null);
  const textureImgRef = useRef<HTMLImageElement | null>(null);
  const lastTextureSlugRef = useRef<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const renderPending = useRef(false);

  // ---------------------------------------------------------------------------
  // Expose download helper via ref
  // ---------------------------------------------------------------------------
  useImperativeHandle(ref, () => ({
    getJpegWithWatermark() {
      const canvas = canvasRef.current;
      if (!canvas) return null;

      // Create a copy canvas so we don't mutate the visible one
      const copy = document.createElement('canvas');
      copy.width = canvas.width;
      copy.height = canvas.height;
      const ctx = copy.getContext('2d')!;
      ctx.drawImage(canvas, 0, 0);
      addWatermark(ctx, copy.width, copy.height);

      return copy.toDataURL('image/jpeg', 0.92);
    },
  }));

  // ---------------------------------------------------------------------------
  // Core render function
  // ---------------------------------------------------------------------------
  const render = useCallback(async () => {
    const canvas = canvasRef.current;
    const photoImg = photoImgRef.current;
    const textureImg = textureImgRef.current;
    if (!canvas || !photoImg || !textureImg) return;

    setIsRendering(true);
    setRenderError(null);

    try {
      const { width: W, height: H } = photo;
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d')!;

      // 1. Draw the original photo as background
      ctx.drawImage(photoImg, 0, 0, W, H);

      // 2. Compute wall area dimensions for tiling
      const { width: wallW, height: wallH } = computeQuadDimensions(wallPoints);
      const tileFraction = Math.min(0.5, Math.max(0.15, 200 / wallW));

      // 3. Create tiled texture canvas
      const tiled = createTiledCanvas(textureImg, Math.round(wallW), Math.round(wallH), tileFraction);

      // 4. Overlay the tiled texture with perspective transform + multiply blend
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      drawPerspective(ctx, tiled, wallPoints, 10);
      ctx.restore();

      // 5. Lighten slightly so multiply doesn't make dark walls too dark
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.08;
      drawPerspective(ctx, tiled, wallPoints, 4);
      ctx.restore();
    } catch (err) {
      console.error('[CanvasRenderer] Render error:', err);
      setRenderError('Errore durante il rendering. Riprova.');
    } finally {
      setIsRendering(false);
      renderPending.current = false;
    }
  }, [photo, wallPoints]);

  // ---------------------------------------------------------------------------
  // Load photo image (once)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (photoImgRef.current) {
      // Photo already loaded; just trigger render
      if (textureImgRef.current) render();
      return;
    }

    loadImage(photo.dataUrl)
      .then((img) => {
        photoImgRef.current = img;
        if (textureImgRef.current) render();
      })
      .catch(() => setRenderError("Impossibile caricare la foto."));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo.dataUrl]);

  // ---------------------------------------------------------------------------
  // Load texture image and re-render when product changes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const slug = selectedProduct.slug;
    if (slug === lastTextureSlugRef.current && textureImgRef.current) {
      // Same texture already loaded → just re-render (wall points may have changed)
      if (photoImgRef.current) render();
      return;
    }

    lastTextureSlugRef.current = slug;
    const url = getTextureUrl(slug);

    loadImage(url)
      .then((img) => {
        textureImgRef.current = img;
        if (photoImgRef.current) render();
      })
      .catch(() => {
        // CDN unavailable — generate a placeholder texture
        const placeholderDataUrl = generatePlaceholderTexture(slug, 512);
        if (!placeholderDataUrl) {
          setRenderError('Texture non disponibile.');
          return;
        }
        loadImage(placeholderDataUrl)
          .then((img) => {
            textureImgRef.current = img;
            if (photoImgRef.current) render();
          })
          .catch(() => setRenderError('Texture non disponibile.'));
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProduct.slug]);

  // Re-render when wall points change (but not photo/texture reload)
  useEffect(() => {
    if (photoImgRef.current && textureImgRef.current) {
      render();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallPoints]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <canvas
        ref={canvasRef}
        className="h-full w-full object-contain"
        style={{ display: 'block' }}
        aria-label="Anteprima AR parete con texture Mattonflex"
      />

      {/* Rendering overlay */}
      {isRendering && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="flex items-center gap-2 rounded-xl bg-black/70 px-4 py-2.5 text-sm text-white backdrop-blur-sm">
            <SpinnerIcon className="h-4 w-4 animate-spin" />
            Applicazione texture…
          </div>
        </div>
      )}

      {/* Error overlay */}
      {renderError && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-xl bg-red-600/90 px-4 py-2 text-sm text-white shadow-lg">
          {renderError}
        </div>
      )}
    </div>
  );
});

export default CanvasRenderer;

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
