import type { WooProduct } from '@/types/product';

const WOO_URL = process.env.WOOCOMMERCE_URL || '';
const WOO_CK = process.env.WOOCOMMERCE_CONSUMER_KEY || '';
const WOO_CS = process.env.WOOCOMMERCE_CONSUMER_SECRET || '';

export async function fetchProducts(): Promise<WooProduct[]> {
  if (!WOO_URL || !WOO_CK || !WOO_CS) {
    console.warn('[WooCommerce] Credentials not configured — using mock products');
    return getMockProducts();
  }

  try {
    const url = new URL(`${WOO_URL}/wp-json/wc/v3/products`);
    url.searchParams.set('consumer_key', WOO_CK);
    url.searchParams.set('consumer_secret', WOO_CS);
    url.searchParams.set('per_page', '100');
    url.searchParams.set('status', 'publish');

    const response = await fetch(url.toString(), {
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!response.ok) {
      throw new Error(`WooCommerce API responded with status ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error('Unexpected response format from WooCommerce API');
    }

    return data as WooProduct[];
  } catch (error) {
    console.error('[WooCommerce] Failed to fetch products:', error);
    return getMockProducts();
  }
}

export function getMockProducts(): WooProduct[] {
  return [
    {
      id: 1,
      name: 'Mattone Flessibile Country',
      slug: 'mattone-rivestimento-flessibile-cuntry',
      permalink: 'https://mattonflex.it/product/mattone-rivestimento-flessibile-cuntry/',
      images: [
        {
          id: 1,
          src: 'https://picsum.photos/seed/brick-cuntry/400/300',
          alt: 'Country',
        },
      ],
      attributes: [],
      description: 'Effetto mattone rustico country in toni caldi.',
      short_description: 'Pannello flessibile effetto mattone Country',
      price: '29.90',
      regular_price: '34.90',
      sale_price: '29.90',
      status: 'publish',
    },
    {
      id: 2,
      name: 'Mattone Flessibile Avorio',
      slug: 'mattone-rivestimento-flessibile-avorio',
      permalink: 'https://mattonflex.it/product/mattone-rivestimento-flessibile-avorio/',
      images: [
        {
          id: 2,
          src: 'https://picsum.photos/seed/brick-avorio/400/300',
          alt: 'Avorio',
        },
      ],
      attributes: [],
      description: 'Classico mattone avorio dai toni delicati.',
      short_description: 'Pannello flessibile effetto mattone Avorio',
      price: '29.90',
      regular_price: '29.90',
      sale_price: '',
      status: 'publish',
    },
    {
      id: 3,
      name: 'Mattone Flessibile Rosso',
      slug: 'mattone-rivestimento-flessibile-rosso',
      permalink: 'https://mattonflex.it/product/mattone-rivestimento-flessibile-rosso/',
      images: [
        {
          id: 3,
          src: 'https://picsum.photos/seed/brick-rosso/400/300',
          alt: 'Rosso',
        },
      ],
      attributes: [],
      description: 'Mattone rosso tradizionale italiano.',
      short_description: 'Pannello flessibile effetto mattone Rosso',
      price: '27.90',
      regular_price: '27.90',
      sale_price: '',
      status: 'publish',
    },
    {
      id: 4,
      name: 'Mattone Flessibile Grigio',
      slug: 'mattone-rivestimento-flessibile-grigio',
      permalink: 'https://mattonflex.it/product/mattone-rivestimento-flessibile-grigio/',
      images: [
        {
          id: 4,
          src: 'https://picsum.photos/seed/brick-grigio/400/300',
          alt: 'Grigio',
        },
      ],
      attributes: [],
      description: 'Mattone grigio moderno per ambienti contemporanei.',
      short_description: 'Pannello flessibile effetto mattone Grigio',
      price: '31.90',
      regular_price: '31.90',
      sale_price: '',
      status: 'publish',
    },
    {
      id: 5,
      name: 'Mattone Flessibile Nero',
      slug: 'mattone-rivestimento-flessibile-nero',
      permalink: 'https://mattonflex.it/product/mattone-rivestimento-flessibile-nero/',
      images: [
        {
          id: 5,
          src: 'https://picsum.photos/seed/brick-nero/400/300',
          alt: 'Nero',
        },
      ],
      attributes: [],
      description: 'Mattone nero elegante per design d\'interni sofisticati.',
      short_description: 'Pannello flessibile effetto mattone Nero',
      price: '34.90',
      regular_price: '34.90',
      sale_price: '',
      status: 'publish',
    },
    {
      id: 6,
      name: 'Mattone Flessibile Bianco',
      slug: 'mattone-rivestimento-flessibile-bianco',
      permalink: 'https://mattonflex.it/product/mattone-rivestimento-flessibile-bianco/',
      images: [
        {
          id: 6,
          src: 'https://picsum.photos/seed/brick-bianco/400/300',
          alt: 'Bianco',
        },
      ],
      attributes: [],
      description: 'Mattone bianco luminoso per ambienti minimalisti.',
      short_description: 'Pannello flessibile effetto mattone Bianco',
      price: '27.90',
      regular_price: '27.90',
      sale_price: '',
      status: 'publish',
    },
  ];
}
