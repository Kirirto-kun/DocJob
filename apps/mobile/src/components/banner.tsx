import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { trpc } from '../lib/trpc';
import { resolveMediaUrl } from '../lib/config';
import type { BannerInfo } from '../lib/api-types';
import { colors } from '../theme/colors';

/**
 * Renders every filled slot of the admin-uploaded banner manifest
 * (`trpc.banners.get` -> `BannerManifest`, `../lib/api-types.ts` — today
 * just `{'1': BannerInfo | null}`, see `packages/core/src/banners/banner.service.ts`'s
 * `BannerSlot = 1`). Iterates `Object.entries(manifest)` rather than
 * hardcoding slot `'1'` so this doesn't need a code change if a second slot
 * is ever added server-side. Renders nothing at all — not even a container
 * `View` — when every slot is empty/unset, per the SP-4b Task 5 brief
 * ("render nothing for empty slots").
 *
 * `publicProcedure` (`packages/api/src/routers/banners.ts`'s `get`, no actor
 * needed — matches the original unauthenticated `GET /api/banners` route),
 * so this is safe to mount on a screen reachable before or after login.
 * Placed at the top of `app/(tabs)/search.tsx` (the tab a user lands on
 * first after login) per the brief's "place a banner where sensible"
 * guidance.
 */
export function Banner() {
  const bannerQuery = trpc.banners.get.useQuery();
  const manifest = bannerQuery.data;

  const activeSlots = manifest
    ? (Object.entries(manifest) as [string, BannerInfo | null][]).filter(([, info]) => info !== null)
    : [];

  if (activeSlots.length === 0) return null;

  return (
    <View testID="banner" style={styles.container}>
      {activeSlots.map(([slot, info]) => (
        <BannerSlotView key={slot} slot={slot} info={info as BannerInfo} />
      ))}
    </View>
  );
}

function BannerSlotView({ slot, info }: { slot: string; info: BannerInfo }) {
  const content = (
    <Image
      testID={`banner-image-${slot}`}
      source={{ uri: resolveMediaUrl(info.url) }}
      style={styles.image}
      resizeMode="cover"
    />
  );

  if (info.linkUrl) {
    return (
      <Pressable
        testID={`banner-slot-${slot}`}
        style={styles.slot}
        onPress={() => void Linking.openURL(info.linkUrl as string)}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View testID={`banner-slot-${slot}`} style={styles.slot}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
    marginBottom: 12,
  },
  slot: {
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  image: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: colors.surfaceElevated,
  },
});
