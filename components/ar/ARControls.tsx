'use client';

import { useState } from 'react';
import type { WooProduct } from '@/types/product';

interface Props {
  selectedProduct: WooProduct;
  onSave: () => void;
  onShare: () => void;
  onChangePhoto: () => void;
}

export default function ARControls({ selectedProduct, onSave, onShare, onChangePhoto }: Props) {
  const [shareStatus, setShareStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleShare = async () => {
    try {
      await onShare();
      setShareStatus('success');
      setTimeout(() => setShareStatus('idle'), 2000);
    } catch {
      setShareStatus('error');
      setTimeout(() => setShareStatus('idle'), 2000);
    }
  };

  const handleBuy = () => {
    window.open(selectedProduct.permalink, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="pointer-events-auto flex flex-col gap-2">
      {/* Save image */}
      <ControlButton
        onClick={onSave}
        label="Salva immagine"
        icon={<DownloadIcon />}
        primary
      />

      {/* Share */}
      <ControlButton
        onClick={handleShare}
        label={
          shareStatus === 'success'
            ? 'Link copiato!'
            : shareStatus === 'error'
            ? 'Errore condivisione'
            : 'Condividi'
        }
        icon={<ShareIcon />}
      />

      {/* Buy now */}
      <ControlButton
        onClick={handleBuy}
        label="Acquista ora"
        icon={<ShoppingBagIcon />}
        accent
      />

      {/* Change photo */}
      <ControlButton
        onClick={onChangePhoto}
        label="Cambia foto"
        icon={<RefreshIcon />}
        subtle
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Control button
// ---------------------------------------------------------------------------

interface ControlButtonProps {
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  primary?: boolean;
  accent?: boolean;
  subtle?: boolean;
}

function ControlButton({ onClick, label, icon, primary, accent, subtle }: ControlButtonProps) {
  let cls =
    'flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold shadow-lg backdrop-blur-md transition-all active:scale-95 ';

  if (primary) {
    cls +=
      'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] shadow-blue-500/20';
  } else if (accent) {
    cls +=
      'bg-[var(--color-accent)] text-black hover:bg-[var(--color-accent-hover)] shadow-amber-500/20';
  } else if (subtle) {
    cls +=
      'bg-white/10 text-white hover:bg-white/20 border border-white/20';
  } else {
    cls +=
      'bg-white/15 text-white hover:bg-white/25 border border-white/20';
  }

  return (
    <button onClick={onClick} className={cls} aria-label={label}>
      <span className="flex-shrink-0">{icon}</span>
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

function ShoppingBagIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 .49-4.5" />
    </svg>
  );
}
