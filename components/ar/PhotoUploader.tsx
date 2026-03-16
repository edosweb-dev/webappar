'use client';

import { useRef, useState, useCallback } from 'react';
import type { WooProduct, PhotoData } from '@/types/product';

interface Props {
  selectedProduct: WooProduct;
  onUpload: (photo: PhotoData) => void;
  onBack: () => void;
}

const MAX_FILE_SIZE_MB = 10;
const MAX_CANVAS_SIZE = 2400; // Downsample large photos to this max dimension

export default function PhotoUploader({ selectedProduct, onUpload, onBack }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const processFile = useCallback(
    async (file: File) => {
      setError(null);

      if (!file.type.startsWith('image/')) {
        setError('Formato non supportato. Usa JPG o PNG.');
        return;
      }

      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        setError(`Immagine troppo grande. Massimo ${MAX_FILE_SIZE_MB}MB.`);
        return;
      }

      setIsProcessing(true);

      try {
        const dataUrl = await readFileAsDataUrl(file);
        const { dataUrl: resizedUrl, width, height } = await resizeImage(dataUrl);
        onUpload({ dataUrl: resizedUrl, width, height });
      } catch {
        setError("Impossibile leggere l'immagine. Riprova.");
      } finally {
        setIsProcessing(false);
      }
    },
    [onUpload]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg)]">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
        <button
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
          aria-label="Torna alla selezione prodotto"
        >
          <ArrowLeftIcon />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-[var(--color-text-muted)]">Prodotto selezionato</p>
          <p className="truncate text-sm font-medium">{selectedProduct.name}</p>
        </div>
        {/* Product thumbnail */}
        {selectedProduct.images[0]?.src && (
          <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg border border-[var(--color-border)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedProduct.images[0].src}
              alt={selectedProduct.images[0].alt || selectedProduct.name}
              className="h-full w-full object-cover"
            />
          </div>
        )}
      </header>

      {/* Content */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-8">
        <div className="text-center">
          <div className="mb-3 text-4xl">📸</div>
          <h1 className="text-xl font-semibold">Fotografa la tua parete</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Scatta una foto oppure carica un&apos;immagine dalla galleria
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="flex w-full max-w-sm items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            <span className="flex-shrink-0">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Mobile: Camera first, then gallery */}
        <div className="flex w-full max-w-sm flex-col gap-3 sm:hidden">
          <button
            onClick={() => cameraInputRef.current?.click()}
            disabled={isProcessing}
            className="flex items-center justify-center gap-3 rounded-2xl bg-[var(--color-primary)] px-6 py-4 text-base font-semibold text-white transition-opacity disabled:opacity-50 active:opacity-80"
          >
            <CameraIcon />
            Scatta foto
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="flex items-center justify-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-4 text-base font-semibold text-[var(--color-text)] transition-colors disabled:opacity-50 active:opacity-80"
          >
            <GalleryIcon />
            Carica dalla libreria
          </button>
        </div>

        {/* Desktop: drag & drop area + buttons */}
        <div className="hidden w-full max-w-sm flex-col gap-4 sm:flex">
          {/* Drag & Drop zone */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-8 py-10 text-center transition-colors ${
              isDragging
                ? 'border-[var(--color-primary)] bg-blue-500/5'
                : 'border-[var(--color-border)] hover:border-[var(--color-border-hover)] hover:bg-[var(--color-surface)]'
            }`}
          >
            <UploadIcon className="h-8 w-8 text-[var(--color-text-muted)]" />
            <div>
              <p className="font-medium">Trascina qui la tua foto</p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                oppure clicca per sfogliare
              </p>
            </div>
            <p className="text-xs text-[var(--color-text-subtle)]">
              JPG, PNG · max {MAX_FILE_SIZE_MB}MB
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => cameraInputRef.current?.click()}
              disabled={isProcessing}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-medium transition-colors hover:border-[var(--color-border-hover)] disabled:opacity-50"
            >
              <CameraIcon />
              Fotocamera
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <GalleryIcon />
              Sfoglia file
            </button>
          </div>
        </div>

        {/* Processing spinner */}
        {isProcessing && (
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <SpinnerIcon className="h-4 w-4 animate-spin" />
            Elaborazione in corso…
          </div>
        )}

        {/* Constraints note */}
        <p className="text-xs text-[var(--color-text-subtle)]">
          Formati accettati: JPG, PNG · Dimensione massima: {MAX_FILE_SIZE_MB}MB
        </p>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={handleFileChange}
        aria-label="Carica foto dalla galleria"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
        aria-label="Scatta una foto"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function resizeImage(
  dataUrl: string
): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { naturalWidth: w, naturalHeight: h } = img;

      // Downsample if necessary
      if (w > MAX_CANVAS_SIZE || h > MAX_CANVAS_SIZE) {
        const scale = MAX_CANVAS_SIZE / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);

      resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.92), width: w, height: h });
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
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

function CameraIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function GalleryIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
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
