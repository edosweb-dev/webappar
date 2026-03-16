'use client';

/**
 * WebXRARView — Immersive AR experience using WebXR + Three.js
 *
 * Flow:
 *   1. Detect immersive-ar support (ARCore on Android Chrome, not yet on iOS Safari)
 *   2. If supported → show "Enter AR" button
 *   3. On tap → request XRSession with hit-test + dom-overlay features
 *   4. Render loop: camera passthrough + hit test reticle on detected surfaces
 *   5. User taps screen → place Mattonflex panel grid at reticle position
 *   6. DOM overlay: product switcher, price tooltip, controls
 *   7. If unsupported → parent falls back to LiveARView (canvas-based)
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import type { WooProduct } from '@/types/product';
import { getTextureUrl, generatePlaceholderTexture } from '@/lib/textures';
import { ProductPicker } from './ProductSelector';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Standard Mattonflex panel: 80 × 40 cm */
const PANEL_W = 0.80;
const PANEL_H = 0.40;

interface GridSize { cols: number; rows: number }
const GRID_PRESETS: GridSize[] = [
  { cols: 2, rows: 2 }, // 1.6 × 0.8 m
  { cols: 4, rows: 3 }, // 3.2 × 1.2 m  (default)
  { cols: 6, rows: 4 }, // 4.8 × 1.6 m
];
const DEFAULT_GRID = 1; // index into GRID_PRESETS

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type XRState = 'checking' | 'supported' | 'unsupported' | 'starting' | 'active' | 'error';

