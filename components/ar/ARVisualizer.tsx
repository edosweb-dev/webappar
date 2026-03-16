'use client';

import { useState, useRef, useCallback } from 'react';
import type { WooProduct, PhotoData, Point } from '@/types/product';
import { ProductSelectorPage, ProductPicker } from './ProductSelector';
import PhotoUploader from './PhotoUploader';
import WallSelector from './WallSelector';
import CanvasRenderer, { type CanvasRendererHandle } from './CanvasRenderer';
import ARControls from './ARControls';

type ARStep = 'select-product' | 'upload-photo' | 'select-area' | 'ar-view';

interface Props {
  products: WooProduct[];
  /** Pre-selected product slug from ?product= URL parameter */
  initialSlug: string | null;
}

export default function ARVisualizer({ products, initialSlug }: Props) {
  // ---------------------------------------------------------------------------
  // Initial state: skip product selection when a valid slug is provided via URL
  // ---------------------------------------------------------------------------
  const initialProduct = initialSlug
    ? (products.find((p) => p.slug === initialSlug) ?? null)
    : null;

  const [step, setStep] = useState<ARStep>(initialProduct ? 'upload-photo' : 'select-product');
  const [selectedProduct, setSelectedProduct] = useState<WooProduct | null>(
    initialProduct ?? (products[0] ?? null)
  );
  const [photo, setPhoto] = useState<PhotoData | null>(null);
  const [wallPoints, setWallPoints] = useState<[Point, Point, Point, Point] | null>(null);

  const canvasRendererRef = useRef<CanvasRendererHandle>(null);

  // ---------------------------------------------------------------------------
  // Step navigation handlers
  // ---------------------------------------------------------------------------
  const handleProductSelect = useCallback((product: WooProduct) => {
    setSelectedProduct(product);
    setStep('upload-photo');
  }, []);

  const handlePhotoUpload = useCallback((p: PhotoData) => {
    setPhoto(p);
    setStep('select-area');
  }, []);

  const handleAreaConfirm = useCallback((pts: [Point, Point, Point, Point]) => {
    setWallPoints(pts);
    setStep('ar-view');
  }, []);

  const handleChangePhoto = useCallback(() => {
    setStep('upload-photo');
  }, []);

  const handleBackFromPhoto = useCallback(() => {
    setStep('select-product');
  }, []);

  const handleBackFromArea = useCallback(() => {
    setStep('upload-photo');
  }, []);

  // ---------------------------------------------------------------------------
  // AR view actions
  // ---------------------------------------------------------------------------
  const handleSave = useCallback(() => {
    const dataUrl = canvasRendererRef.current?.getJpegWithWatermark();
    if (!dataUrl) return;

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `mattonflex-preview-${selectedProduct?.slug ?? 'render'}.jpg`;
    a.click();
  }, [selectedProduct]);

  const handleShare = useCallback(async () => {
    const dataUrl = canvasRendererRef.current?.getJpegWithWatermark();

    if (navigator.share && dataUrl) {
      // Try native share with image
      const blob = await dataUrlToBlob(dataUrl);
      const file = new File([blob], 'mattonflex-preview.jpg', { type: 'image/jpeg' });

      try {
        await navigator.share({
          title: 'Mattonflex Visualizer',
          text: `Guarda come starebbe ${selectedProduct?.name ?? 'questo pannello'} sulla mia parete!`,
          files: [file],
        });
        return;
      } catch {
        // fall through to URL share
      }
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Mattonflex Visualizer',
          url: window.location.href,
        });
        return;
      } catch {
        // fall through to clipboard
      }
    }

    // Fallback: copy current URL to clipboard
    await navigator.clipboard.writeText(window.location.href);
  }, [selectedProduct]);

  // ---------------------------------------------------------------------------
  // Step: Select product
  // ---------------------------------------------------------------------------
  if (step === 'select-product') {
    return (
      <main className="h-full overflow-hidden">
        <ProductSelectorPage products={products} onSelect={handleProductSelect} />
      </main>
    );
  }

  // ---------------------------------------------------------------------------
  // Step: Upload photo (selectedProduct is always set here)
  // ---------------------------------------------------------------------------
  if (step === 'upload-photo') {
    return (
      <main className="h-full overflow-hidden">
        <PhotoUploader
          selectedProduct={selectedProduct!}
          onUpload={handlePhotoUpload}
          onBack={handleBackFromPhoto}
        />
      </main>
    );
  }

  // ---------------------------------------------------------------------------
  // Step: Select wall area
  // ---------------------------------------------------------------------------
  if (step === 'select-area') {
    return (
      <main className="h-full overflow-hidden">
        <WallSelector
          photo={photo!}
          onConfirm={handleAreaConfirm}
          onBack={handleBackFromArea}
        />
      </main>
    );
  }

  // ---------------------------------------------------------------------------
  // Step: AR view
  // ---------------------------------------------------------------------------
  return (
    <main className="relative flex h-full overflow-hidden">
      {/* Canvas fills available space (desktop: minus sidebar) */}
      <div className="relative flex-1 overflow-hidden">
        <CanvasRenderer
          ref={canvasRendererRef}
          photo={photo!}
          wallPoints={wallPoints!}
          selectedProduct={selectedProduct!}
        />

        {/* Floating controls — top right */}
        <div className="absolute right-3 top-3 flex flex-col gap-2 sm:right-4 sm:top-4">
          <ARControls
            selectedProduct={selectedProduct!}
            onSave={handleSave}
            onShare={handleShare}
            onChangePhoto={handleChangePhoto}
          />
        </div>

        {/* Back button — top left */}
        <button
          onClick={handleBackFromArea}
          className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-xl bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70 sm:left-4 sm:top-4"
          aria-label="Torna alla selezione area"
        >
          <ArrowLeftIcon />
        </button>

        {/* Step indicator pill */}
        <div className="absolute left-1/2 top-3 -translate-x-1/2">
          <StepPill step={4} />
        </div>
      </div>

      {/* Desktop sidebar product picker */}
      <div className="hidden flex-shrink-0 sm:flex">
        <ProductPicker
          products={products}
          selectedProduct={selectedProduct!}
          onSelect={setSelectedProduct}
        />
      </div>

      {/* Mobile bottom sheet product picker */}
      <div className="pointer-events-none absolute inset-0 sm:hidden">
        <ProductPicker
          products={products}
          selectedProduct={selectedProduct!}
          onSelect={setSelectedProduct}
        />
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Step progress pill (shown in AR view)
// ---------------------------------------------------------------------------
function StepPill({ step }: { step: number }) {
  const steps = [
    { n: 1, label: 'Prodotto' },
    { n: 2, label: 'Foto' },
    { n: 3, label: 'Area' },
    { n: 4, label: 'Visualizza' },
  ];

  return (
    <div className="flex items-center gap-1 rounded-full bg-black/60 px-3 py-1.5 backdrop-blur-sm">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center gap-1">
          {i > 0 && <div className="h-px w-3 bg-white/30" />}
          <div
            className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
              s.n < step
                ? 'bg-[var(--color-primary)] text-white'
                : s.n === step
                ? 'bg-white text-black'
                : 'bg-white/20 text-white/50'
            }`}
          >
            {s.n < step ? '✓' : s.n}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------
function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return fetch(dataUrl).then((r) => r.blob());
}

function ArrowLeftIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 12H5M12 5l-7 7 7 7" />
    </svg>
  );
}
