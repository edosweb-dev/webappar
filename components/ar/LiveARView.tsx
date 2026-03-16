'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import type { WooProduct, Point } from '@/types/product';
import {
  drawPerspective,
  createTiledCanvas,
  computeQuadDimensions,
  addWatermark,
  loadImage,
} from '@/lib/canvas-utils';
import { getTextureUrl, generatePlaceholderTexture } from '@/lib/textures';
import { ProductPicker } from './ProductSelector';

const HANDLE_RADIUS_CSS = 18; // px on screen

type DragMode = 'none' | 'draw' | 'handle';

interface VideoSize {
  width: number;
  height: number;
}

interface Props {
  selectedProduct: WooProduct;
  products: WooProduct[];
  onChangeProduct: (p: WooProduct) => void;
  onBack: () => void;
}

export default function LiveARView({ selectedProduct, products, onChangeProduct, onBack }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  // Texture & overlay — updated on product/wall change, read every frame via ref
  const textureImgRef = useRef<HTMLImageElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null); // pre-rendered perspective texture
  const lastSlugRef = useRef<string>('');

  // Wall selection — stored in ref for rAF loop, mirrored to state for React rendering
  const wallPtsRef = useRef<[Point, Point, Point, Point] | null>(null);
  const showSelectionRef = useRef(true);

  const [videoSize, setVideoSize] = useState<VideoSize | null>(null);
  const [wallPoints, setWallPoints] = useState<[Point, Point, Point, Point] | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [showSelection, setShowSelection] = useState(true);
  const [activeHandle, setActiveHandle] = useState(-1);
  const [dragMode, setDragMode] = useState<DragMode>('none');

  const dragStartRef = useRef<Point>({ x: 0, y: 0 });
  const dragModeRef = useRef<DragMode>('none');
  const activeHandleRef = useRef(-1);

  // Keep showSelectionRef in sync
  useEffect(() => { showSelectionRef.current = showSelection; }, [showSelection]);

  // ---------------------------------------------------------------------------
  // Camera startup / teardown
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let mounted = true;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        if (!mounted) { stream.getTracks().forEach((t) => t.stop()); return; }

        streamRef.current = stream;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();

        if (!mounted) return;
        setCameraReady(true);
      } catch (err) {
        if (!mounted) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('Permission') || msg.includes('NotAllowed')) {
          setCameraError('Accesso alla fotocamera negato. Abilita i permessi e riprova.');
        } else if (msg.includes('NotFound') || msg.includes('DevicesNotFound')) {
          setCameraError('Fotocamera non trovata su questo dispositivo.');
        } else {
          setCameraError(`Impossibile avviare la fotocamera: ${msg}`);
        }
      }
    }

    start();

    return () => {
      mounted = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Load texture (and rebuild overlay) when product changes
  // ---------------------------------------------------------------------------
  const rebuildOverlay = useCallback((img: HTMLImageElement, pts: [Point, Point, Point, Point] | null) => {
    if (!pts) return;
    const vs = videoSize ?? { width: img.width, height: img.height };
    if (!vs) return;

    const { width: wallW, height: wallH } = computeQuadDimensions(pts);
    if (wallW < 4 || wallH < 4) return;

    const tileFraction = Math.min(0.5, Math.max(0.15, 200 / wallW));
    const tiled = createTiledCanvas(img, Math.round(wallW), Math.round(wallH), tileFraction);

    const overlay = document.createElement('canvas');
    overlay.width = vs.width;
    overlay.height = vs.height;
    const ctx = overlay.getContext('2d')!;

    // White background ensures multiply-blend doesn't darken outside the wall area
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, vs.width, vs.height);

    drawPerspective(ctx, tiled, pts, 8);
    overlayRef.current = overlay;
  }, [videoSize]);

  useEffect(() => {
    const slug = selectedProduct.slug;
    if (slug === lastSlugRef.current && textureImgRef.current) {
      // Same texture already loaded — just rebuild overlay for new wall points
      rebuildOverlay(textureImgRef.current, wallPtsRef.current);
      return;
    }

    lastSlugRef.current = slug;
    overlayRef.current = null; // clear old overlay while loading

    loadImage(getTextureUrl(slug))
      .then((img) => {
        textureImgRef.current = img;
        rebuildOverlay(img, wallPtsRef.current);
      })
      .catch(() => {
        const placeholder = generatePlaceholderTexture(slug, 512);
        if (!placeholder) return;
        loadImage(placeholder).then((img) => {
          textureImgRef.current = img;
          rebuildOverlay(img, wallPtsRef.current);
        });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProduct.slug]);

  // Rebuild overlay when wall points change
  useEffect(() => {
    if (textureImgRef.current && wallPoints) {
      rebuildOverlay(textureImgRef.current, wallPoints);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallPoints]);

  // ---------------------------------------------------------------------------
  // Set default wall area once video dimensions are known
  // ---------------------------------------------------------------------------
  const initDefaultWall = useCallback((w: number, h: number) => {
    if (wallPtsRef.current) return;
    const m = 0.15;
    const pts: [Point, Point, Point, Point] = [
      { x: Math.round(w * m),       y: Math.round(h * m) },
      { x: Math.round(w * (1 - m)), y: Math.round(h * m) },
      { x: Math.round(w * (1 - m)), y: Math.round(h * (1 - m)) },
      { x: Math.round(w * m),       y: Math.round(h * (1 - m)) },
    ];
    wallPtsRef.current = pts;
    setWallPoints(pts);
  }, []);

  // ---------------------------------------------------------------------------
  // Render loop
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!cameraReady) return;

    const canvas = canvasRef.current!;
    const video = videoRef.current!;

    function renderFrame() {
      if (video.readyState < 2) { rafRef.current = requestAnimationFrame(renderFrame); return; }

      const vw = video.videoWidth;
      const vh = video.videoHeight;

      if (vw === 0 || vh === 0) { rafRef.current = requestAnimationFrame(renderFrame); return; }

      if (canvas.width !== vw || canvas.height !== vh) {
        canvas.width = vw;
        canvas.height = vh;
        setVideoSize({ width: vw, height: vh });
        initDefaultWall(vw, vh);
      }

      const ctx = canvas.getContext('2d', { alpha: false })!;

      // Layer 1: camera feed
      ctx.drawImage(video, 0, 0, vw, vh);

      // Layer 2: texture overlay (multiply blend)
      if (overlayRef.current) {
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.drawImage(overlayRef.current, 0, 0);
        ctx.restore();

        // slight screen boost to prevent over-darkening on dark walls
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.06;
        ctx.drawImage(overlayRef.current, 0, 0);
        ctx.restore();
      }

      // Layer 3: selection UI
      if (showSelectionRef.current && wallPtsRef.current) {
        drawSelectionOverlay(ctx, wallPtsRef.current, activeHandleRef.current, vw, vh);
      }

      rafRef.current = requestAnimationFrame(renderFrame);
    }

    rafRef.current = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraReady]);

  // ---------------------------------------------------------------------------
  // Coordinate helpers
  // ---------------------------------------------------------------------------
  const toVideoCoords = useCallback(
    (clientX: number, clientY: number): Point => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return {
        x: Math.round(((clientX - rect.left) / rect.width) * canvas.width),
        y: Math.round(((clientY - rect.top) / rect.height) * canvas.height),
      };
    },
    []
  );

  const getHandleRadius = useCallback((): number => {
    const canvas = canvasRef.current;
    if (!canvas || !videoSize) return 30;
    const rect = canvas.getBoundingClientRect();
    return HANDLE_RADIUS_CSS * (videoSize.width / rect.width);
  }, [videoSize]);

  const hitTestHandle = useCallback(
    (pt: Point): number => {
      const pts = wallPtsRef.current;
      if (!pts) return -1;
      const r = getHandleRadius();
      for (let i = 0; i < pts.length; i++) {
        const dx = pt.x - pts[i].x;
        const dy = pt.y - pts[i].y;
        if (Math.sqrt(dx * dx + dy * dy) <= r) return i;
      }
      return -1;
    },
    [getHandleRadius]
  );

  // ---------------------------------------------------------------------------
  // Pointer / touch interaction
  // ---------------------------------------------------------------------------
  const handlePointerDown = useCallback(
    (clientX: number, clientY: number) => {
      const pt = toVideoCoords(clientX, clientY);
      const handle = hitTestHandle(pt);

      if (handle !== -1) {
        dragModeRef.current = 'handle';
        activeHandleRef.current = handle;
        setDragMode('handle');
        setActiveHandle(handle);
      } else {
        dragModeRef.current = 'draw';
        dragStartRef.current = pt;
        setDragMode('draw');
        setActiveHandle(-1);
        activeHandleRef.current = -1;
        const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
        const w = videoSize?.width ?? 1280;
        const h = videoSize?.height ?? 720;
        const pts: [Point, Point, Point, Point] = [
          { x: clamp(pt.x, w), y: clamp(pt.y, h) },
          { x: clamp(pt.x, w), y: clamp(pt.y, h) },
          { x: clamp(pt.x, w), y: clamp(pt.y, h) },
          { x: clamp(pt.x, w), y: clamp(pt.y, h) },
        ];
        wallPtsRef.current = pts;
        setWallPoints(pts);
      }
    },
    [toVideoCoords, hitTestHandle, videoSize]
  );

  const handlePointerMove = useCallback(
    (clientX: number, clientY: number) => {
      if (dragModeRef.current === 'none') return;
      const pt = toVideoCoords(clientX, clientY);
      const w = videoSize?.width ?? 1280;
      const h = videoSize?.height ?? 720;
      const clampX = (x: number) => Math.max(0, Math.min(w, x));
      const clampY = (y: number) => Math.max(0, Math.min(h, y));

      if (dragModeRef.current === 'draw') {
        const ds = dragStartRef.current;
        const x0 = clampX(Math.min(ds.x, pt.x));
        const y0 = clampY(Math.min(ds.y, pt.y));
        const x1 = clampX(Math.max(ds.x, pt.x));
        const y1 = clampY(Math.max(ds.y, pt.y));
        const pts: [Point, Point, Point, Point] = [
          { x: x0, y: y0 },
          { x: x1, y: y0 },
          { x: x1, y: y1 },
          { x: x0, y: y1 },
        ];
        wallPtsRef.current = pts;
        setWallPoints(pts);
      } else if (dragModeRef.current === 'handle' && wallPtsRef.current) {
        const idx = activeHandleRef.current;
        const newPts = [...wallPtsRef.current] as [Point, Point, Point, Point];
        newPts[idx] = { x: clampX(pt.x), y: clampY(pt.y) };
        wallPtsRef.current = newPts;
        setWallPoints(newPts);
      }
    },
    [toVideoCoords, videoSize]
  );

  const handlePointerUp = useCallback(() => {
    dragModeRef.current = 'none';
    setDragMode('none');
    setActiveHandle(-1);
    activeHandleRef.current = -1;
  }, []);

  // ---------------------------------------------------------------------------
  // Screenshot
  // ---------------------------------------------------------------------------
  const handleSave = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const copy = document.createElement('canvas');
    copy.width = canvas.width;
    copy.height = canvas.height;
    const ctx = copy.getContext('2d')!;
    ctx.drawImage(canvas, 0, 0);
    addWatermark(ctx, copy.width, copy.height);

    const a = document.createElement('a');
    a.href = copy.toDataURL('image/jpeg', 0.92);
    a.download = `mattonflex-${selectedProduct.slug}.jpg`;
    a.click();
  }, [selectedProduct.slug]);

  const handleShare = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const copy = document.createElement('canvas');
    copy.width = canvas.width;
    copy.height = canvas.height;
    const ctx = copy.getContext('2d')!;
    ctx.drawImage(canvas, 0, 0);
    addWatermark(ctx, copy.width, copy.height);
    const dataUrl = copy.toDataURL('image/jpeg', 0.92);

    if (navigator.share) {
      try {
        const blob = await fetch(dataUrl).then((r) => r.blob());
        const file = new File([blob], 'mattonflex-preview.jpg', { type: 'image/jpeg' });
        await navigator.share({ title: 'Mattonflex Visualizer', files: [file] });
        return;
      } catch { /* fall through */ }
    }
    await navigator.clipboard.writeText(window.location.href).catch(() => {});
  }, []);

  const handleBuy = useCallback(() => {
    window.open(selectedProduct.permalink, '_blank', 'noopener,noreferrer');
  }, [selectedProduct.permalink]);

  // ---------------------------------------------------------------------------
  // Camera error screen
  // ---------------------------------------------------------------------------
  if (cameraError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 bg-[var(--color-bg)] px-6 text-center">
        <div className="text-5xl">📷</div>
        <div>
          <h2 className="text-lg font-semibold">Fotocamera non disponibile</h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">{cameraError}</p>
        </div>
        <button
          onClick={onBack}
          className="rounded-xl bg-[var(--color-primary)] px-6 py-3 text-sm font-semibold text-white"
        >
          Torna indietro
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------
  return (
    <div className="relative flex h-full overflow-hidden bg-black">
      {/* Hidden video source */}
      <video
        ref={videoRef}
        className="hidden"
        playsInline
        muted
        autoPlay
        aria-hidden="true"
      />

      {/* Main canvas: camera feed + texture overlay + selection UI */}
      <canvas
        ref={canvasRef}
        className="no-select h-full w-full object-contain"
        style={{ touchAction: 'none' }}
        onMouseDown={(e) => { e.preventDefault(); handlePointerDown(e.clientX, e.clientY); }}
        onMouseMove={(e) => handlePointerMove(e.clientX, e.clientY)}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        onTouchStart={(e) => { const t = e.touches[0]; handlePointerDown(t.clientX, t.clientY); }}
        onTouchMove={(e) => { e.preventDefault(); const t = e.touches[0]; handlePointerMove(t.clientX, t.clientY); }}
        onTouchEnd={handlePointerUp}
      />

      {/* Camera loading spinner */}
      {!cameraReady && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80">
          <SpinnerIcon className="h-8 w-8 animate-spin text-white" />
          <p className="text-sm text-white/70">Avvio fotocamera…</p>
        </div>
      )}

      {/* Top bar */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 flex items-start justify-between p-3 sm:p-4">
        <button
          onClick={onBack}
          className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-xl bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
          aria-label="Torna indietro"
        >
          <ArrowLeftIcon />
        </button>

        {/* Toggle selection UI */}
        <button
          onClick={() => setShowSelection((v) => !v)}
          className={`pointer-events-auto flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-white backdrop-blur-sm transition-colors ${
            showSelection ? 'bg-white/20 ring-1 ring-white/30' : 'bg-black/40'
          }`}
          aria-label={showSelection ? 'Nascondi selezione area' : 'Mostra selezione area'}
        >
          <GridIcon />
          {showSelection ? 'Nascondi area' : 'Mostra area'}
        </button>
      </div>

      {/* Right-side action buttons */}
      <div className="pointer-events-none absolute right-3 top-16 flex flex-col gap-2 sm:right-4 sm:top-20">
        <FloatingButton onClick={handleSave} label="Salva" icon={<DownloadIcon />} primary />
        <FloatingButton onClick={handleShare} label="Condividi" icon={<ShareIcon />} />
      </div>

      {/* Product price tooltip — bottom-left, above the product picker */}
      <div className="pointer-events-none absolute bottom-24 left-3 sm:bottom-6 sm:left-4">
        <ProductTooltip product={selectedProduct} onBuy={handleBuy} />
      </div>

      {/* Hint: shown briefly when no selection has been made by user */}
      {cameraReady && !dragMode && showSelection && wallPoints && (
        <div className="pointer-events-none absolute bottom-28 left-1/2 -translate-x-1/2 sm:bottom-6">
          <div className="rounded-full bg-black/60 px-4 py-2 text-xs text-white backdrop-blur-sm">
            Trascina per ridefinire l&apos;area · sposta gli angoli per regolare
          </div>
        </div>
      )}

      {/* Product picker (bottom sheet on mobile, sidebar on desktop) */}
      <div className="pointer-events-none absolute inset-0 sm:hidden">
        <ProductPicker
          products={products}
          selectedProduct={selectedProduct}
          onSelect={onChangeProduct}
        />
      </div>
      <div className="pointer-events-auto hidden h-full w-64 flex-shrink-0 sm:flex" style={{ position: 'absolute', right: 0, top: 0, height: '100%' }}>
        <ProductPicker
          products={products}
          selectedProduct={selectedProduct}
          onSelect={onChangeProduct}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Draw selection overlay directly onto the main canvas
// ---------------------------------------------------------------------------
function drawSelectionOverlay(
  ctx: CanvasRenderingContext2D,
  pts: [Point, Point, Point, Point],
  activeHandle: number,
  vw: number,
  vh: number
) {
  // Dim outside
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, vw, vh);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  ctx.lineTo(pts[1].x, pts[1].y);
  ctx.lineTo(pts[2].x, pts[2].y);
  ctx.lineTo(pts[3].x, pts[3].y);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();

  // Border
  const dash = Math.round(vw / 50);
  ctx.save();
  ctx.setLineDash([dash, Math.round(dash / 2)]);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = Math.max(2, Math.round(vw / 400));
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  ctx.lineTo(pts[1].x, pts[1].y);
  ctx.lineTo(pts[2].x, pts[2].y);
  ctx.lineTo(pts[3].x, pts[3].y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  // Corner handles
  const r = Math.max(10, Math.round(vw / 70));
  pts.forEach((pt, i) => {
    ctx.save();
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
    ctx.fillStyle = i === activeHandle ? '#2563eb' : 'white';
    ctx.fill();
    ctx.strokeStyle = i === activeHandle ? 'white' : 'rgba(0,0,0,0.4)';
    ctx.lineWidth = Math.max(1.5, r / 5);
    ctx.stroke();
    ctx.restore();
  });
}

// ---------------------------------------------------------------------------
// Price tooltip
// ---------------------------------------------------------------------------

function formatPrice(raw: string): string {
  const n = parseFloat(raw);
  if (!raw || isNaN(n) || n === 0) return '';
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
}

interface TooltipProps {
  product: WooProduct;
  onBuy: () => void;
}

function ProductTooltip({ product, onBuy }: TooltipProps) {
  const [imgError, setImgError] = useState(false);
  const price = formatPrice(product.price);
  const regularPrice = formatPrice(product.regular_price);
  const isOnSale = product.sale_price && parseFloat(product.sale_price) > 0 && product.sale_price !== product.regular_price;

  if (!price) return null;

  return (
    <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-white/15 bg-black/65 px-3 py-2.5 shadow-2xl backdrop-blur-md animate-fade-in">
      {/* Product thumbnail */}
      {product.images[0]?.src && !imgError ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.images[0].src}
          alt={product.name}
          className="h-12 w-12 flex-shrink-0 rounded-xl object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-white/10 text-xl">
          🧱
        </div>
      )}

      {/* Info */}
      <div className="min-w-0">
        <p className="max-w-[130px] truncate text-xs text-white/70">{product.name}</p>
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <span className="text-base font-bold text-white">{price}</span>
          {isOnSale && regularPrice && (
            <span className="text-xs text-white/50 line-through">{regularPrice}</span>
          )}
        </div>
        <p className="text-[10px] text-white/50">al m²</p>
      </div>

      {/* Buy CTA */}
      <button
        onClick={onBuy}
        className="ml-1 flex-shrink-0 rounded-xl bg-[var(--color-accent)] px-3 py-2 text-xs font-bold text-black shadow-lg transition-transform active:scale-95"
      >
        Acquista
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
interface FBProps { onClick: () => void; label: string; icon: React.ReactNode; primary?: boolean; accent?: boolean; }
function FloatingButton({ onClick, label, icon, primary, accent }: FBProps) {
  let cls = 'pointer-events-auto flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold shadow-lg backdrop-blur-md transition-all active:scale-95 ';
  if (primary) cls += 'bg-[var(--color-primary)] text-white shadow-blue-500/20';
  else if (accent) cls += 'bg-[var(--color-accent)] text-black shadow-amber-500/20';
  else cls += 'bg-white/15 text-white border border-white/20';
  return (
    <button onClick={onClick} className={cls} aria-label={label}>
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------
function ArrowLeftIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>;
}
function GridIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>;
}
function DownloadIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
}
function ShareIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>;
}
function BagIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>;
}
function SpinnerIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>;
}