export interface WebXRARViewProps {
  selectedProduct: WooProduct;
  products: WooProduct[];
  onChangeProduct: (p: WooProduct) => void;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WebXRARView({
  selectedProduct,
  products,
  onChangeProduct,
  onBack,
}: WebXRARViewProps) {
  // ── DOM refs ──────────────────────────────────────────────────────────────
  const mountRef   = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // ── Three.js refs ─────────────────────────────────────────────────────────
  const rendererRef      = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef         = useRef<THREE.Scene | null>(null);
  const cameraRef        = useRef<THREE.PerspectiveCamera | null>(null);
  const reticleRef       = useRef<THREE.Mesh | null>(null);
  const panelMatRef      = useRef<THREE.MeshStandardMaterial | null>(null);
  const textureRef       = useRef<THREE.Texture | null>(null);
  const placedRef        = useRef<THREE.Mesh[]>([]);

  // ── WebXR refs (must not trigger re-renders) ──────────────────────────────
  const hitTestSrcRef        = useRef<XRHitTestSource | null>(null);
  const hitTestReqRef        = useRef(false);
  const reticleVisibleRef    = useRef(false);
  const sessionRef           = useRef<XRSession | null>(null);

  // ── React state (drives UI only) ─────────────────────────────────────────
  const [xrState,       setXrState]       = useState<XRState>('checking');
  const [errorMsg,      setErrorMsg]       = useState<string | null>(null);
  const [reticleVis,    setReticleVis]     = useState(false);
  const [placedCount,   setPlacedCount]    = useState(0);
  const [gridIdx,       setGridIdx]        = useState(DEFAULT_GRID);
  const [loadingTex,    setLoadingTex]     = useState(false);

  const grid = GRID_PRESETS[gridIdx];

  // ── Derived ───────────────────────────────────────────────────────────────
  const totalW = grid.cols * PANEL_W;
  const totalH = grid.rows * PANEL_H;

  // =========================================================================
  // Effect 1 — Check WebXR support
  // =========================================================================
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    if (!xr) { setXrState('unsupported'); return; }
    xr.isSessionSupported('immersive-ar')
      .then(ok => setXrState(ok ? 'supported' : 'unsupported'))
      .catch(()  => setXrState('unsupported'));
  }, []);

  // =========================================================================
  // Effect 2 — Create Three.js renderer + scene (once, when support confirmed)
  // =========================================================================
  useEffect(() => {
    if (xrState !== 'supported') return;
    if (rendererRef.current || !mountRef.current) return;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera (WebXR overrides this automatically)
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
    cameraRef.current = camera;

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 2.0));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(1, 3, 2);
    scene.add(dir);

    // Reticle — ring indicator for surface detection
    const reticleGeom = new THREE.RingGeometry(0.07, 0.11, 32).rotateX(-Math.PI / 2);
    const reticleMat  = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const reticle = new THREE.Mesh(reticleGeom, reticleMat);
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);
    reticleRef.current = reticle;

    // Shared panel material
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0.02 });
    panelMatRef.current = mat;

    return () => {
      renderer.setAnimationLoop(null);
      renderer.dispose();
      renderer.domElement.remove();
      mat.dispose();
      rendererRef.current = null;
    };
  }, [xrState]);

  // =========================================================================
  // Effect 3 — Load / swap texture when product changes
  // =========================================================================
  useEffect(() => {
    const mat = panelMatRef.current;
    if (!mat) return;

    setLoadingTex(true);
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = 'anonymous';

    const activeMat: THREE.MeshStandardMaterial = mat; // capture narrowed ref for closures

    function applyTexture(tex: THREE.Texture) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(grid.cols, grid.rows);
      tex.colorSpace = THREE.SRGBColorSpace;
      textureRef.current?.dispose();
      textureRef.current = tex;
      activeMat.map = tex;
      activeMat.needsUpdate = true;
      // Update already-placed panels too
      placedRef.current.forEach(m => {
        const pm = m.material as THREE.MeshStandardMaterial;
        pm.map = tex;
        pm.needsUpdate = true;
      });
      setLoadingTex(false);
    }

    loader.load(
      getTextureUrl(selectedProduct.slug),
      applyTexture,
      undefined,
      () => {
        // CDN unavailable → procedural brick placeholder
        const url = generatePlaceholderTexture(selectedProduct.slug, 512);
        if (!url) { setLoadingTex(false); return; }
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.width; c.height = img.height;
          c.getContext('2d')!.drawImage(img, 0, 0);
          applyTexture(new THREE.CanvasTexture(c));
        };
        img.src = url;
      }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProduct.slug]);

  // =========================================================================
  // Effect 4 — Update texture repeat when grid size changes
  // =========================================================================
  useEffect(() => {
    const tex = textureRef.current;
    if (!tex) return;
    tex.repeat.set(grid.cols, grid.rows);
    tex.needsUpdate = true;
  }, [grid.cols, grid.rows]);

  // =========================================================================
  // placePanel — called on XR controller select (tap) OR the DOM button
  // =========================================================================
  const placePanel = useCallback(() => {
    const reticle = reticleRef.current;
    const mat     = panelMatRef.current;
    const scene   = sceneRef.current;
    if (!reticle?.visible || !mat || !scene) return;

    const geom = new THREE.PlaneGeometry(totalW, totalH);
    const mesh = new THREE.Mesh(geom, mat.clone());

    const pos  = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const sc   = new THREE.Vector3();
    reticle.matrix.decompose(pos, quat, sc);
    mesh.position.copy(pos);
    mesh.quaternion.copy(quat);

    scene.add(mesh);
    placedRef.current.push(mesh);
    setPlacedCount(n => n + 1);
  }, [totalW, totalH]);

  // =========================================================================
  // clearPanels
  // =========================================================================
  const clearPanels = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    placedRef.current.forEach(m => {
      scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
    placedRef.current = [];
    setPlacedCount(0);
  }, []);

  // =========================================================================
  // startAR — request immersive-ar session
  // =========================================================================
  const startAR = useCallback(async () => {
    const xr       = (navigator as Navigator & { xr?: XRSystem }).xr;
    const renderer = rendererRef.current;
    const overlay  = overlayRef.current;
    if (!xr || !renderer || !overlay) return;

    setXrState('starting');
    setErrorMsg(null);
    hitTestReqRef.current = false;
    hitTestSrcRef.current = null;

    try {
      const session = await xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay', 'light-estimation'],
        // @ts-expect-error — domOverlay is an optional WebXR feature not yet in all type defs
        domOverlay: { root: overlay },
      });
      sessionRef.current = session;

      await renderer.xr.setSession(session);

      // Session end handler
      session.addEventListener('end', () => {
        hitTestSrcRef.current = null;
        hitTestReqRef.current = false;
        reticleVisibleRef.current = false;
        sessionRef.current = null;
        if (reticleRef.current) reticleRef.current.visible = false;
        renderer.setAnimationLoop(null);
        setXrState('supported');
        setReticleVis(false);
      });

      // XR controller → tap to place
      const controller = renderer.xr.getController(0);
      controller.addEventListener('select', placePanel);
      sceneRef.current?.add(controller);

      // ── Render loop ─────────────────────────────────────────────────────
      renderer.setAnimationLoop((_time: number, frame: XRFrame | null) => {
        if (!frame) {
          renderer.render(sceneRef.current!, cameraRef.current!);
          return;
        }

        const xrSess  = renderer.xr.getSession()!;
        const refSpace = renderer.xr.getReferenceSpace()!;

        // Request hit-test source once per session
        if (!hitTestReqRef.current) {
          hitTestReqRef.current = true;
          xrSess.requestReferenceSpace('viewer').then(viewerSpace => {
            xrSess.requestHitTestSource!({ space: viewerSpace }).then(src => {
              hitTestSrcRef.current = src;
            });
          });
        }

        // Update reticle
        const reticle = reticleRef.current!;
        if (hitTestSrcRef.current) {
          const hits = frame.getHitTestResults(hitTestSrcRef.current);
          if (hits.length > 0) {
            const pose = hits[0].getPose(refSpace as XRReferenceSpace);
            if (pose) {
              reticle.visible = true;
              reticle.matrix.fromArray(pose.transform.matrix);
              if (!reticleVisibleRef.current) {
                reticleVisibleRef.current = true;
                setReticleVis(true);
              }
            }
          } else {
            reticle.visible = false;
            if (reticleVisibleRef.current) {
              reticleVisibleRef.current = false;
              setReticleVis(false);
            }
          }
        }

        renderer.render(sceneRef.current!, cameraRef.current!);
      });

      setXrState('active');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(
        msg.includes('NotAllowed') || msg.includes('Permission')
          ? 'Permesso AR negato. Verifica che ARCore sia installato e i permessi concessi.'
          : `Impossibile avviare AR: ${msg}`
      );
      setXrState('supported');
    }
  }, [placePanel]);

  const stopAR = useCallback(() => {
    sessionRef.current?.end().catch(() => {});
  }, []);

  // =========================================================================
  // Render: pre-AR screen (supported but not yet active)
  // =========================================================================
  if (xrState === 'checking') {
    return (
      <div className="flex h-full items-center justify-center bg-black">
        <SpinnerIcon className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  if (xrState === 'unsupported') {
    return null; // parent will render LiveARView fallback
  }

  // =========================================================================
  // Render: "Enter AR" launch screen
  // =========================================================================
  const preLaunch = xrState === 'supported' || xrState === 'starting' || xrState === 'error';
  if (preLaunch) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 bg-gradient-to-b from-[#0a0a0a] to-[#141414] px-6 text-center">
        <div className="text-6xl">🥽</div>
        <div>
          <h2 className="text-2xl font-bold">AR Live</h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Punta la fotocamera verso la parete e posiziona i pannelli Mattonflex
            nella realtà aumentata
          </p>
        </div>

        <div className="flex w-full max-w-xs flex-col gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left text-sm">
          <p className="font-semibold">Come funziona:</p>
          {[
            '🎯 Punta la camera verso una parete',
            '⭕ Attendi il cerchio di rilevamento',
            '👆 Tocca lo schermo per posizionare i pannelli',
            '↔️ Cambia prodotto o dimensione griglia in tempo reale',
          ].map(s => (
            <p key={s} className="text-[var(--color-text-muted)]">{s}</p>
          ))}
        </div>

        {errorMsg && (
          <div className="w-full max-w-xs rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {errorMsg}
          </div>
        )}

        <div className="flex w-full max-w-xs flex-col gap-3">
          <button
            onClick={startAR}
            disabled={xrState === 'starting'}
            className="flex items-center justify-center gap-3 rounded-2xl bg-[var(--color-primary)] py-4 text-base font-bold text-white transition-opacity disabled:opacity-60"
          >
            {xrState === 'starting' ? (
              <><SpinnerIcon className="h-5 w-5 animate-spin" /> Avvio AR…</>
            ) : (
              <><XRIcon /> Avvia AR Live</>
            )}
          </button>
          <button
            onClick={onBack}
            className="rounded-2xl border border-[var(--color-border)] py-3 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-hover)]"
          >
            Torna indietro
          </button>
        </div>

        {/* Three.js canvas hidden but initialized for pre-loading */}
        <div ref={mountRef} className="hidden" aria-hidden="true" />
        <div ref={overlayRef} className="hidden" aria-hidden="true" />
      </div>
    );
  }

  // =========================================================================
  // Render: active AR session
  // Three.js canvas is in mountRef; DOM overlay floats on top
  // =========================================================================
  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Three.js canvas host */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* DOM overlay (rendered on top of camera/XR view by the browser) */}
      <div
        ref={overlayRef}
        className="pointer-events-none absolute inset-0 z-10 flex flex-col"
        style={{ touchAction: 'none' }}
      >
        {/* ── Top bar ── */}
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={stopAR}
            className="pointer-events-auto flex items-center gap-2 rounded-xl bg-black/50 px-3 py-2 text-sm font-medium text-white backdrop-blur-sm"
          >
            <CloseIcon /> Esci AR
          </button>

          <div className="flex items-center gap-2 rounded-xl bg-black/50 px-3 py-2 backdrop-blur-sm">
            {loadingTex ? (
              <SpinnerIcon className="h-3 w-3 animate-spin text-white" />
            ) : (
              <div className="h-3 w-3 rounded-full bg-green-400" />
            )}
            <span className="max-w-[140px] truncate text-xs font-medium text-white">
              {selectedProduct.name}
            </span>
          </div>
        </div>

        {/* ── Center reticle hint ── */}
        <div className="flex flex-1 items-end justify-center pb-52">
          {!reticleVis && (
            <div className="rounded-full bg-black/60 px-5 py-2.5 text-sm text-white backdrop-blur-sm">
              Punta verso una parete…
            </div>
          )}
          {reticleVis && placedCount === 0 && (
            <div className="rounded-full bg-[var(--color-primary)]/80 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-sm">
              Tocca lo schermo per posizionare i pannelli
            </div>
          )}
        </div>

        {/* ── Bottom controls ── */}
        <div className="flex flex-col gap-3 px-4 pb-8">

          {/* Grid size selector */}
          <div className="pointer-events-auto flex items-center gap-2 self-center rounded-2xl border border-white/15 bg-black/65 px-4 py-2.5 backdrop-blur-md">
            <span className="text-xs text-white/60">Griglia:</span>
            {GRID_PRESETS.map((g, i) => (
              <button
                key={i}
                onClick={() => setGridIdx(i)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                  i === gridIdx
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'text-white/70 hover:bg-white/15'
                }`}
              >
                {g.cols}×{g.rows}
              </button>
            ))}
            <span className="ml-1 text-xs text-white/40">
              ({(totalW * 100).toFixed(0)}×{(totalH * 100).toFixed(0)} cm)
            </span>
          </div>

          {/* Place / clear row */}
          <div className="pointer-events-auto flex items-center gap-3">
            {/* Place panel button */}
            <button
              onClick={placePanel}
              disabled={!reticleVis}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--color-primary)] py-4 text-base font-bold text-white shadow-lg shadow-blue-500/30 transition-all disabled:opacity-40 active:scale-95"
            >
              <PlusIcon />
              Posiziona pannello
            </button>

            {/* Clear all */}
            {placedCount > 0 && (
              <button
                onClick={clearPanels}
                className="flex h-14 w-14 flex-col items-center justify-center rounded-2xl border border-white/20 bg-black/60 backdrop-blur-md transition-all active:scale-95"
              >
                <TrashIcon />
                <span className="mt-0.5 text-[10px] text-white/70">{placedCount}</span>
              </button>
            )}
          </div>

          {/* Price + buy row */}
          <div className="pointer-events-auto flex items-center justify-between gap-3">
            <PriceBadge product={selectedProduct} />
            <button
              onClick={() => window.open(selectedProduct.permalink, '_blank', 'noopener,noreferrer')}
              className="rounded-xl bg-[var(--color-accent)] px-4 py-3 text-sm font-bold text-black shadow-lg shadow-amber-500/20 active:scale-95"
            >
              Acquista
            </button>
          </div>
        </div>

        {/* Product picker — slides up from bottom (always pointer-events-auto) */}
        <div className="pointer-events-auto absolute inset-0">
          <ProductPicker
            products={products}
            selectedProduct={selectedProduct}
            onSelect={onChangeProduct}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Price badge
// ---------------------------------------------------------------------------
function PriceBadge({ product }: { product: WooProduct }) {
  const price  = parseFloat(product.price);
  const regP   = parseFloat(product.regular_price);
  const isOnSale = product.sale_price && parseFloat(product.sale_price) > 0 && product.sale_price !== product.regular_price;
  const fmt = (n: number) => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });

  if (!price || isNaN(price)) return null;

  return (
    <div className="flex items-baseline gap-2 rounded-xl border border-white/15 bg-black/65 px-4 py-2.5 backdrop-blur-md">
      <span className="text-lg font-bold text-white">{fmt(price)}</span>
      {isOnSale && !isNaN(regP) && (
        <span className="text-xs text-white/50 line-through">{fmt(regP)}</span>
      )}
      <span className="text-xs text-white/50">/m²</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------
function XRIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>;
}
function CloseIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
}
function PlusIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
}
function TrashIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>;
}
function SpinnerIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>;
}
