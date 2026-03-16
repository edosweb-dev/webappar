import type { Metadata } from 'next';
import { fetchProducts } from '@/lib/woocommerce';
import ARVisualizer from '@/components/ar/ARVisualizer';

interface Props {
  searchParams: Promise<{ product?: string }>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const slug = params.product ?? null;

  return {
    title: slug
      ? `Visualizza ${slug.replace(/-/g, ' ')} | Mattonflex Visualizer`
      : 'Mattonflex Visualizer — Prova i pannelli sulla tua parete',
    description:
      'Carica una foto della tua parete e visualizza in anteprima i pannelli decorativi Mattonflex con realtà aumentata.',
  };
}

/**
 * /visualizer — AR Visualizer page (Server Component)
 *
 * Responsibilities:
 *   1. Read the optional ?product={slug} search param
 *   2. Fetch the product catalogue from WooCommerce API (server-side, credentials never sent to client)
 *   3. Pass products + initial slug to the ARVisualizer client component
 */
export default async function VisualizerPage({ searchParams }: Props) {
  const params = await searchParams;
  const productSlug = params.product ?? null;

  // Server-side fetch — credentials stay in the Node.js process
  const products = await fetchProducts();

  return (
    <div className="h-screen overflow-hidden">
      <ARVisualizer products={products} initialSlug={productSlug} />
    </div>
  );
}
