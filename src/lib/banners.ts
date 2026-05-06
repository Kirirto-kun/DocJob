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

export type BannerSlotSpec = {
  width: number;
  height: number;
  aspect: string; // CSS aspect-ratio value, e.g. '12 / 1'
};

export const BANNER_SLOT_SPECS: Record<BannerSlot, BannerSlotSpec> = {
  1: { width: 1200, height: 100, aspect: '12 / 1' },
  2: { width: 300, height: 300, aspect: '1 / 1' },
};

export function isValidSlot(value: unknown): value is BannerSlot {
  return value === 1 || value === 2;
}
