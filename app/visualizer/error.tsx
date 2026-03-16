'use client';

import { useEffect } from 'react';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function VisualizerError({ error, reset }: Props) {
  useEffect(() => {
    console.error('[VisualizerPage] Error:', error);
  }, [error]);

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 bg-[var(--color-bg)] px-6 text-center">
      <div className="text-5xl">⚠️</div>

      <div>
        <h1 className="text-xl font-semibold">Qualcosa è andato storto</h1>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Non è stato possibile caricare il visualizzatore. Controlla la tua connessione e
          riprova.
        </p>

        {process.env.NODE_ENV === 'development' && (
          <p className="mt-3 rounded-lg bg-red-500/10 px-4 py-2 font-mono text-xs text-red-400">
            {error.message}
          </p>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-xl bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Riprova
        </button>
        <a
          href="https://mattonflex.it"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-2.5 text-sm font-semibold transition-colors hover:border-[var(--color-border-hover)]"
        >
          Vai al sito
        </a>
      </div>
    </div>
  );
}
