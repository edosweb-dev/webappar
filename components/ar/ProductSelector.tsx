'use client';

import { useState } from 'react';
import type { WooProduct } from '@/types/product';

// ---------------------------------------------------------------------------
// Full-page product selector (Step 1 — no URL parameter)
// ---------------------------------------------------------------------------
interface ProductSelectorPageProps {
  products: WooProduct[];
  onSelect: (product: WooProduct) => void;
}

export function ProductSelectorPage({ products, onSelect }: ProductSelectorPageProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--color-bg)]">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-[var(--color-border)] px-4 py-4">
        <div className="mx-auto max-w-2xl">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-2xl">🧱</span>
            <h1 className="text-lg font-bold tracking-tight">Mattonflex Visualizer</h1>
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">
            Scegli la colorazione da visualizzare sulla tua parete
          </p>
        </div>
      </header>

      {/* Products grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-4">
          {products.length === 0 ? (
            <ProductGridSkeleton />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} onSelect={onSelect} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductCard({
  product,
  onSelect,
}: {
  product: WooProduct;
  onSelect: (p: WooProduct) => void;
}) {
  const [imgError, setImgError] = useState(false);
  const imgSrc = imgError ? null : product.images[0]?.src;

  return (
    <button
      onClick={() => onSelect(product)}
      className="group flex flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] text-left transition-all hover:border-[var(--color-primary)] hover:shadow-lg hover:shadow-blue-500/10 active:scale-[0.98]"
    >
      {/* Image */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--color-surface-2)]">
        {imgSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imgSrc}
            alt={product.images[0]?.alt || product.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-3xl">🧱</div>
        )}
        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      </div>

      {/* Product name */}
      <div className="px-3 py-3">
        <p className="line-clamp-2 text-sm font-medium leading-snug">{product.name}</p>
        <div className="mt-2 flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)] opacity-0 transition-opacity group-hover:opacity-100">
          Visualizza
          <ChevronRightIcon />
        </div>
      </div>
    </button>
  );
}

function ProductGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-[var(--color-border)]">
          <div className="skeleton aspect-[4/3] w-full" />
          <div className="px-3 py-3">
            <div className="skeleton h-4 w-3/4 rounded" />
            <div className="skeleton mt-2 h-3 w-1/2 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bottom sheet / sidebar product picker (Step 4 — AR view)
// ---------------------------------------------------------------------------
interface ProductPickerProps {
  products: WooProduct[];
  selectedProduct: WooProduct;
  onSelect: (product: WooProduct) => void;
}

export function ProductPicker({ products, selectedProduct, onSelect }: ProductPickerProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      {/* Mobile bottom sheet */}
      <div
        className={`pointer-events-auto fixed bottom-0 left-0 right-0 z-30 sm:hidden bottom-sheet ${
          isExpanded ? 'translate-y-0' : 'translate-y-[calc(100%-80px)]'
        }`}
      >
        {/* Handle bar */}
        <button
          onClick={() => setIsExpanded((v) => !v)}
          className="flex w-full flex-col items-center rounded-t-3xl border-t border-[var(--color-border)] bg-[var(--color-surface)] pb-4 pt-3"
          aria-label={isExpanded ? 'Chiudi selettore colorazioni' : 'Apri selettore colorazioni'}
        >
          <div className="mb-2 h-1 w-10 rounded-full bg-[var(--color-border-hover)]" />
          <div className="flex w-full items-center justify-between px-5">
            <div className="flex items-center gap-3">
              {/* Selected product thumbnail */}
              <ProductThumb product={selectedProduct} size={40} />
              <div className="text-left">
                <p className="text-xs text-[var(--color-text-muted)]">Colorazione</p>
                <p className="max-w-[180px] truncate text-sm font-semibold">
                  {selectedProduct.name}
                </p>
              </div>
            </div>
            <ChevronIcon up={isExpanded} />
          </div>
        </button>

        {/* Scrollable product list */}
        <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 pb-safe-area-inset-bottom pb-6 pt-4">
          <div className="flex gap-3 overflow-x-auto pb-1">
            {products.map((product) => (
              <button
                key={product.id}
                onClick={() => { onSelect(product); setIsExpanded(false); }}
                className={`flex flex-shrink-0 flex-col items-center gap-2 rounded-xl p-2 transition-colors ${
                  product.id === selectedProduct.id
                    ? 'bg-[var(--color-primary)]/15 ring-2 ring-[var(--color-primary)]'
                    : 'hover:bg-[var(--color-surface-2)]'
                }`}
              >
                <ProductThumb product={product} size={52} />
                <span className="max-w-[64px] text-center text-[10px] leading-tight">
                  {getShortName(product.name)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="pointer-events-auto hidden h-full w-64 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)] sm:flex">
        <div className="flex-shrink-0 border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            Colorazioni
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {products.map((product) => (
            <button
              key={product.id}
              onClick={() => onSelect(product)}
              className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors ${
                product.id === selectedProduct.id
                  ? 'bg-[var(--color-primary)]/15 ring-1 ring-[var(--color-primary)]'
                  : 'hover:bg-[var(--color-surface-2)]'
              }`}
            >
              <ProductThumb product={product} size={44} />
              <span className="flex-1 text-sm leading-snug">{product.name}</span>
              {product.id === selectedProduct.id && (
                <CheckIcon className="h-4 w-4 flex-shrink-0 text-[var(--color-primary)]" />
              )}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function ProductThumb({ product, size }: { product: WooProduct; size: number }) {
  const [imgError, setImgError] = useState(false);
  const imgSrc = imgError ? null : product.images[0]?.src;

  return (
    <div
      style={{ width: size, height: size }}
      className="flex-shrink-0 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]"
    >
      {imgSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imgSrc}
          alt={product.name}
          width={size}
          height={size}
          className="h-full w-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-lg">🧱</div>
      )}
    </div>
  );
}

function getShortName(name: string): string {
  // Extract the color part after the last space
  const parts = name.split(' ');
  return parts[parts.length - 1] ?? name;
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function ChevronRightIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function ChevronIcon({ up }: { up: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`flex-shrink-0 transition-transform ${up ? 'rotate-180' : ''}`}
    >
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
