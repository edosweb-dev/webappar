'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import type { Point, PhotoData } from '@/types/product';
import { detectWallArea } from '@/lib/canvas-utils';

interface Props {
  photo: PhotoData;
  onConfirm: (points: [Point, Point, Point, Point]) => void;
  onBack: () => void;
}

type DragMode = 'none' | 'draw' | 'handle';
const HANDLE_RADIUS_CSS = 14; // px on screen

export default function WallSelector({ photo, onConfirm, onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const photoImgRef = useRef<HTMLImageElement | null>(null);

  // 4 points: [tl, tr, br, bl] in photo coordinates
  const [points, setPoints] = useState<[Point, Point, Point, Point] | null>(null);
  const [dragMode, setDragMode] = useState<DragMode>('none');
  const [activeHandle, setActiveHandle] = useState<number>(-1);
  const [dragStart, setDragStart] = useState<Point>({ x: 0, y: 0 });
  const [isAutoDetecting, setIsAutoDetecting] = useState(false);

  // ---------------------------------------------------------------------------
  // Load photo and run auto-detect on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      photoImgRef.current = img;
      autoDetect(img);
    };
    img.src = photo.dataUrl;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo.dataUrl]);

  const autoDetect = useCallback((img: HTMLImageElement) => {
    setIsAutoDetecting(true);
    // Run detection on a small downsampled canvas for performance
    const scale = Math.min(1, 400 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);

    const offscreen = document.createElement('canvas');
    offscreen.width = w;
    offscreen.height = h;
    const ctx = offscreen.getContext('2d')!;
    ctx.drawImage(img, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);

    const detected = detectWallArea(imageData, w, h);

    // Scale back to photo coordinates
    const scaled: [Point, Point, Point, Point] = detected.map((p) => ({
      x: Math.round(p.x / scale),
      y: Math.round(p.y / scale),
    })) as [Point, Point, Point, Point];

    setPoints(scaled);
    setIsAutoDetecting(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Draw overlay on canvas whenever points change
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = photoImgRef.current;
    if (!canvas || !img) return;

    canvas.width = photo.width;
    canvas.height = photo.height;
    const ctx = canvas.getContext('2d')!;

    // Draw photo
    ctx.drawImage(img, 0, 0, photo.width, photo.height);

    if (!points) return;

    // Dim outside selection
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, photo.width, photo.height);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    ctx.lineTo(points[2].x, points[2].y);
    ctx.lineTo(points[3].x, points[3].y);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // Selection border (dashed)
    ctx.save();
    ctx.setLineDash([Math.round(photo.width / 40), Math.round(photo.width / 80)]);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(2, Math.round(photo.width / 300));
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    ctx.lineTo(points[2].x, points[2].y);
    ctx.lineTo(points[3].x, points[3].y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // Corner handles
    const handleR = Math.max(8, Math.round(photo.width / 60));
    points.forEach((pt, i) => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, handleR, 0, Math.PI * 2);
      ctx.fillStyle = i === activeHandle ? 'var(--color-primary, #2563eb)' : 'white';
      ctx.fill();
      ctx.strokeStyle = i === activeHandle ? 'white' : 'rgba(0,0,0,0.4)';
      ctx.lineWidth = Math.max(1.5, handleR / 4);
      ctx.stroke();
      ctx.restore();
    });
  }, [points, photo.width, photo.height, activeHandle]);

  // ---------------------------------------------------------------------------
  // Coordinate conversion helpers
  // ---------------------------------------------------------------------------
  const toPhotoCoords = useCallback(
    (clientX: number, clientY: number): Point => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return {
        x: Math.round(((clientX - rect.left) / rect.width) * photo.width),
        y: Math.round(((clientY - rect.top) / rect.height) * photo.height),
      };
    },
    [photo.width, photo.height]
  );

  const getHandleRadius = useCallback((): number => {
    const canvas = canvasRef.current;
    if (!canvas) return 20;
    const rect = canvas.getBoundingClientRect();
    return HANDLE_RADIUS_CSS * (photo.width / rect.width);
  }, [photo.width]);

  const hitTestHandles = useCallback(
    (pt: Point): number => {
      if (!points) return -1;
      const r = getHandleRadius();
      for (let i = 0; i < points.length; i++) {
        const dx = pt.x - points[i].x;
        const dy = pt.y - points[i].y;
        if (Math.sqrt(dx * dx + dy * dy) <= r) return i;
      }
      return -1;
    },
    [points, getHandleRadius]
  );

  // ---------------------------------------------------------------------------
  // Pointer down
  // ---------------------------------------------------------------------------
  const handlePointerDown = useCallback(
    (clientX: number, clientY: number) => {
      const pt = toPhotoCoords(clientX, clientY);
      const handle = hitTestHandles(pt);

      if (handle !== -1) {
        setDragMode('handle');
        setActiveHandle(handle);
      } else {
        setDragMode('draw');
        setDragStart(pt);
        // Start new rectangle from scratch
        setPoints([pt, pt, pt, pt]);
      }
    },
    [toPhotoCoords, hitTestHandles]
  );

  // ---------------------------------------------------------------------------
  // Pointer move
  // ---------------------------------------------------------------------------
  const handlePointerMove = useCallback(
    (clientX: number, clientY: number) => {
      if (dragMode === 'none') return;
      const pt = toPhotoCoords(clientX, clientY);

      if (dragMode === 'draw') {
        const clampX = (x: number) => Math.max(0, Math.min(photo.width, x));
        const clampY = (y: number) => Math.max(0, Math.min(photo.height, y));
        const x0 = clampX(Math.min(dragStart.x, pt.x));
        const y0 = clampY(Math.min(dragStart.y, pt.y));
        const x1 = clampX(Math.max(dragStart.x, pt.x));
        const y1 = clampY(Math.max(dragStart.y, pt.y));
        setPoints([
          { x: x0, y: y0 },
          { x: x1, y: y0 },
          { x: x1, y: y1 },
          { x: x0, y: y1 },
        ]);
      } else if (dragMode === 'handle' && points) {
        const newPts = [...points] as [Point, Point, Point, Point];
        newPts[activeHandle] = {
          x: Math.max(0, Math.min(photo.width, pt.x)),
          y: Math.max(0, Math.min(photo.height, pt.y)),
        };
        setPoints(newPts);
      }
    },
    [dragMode, toPhotoCoords, dragStart, photo.width, photo.height, points, activeHandle]
  );

  // ---------------------------------------------------------------------------
  // Pointer up
  // ---------------------------------------------------------------------------
  const handlePointerUp = useCallback(() => {
    setDragMode('none');
    setActiveHandle(-1);
  }, []);

  // ---------------------------------------------------------------------------
  // Mouse handlers
  // ---------------------------------------------------------------------------
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    handlePointerDown(e.clientX, e.clientY);
  };
  const onMouseMove = (e: React.MouseEvent) => handlePointerMove(e.clientX, e.clientY);
  const onMouseUp = () => handlePointerUp();

  // ---------------------------------------------------------------------------
  // Touch handlers
  // ---------------------------------------------------------------------------
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    handlePointerDown(t.clientX, t.clientY);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    const t = e.touches[0];
    handlePointerMove(t.clientX, t.clientY);
  };
  const onTouchEnd = () => handlePointerUp();

  // ---------------------------------------------------------------------------
  // Confirm
  // ---------------------------------------------------------------------------
  const handleConfirm = () => {
    if (points) onConfirm(points);
  };

  const handleAutoDetect = () => {
    if (photoImgRef.current) autoDetect(photoImgRef.current);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--color-bg)]">
      {/* Header */}
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
        <button
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
          aria-label="Torna al caricamento foto"
        >
          <ArrowLeftIcon />
        </button>
        <div className="flex-1">
          <h1 className="text-sm font-semibold">Seleziona l&apos;area parete</h1>
          <p className="text-xs text-[var(--color-text-muted)]">
            Trascina per disegnare, sposta gli angoli per regolare
          </p>
        </div>
        <button
          onClick={handleAutoDetect}
          disabled={isAutoDetecting}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium transition-colors hover:border-[var(--color-border-hover)] disabled:opacity-50"
        >
          <AutoIcon />
          Auto
        </button>
      </header>

      {/* Canvas area */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
        {isAutoDetecting && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60">
            <div className="flex items-center gap-2 text-sm text-white">
              <SpinnerIcon className="h-5 w-5 animate-spin" />
              Rilevamento automatico…
            </div>
          </div>
        )}

        <canvas
          ref={canvasRef}
          className="no-select max-h-full max-w-full cursor-crosshair object-contain"
          style={{ touchAction: 'none' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        />

        {/* Hint overlay (shown when no selection) */}
        {!points && !isAutoDetecting && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="rounded-xl bg-black/70 px-4 py-3 text-center text-sm text-white backdrop-blur-sm">
              Trascina per selezionare l&apos;area parete
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex flex-shrink-0 items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <p className="text-xs text-[var(--color-text-muted)]">
          Sposta gli angoli per una selezione precisa
        </p>
        <button
          onClick={handleConfirm}
          disabled={!points}
          className="rounded-xl bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Conferma area
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function ArrowLeftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 5l-7 7 7 7" />
    </svg>
  );
}

function AutoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
