import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { Banner } from './banner';
import type { BannerManifest } from '../lib/api-types';

type GetResult = { data: BannerManifest | undefined };

const mockedGetQuery = jest.fn<() => GetResult>();

jest.mock('../lib/trpc', () => ({
  __esModule: true,
  trpc: {
    banners: {
      get: { useQuery: () => mockedGetQuery() },
    },
  },
}));

beforeEach(() => {
  mockedGetQuery.mockReset();
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
});

describe('Banner', () => {
  it('renders nothing while loading (no manifest yet)', async () => {
    mockedGetQuery.mockReturnValue({ data: undefined });

    await render(<Banner />);

    expect(screen.queryByTestId('banner')).toBeNull();
  });

  it('renders nothing when every slot is empty', async () => {
    mockedGetQuery.mockReturnValue({ data: { '1': null } as unknown as BannerManifest });

    await render(<Banner />);

    expect(screen.queryByTestId('banner')).toBeNull();
  });

  it('renders a filled slot as an image', async () => {
    mockedGetQuery.mockReturnValue({
      data: {
        '1': {
          filename: 'banner.png',
          url: '/api/images/banner.png',
          mimeType: 'image/png',
          linkUrl: null,
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      } as unknown as BannerManifest,
    });

    await render(<Banner />);

    expect(screen.getByTestId('banner')).toBeTruthy();
    expect(screen.getByTestId('banner-slot-1')).toBeTruthy();
    expect(screen.getByTestId('banner-image-1')).toBeTruthy();
  });

  it('opens linkUrl when a linked slot is tapped', async () => {
    mockedGetQuery.mockReturnValue({
      data: {
        '1': {
          filename: 'banner.png',
          url: '/api/images/banner.png',
          mimeType: 'image/png',
          linkUrl: 'https://docjob.example/promo',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      } as unknown as BannerManifest,
    });

    await render(<Banner />);

    await fireEvent.press(screen.getByTestId('banner-slot-1'));

    expect(Linking.openURL).toHaveBeenCalledWith('https://docjob.example/promo');
  });
});
