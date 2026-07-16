import { useState } from 'react';
import { Image, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { trpc } from '../lib/trpc';
import { resolveMediaUrl } from '../lib/config';

/**
 * Admin-authored popup ad, shown once per authenticated session
 * (SP-4b Task 5 brief). Mounted unconditionally inside
 * `app/(tabs)/_layout.tsx`'s `'authenticated'` branch (never inside
 * `(auth)`) — so the query only ever runs for a logged-in, approved user,
 * mirroring `apps/web/src/components/announcement-modal.tsx`'s own
 * `hasUser`-gated query (there it's an explicit `enabled` flag since the web
 * component is mounted app-wide; here the gate is "this component only
 * exists in the authenticated tree" instead of a runtime flag, since T3's
 * tab layout already redirects everything else to `(auth)`).
 *
 * `trpc.announcements.active` is `publicProcedure` (core's
 * `getActiveAnnouncements` treats a null actor as "no announcements", not an
 * error — see `packages/api/src/routers/announcements.ts`'s own doc
 * comment), so this never throws for an edge-case null actor; it would just
 * resolve `[]`.
 *
 * Multiple simultaneously-active announcements are paged one at a time
 * (`queue[0]`), same as the web version's `index` pager — but instead of a
 * numeric index this tracks a local `dismissedIds` Set: filtering the fetched
 * queue by that set means a dismissed announcement disappears from the
 * screen INSTANTLY (no flicker waiting on the invalidated query to refetch),
 * while `dismiss.useMutation` + `utils.announcements.active.invalidate()`
 * make the server-side dismissal (`AnnouncementDismissal`, persists
 * per-user) durable — so it also "won't reappear" on a later remount/
 * refetch, per the brief's explicit requirement, not just for the rest of
 * this session.
 */
export function AnnouncementModal() {
  const utils = trpc.useUtils();
  const activeQuery = trpc.announcements.active.useQuery();
  const dismissMutation = trpc.announcements.dismiss.useMutation();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const queue = (activeQuery.data ?? []).filter((a) => !dismissedIds.has(a.id));
  const current = queue[0] ?? null;

  const onDismiss = async () => {
    if (!current) return;
    const id = current.id;
    setDismissedIds((prev) => new Set(prev).add(id));
    try {
      await dismissMutation.mutateAsync(id);
    } finally {
      await utils.announcements.active.invalidate();
    }
  };

  if (!current) return null;

  return (
    <Modal
      testID="announcement-modal"
      visible
      transparent
      animationType="fade"
      onRequestClose={() => void onDismiss()}
    >
      <View style={styles.backdrop}>
        <View style={styles.card} testID="announcement-card">
          {current.imageUrl ? (
            <Image
              testID="announcement-image"
              source={{ uri: resolveMediaUrl(current.imageUrl) }}
              style={styles.image}
              resizeMode="cover"
            />
          ) : null}

          <Text style={styles.title}>{current.title}</Text>
          <Text style={styles.body}>{current.body}</Text>

          {current.linkUrl ? (
            <Pressable
              testID="announcement-link"
              style={styles.linkButton}
              onPress={() => void Linking.openURL(current.linkUrl as string)}
            >
              <Text style={styles.linkButtonText}>{current.linkLabel || 'Подробнее'}</Text>
            </Pressable>
          ) : null}

          <Pressable testID="announcement-dismiss" style={styles.dismissButton} onPress={() => void onDismiss()}>
            <Text style={styles.dismissButtonText}>Закрыть</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    gap: 10,
  },
  image: {
    width: '100%',
    height: 160,
    borderRadius: 8,
    marginBottom: 4,
    backgroundColor: '#eef2ff',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: '#333',
  },
  linkButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  linkButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  dismissButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  dismissButtonText: {
    color: '#666',
    fontWeight: '600',
    fontSize: 13,
  },
});
