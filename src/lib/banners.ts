export type BannerSlot = 1 | 2;

export type BannerInfo = {
  filename: string;
  url: string;
  mimeType: string;
  linkUrl: string | null;
  updatedAt: string;
};

export type BannerManifest = {
  '1': BannerInfo | null;
  '2': BannerInfo | null;
};

export function isValidSlot(value: unknown): value is BannerSlot {
  return value === 1 || value === 2;
}

export const BANNER_RECOMMENDED_WIDTH = 1200;
export const BANNER_RECOMMENDED_HEIGHT = 240;
export const BANNER_ASPECT_RATIO = '5 / 1';
