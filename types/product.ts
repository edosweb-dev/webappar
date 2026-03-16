export interface WooProductImage {
  id: number;
  src: string;
  alt: string;
}

export interface WooProductAttribute {
  id: number;
  name: string;
  options: string[];
}

export interface WooProduct {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  images: WooProductImage[];
  attributes: WooProductAttribute[];
  description: string;
  short_description: string;
  price: string;
  regular_price: string;
  sale_price: string;
  status: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface PhotoData {
  dataUrl: string;
  width: number;
  height: number;
}

export type ARStep = 'select-product' | 'upload-photo' | 'select-area' | 'ar-view';

export interface WallArea {
  /** 4 points: [top-left, top-right, bottom-right, bottom-left] in photo pixel coordinates */
  points: [Point, Point, Point, Point];
  isConfirmed: boolean;
}

export interface ARState {
  products: WooProduct[];
  selectedProduct: WooProduct | null;
  photo: PhotoData | null;
  wallArea: WallArea | null;
  step: ARStep;
  isLoading: boolean;
  error: string | null;
}
