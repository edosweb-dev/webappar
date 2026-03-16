'use client';

import { useState, useCallback } from 'react';
import type { WooProduct } from '@/types/product';
import { ProductSelectorPage } from './ProductSelector';
import LiveARView from './LiveARView';

type ARStep = 'select-product' | 'live-ar';

interface Props {
  products: WooProduct[];
  /** Pre-selected product slug from ?product= URL parameter */
  initialSlug: string | null;
}

export default function ARVisualizer({ products, initialSlug }: Props) {
  // If a valid slug is passed via URL, skip product selection entirely
  const initialProduct = initialSlug
    ? (products.find((p) => p.slug === initialSlug) ?? null)
    : null;

  const [step, setStep] = useState<ARStep>(initialProduct ? 'live-ar' : 'select-product');
  const [selectedProduct, setSelectedProduct] = useState<WooProduct | null>(
    initialProduct ?? products[0] ?? null
  );

  const handleProductSelect = useCallback((product: WooProduct) => {
    setSelectedProduct(product);
    setStep('live-ar');
  }, []);

  const handleBack = useCallback(() => {
    setStep('select-product');
  }, []);

  // ---------------------------------------------------------------------------
  // Step 1 — Choose a product (skipped when coming from QR code)
  // ---------------------------------------------------------------------------
  if (step === 'select-product') {
    return (
      <main className="h-full overflow-hidden">
        <ProductSelectorPage products={products} onSelect={handleProductSelect} />
      </main>
    );
  }

  // ---------------------------------------------------------------------------
  // Step 2 — Live camera AR view
  // ---------------------------------------------------------------------------
  return (
    <main className="h-full overflow-hidden">
      <LiveARView
        selectedProduct={selectedProduct!}
        products={products}
        onChangeProduct={setSelectedProduct}
        onBack={handleBack}
      />
    </main>
  );
}
