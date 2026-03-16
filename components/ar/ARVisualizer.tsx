'use client';

/**
 * ARVisualizer — top-level orchestrator
 *
 * Routing:
 *   Step 1: ProductSelectorPage   (skipped if ?product= slug is valid)
 *   Step 2: AR experience, chosen automatically:
 *            ├── WebXRARView  — if browser reports immersive-ar support (Android Chrome + ARCore)
 *            └── LiveARView   — fallback for all other browsers (iOS Safari, desktop, older Android)
 *
 * WebXR detection is deferred to the client; during SSR we render nothing
 * for the AR step to avoid hydration mismatches.
 */

import { useState, useCallback, useEffect } from 'react';
import type { WooProduct } from '@/types/product';
import { ProductSelectorPage } from './ProductSelector';
import LiveARView from './LiveARView';
import WebXRARView from './WebXRARView';

type ARStep = 'select-product' | 'ar';
type ARMode = 'unknown' | 'webxr' | 'canvas';

interface Props {
  products: WooProduct[];
  initialSlug: string | null;
}

export default function ARVisualizer({ products, initialSlug }: Props) {
  const initialProduct = initialSlug
    ? (products.find(p => p.slug === initialSlug) ?? null)
    : null;

  const [step, setStep]           = useState<ARStep>(initialProduct ? 'ar' : 'select-product');
  const [selectedProduct, setSelectedProduct] = useState<WooProduct | null>(
    initialProduct ?? products[0] ?? null
  );
  const [arMode, setArMode]       = useState<ARMode>('unknown');

  // ── Detect WebXR support once on the client ──────────────────────────────
  useEffect(() => {
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    if (!xr) { setArMode('canvas'); return; }
    xr.isSessionSupported('immersive-ar')
      .then(ok => setArMode(ok ? 'webxr' : 'canvas'))
      .catch(()  => setArMode('canvas'));
  }, []);

  const handleProductSelect = useCallback((p: WooProduct) => {
    setSelectedProduct(p);
    setStep('ar');
  }, []);

  const handleBack = useCallback(() => {
    setStep('select-product');
  }, []);

  // ── Step 1: product selection ─────────────────────────────────────────────
  if (step === 'select-product') {
    return (
      <main className="h-full overflow-hidden">
        <ProductSelectorPage products={products} onSelect={handleProductSelect} />
      </main>
    );
  }

  // ── Step 2: AR experience ─────────────────────────────────────────────────

  // Still detecting — render nothing to avoid flash
  if (arMode === 'unknown') {
    return (
      <div className="flex h-full items-center justify-center bg-black">
        <svg className="h-8 w-8 animate-spin text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      </div>
    );
  }

  const sharedProps = {
    selectedProduct: selectedProduct!,
    products,
    onChangeProduct: setSelectedProduct,
    onBack: handleBack,
  };

  return (
    <main className="h-full overflow-hidden">
      {arMode === 'webxr' ? (
        <WebXRARView {...sharedProps} />
      ) : (
        <LiveARView {...sharedProps} />
      )}
    </main>
  );
}
