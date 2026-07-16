import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CaseListItem } from '../lib/api-types';
import { colors } from '../theme/colors';

type CaseCardProps = {
  item: CaseListItem;
  onPress: () => void;
};

/** One case row in the subgroup case list (`app/(tabs)/cases/[subgroup].tsx`). */
export function CaseCard({ item, onPress }: CaseCardProps) {
  const subtitleParts = [item.specialty, item.primaryCondition].filter(
    (v): v is string => Boolean(v),
  );

  return (
    <Pressable
      testID={`case-card-${item.id}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <Text style={styles.title}>{item.name}</Text>
      {subtitleParts.length > 0 ? (
        <Text style={styles.subtitle}>{subtitleParts.join(' · ')}</Text>
      ) : null}
      {item.teaser ? (
        <Text style={styles.teaser} numberOfLines={2}>
          {item.teaser}
        </Text>
      ) : null}
      {item.tags.length > 0 ? (
        <View style={styles.tagRow}>
          {item.tags.slice(0, 4).map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    backgroundColor: colors.surface,
    gap: 6,
  },
  cardPressed: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.primary,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textMuted,
  },
  teaser: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: {
    fontSize: 11,
    color: colors.textMuted,
  },
});
