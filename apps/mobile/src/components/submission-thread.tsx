import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { trpc } from '../lib/trpc';
import type { SerializedSubmissionMessage } from '../lib/api-types';

type SubmissionThreadProps = {
  submissionId: string;
  messages: SerializedSubmissionMessage[];
};

/**
 * The message thread + composer for a single case-submission
 * (`app/(tabs)/submissions/[id].tsx`), self-contained like
 * `./reviews-panel.tsx` — owns `trpc.submissions.sendMessage` and its own
 * cache invalidation, taking the already-fetched `messages` (from the
 * parent's `submissions.byId` query) as a prop rather than re-querying,
 * so there's exactly one `byId` fetch per screen visit.
 *
 * `sendMessage`'s core rule (`packages/core/src/submissions/submission.service.ts`)
 * is "the submission's own author, or an admin, may post" — enforced
 * server-side; this composer is always shown (no client-side role gate)
 * because every reachable submission on this screen already belongs to the
 * current actor (`submissions.byId`/`mine` both scope to "my own, or admin
 * viewing any") or the actor IS an admin, so the only actor who could ever
 * see this thread is always allowed to post on it.
 *
 * On send, invalidates `submissions.byId(submissionId)` (refreshes this
 * thread) and `submissions.mine` (refreshes the list's `messageCount` /
 * `updatedAt`-driven ordering) — mirrors `reviews-panel.tsx`'s two-query
 * invalidation shape.
 */
export function SubmissionThread({ submissionId, messages }: SubmissionThreadProps) {
  const utils = trpc.useUtils();
  const sendMutation = trpc.submissions.sendMessage.useMutation();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canSend = draft.trim().length > 0 && !sendMutation.isPending;

  const onSend = async () => {
    if (!canSend) return;
    setError(null);
    try {
      await sendMutation.mutateAsync({ submissionId, body: draft.trim() });
      setDraft('');
      await Promise.all([
        utils.submissions.byId.invalidate(submissionId),
        utils.submissions.mine.invalidate(),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось отправить сообщение.');
    }
  };

  return (
    <View style={styles.container} testID="submission-thread">
      <Text style={styles.heading}>Обсуждение</Text>

      {messages.length === 0 ? (
        <Text style={styles.empty} testID="submission-thread-empty">
          Сообщений пока нет.
        </Text>
      ) : (
        <View style={styles.list}>
          {messages.map((m) => (
            <View key={m.id} style={styles.message} testID={`submission-message-${m.id}`}>
              <View style={styles.messageHeader}>
                <Text style={styles.senderName}>{m.senderName}</Text>
                <Text style={styles.senderRole}>{m.senderRole === 'ADMIN' ? 'Администратор' : m.senderRole}</Text>
              </View>
              <Text style={styles.messageBody}>{m.body}</Text>
            </View>
          ))}
        </View>
      )}

      {error ? (
        <Text style={styles.error} testID="submission-thread-error">
          {error}
        </Text>
      ) : null}

      <View style={styles.composer}>
        <TextInput
          testID="submission-message-input"
          style={styles.input}
          placeholder="Написать сообщение..."
          placeholderTextColor="#8a8a8a"
          value={draft}
          onChangeText={setDraft}
          multiline
        />
        <Pressable
          testID="submission-message-send"
          style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
          onPress={() => void onSend()}
          disabled={!canSend}
        >
          {sendMutation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.sendButtonText}>Отправить</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  heading: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#666',
    letterSpacing: 0.5,
  },
  empty: {
    fontSize: 13,
    color: '#666',
  },
  list: {
    gap: 10,
  },
  message: {
    borderWidth: 1,
    borderColor: '#e2e2e2',
    borderRadius: 10,
    padding: 12,
    gap: 4,
    backgroundColor: '#fff',
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  senderName: {
    fontSize: 13,
    fontWeight: '600',
  },
  senderRole: {
    fontSize: 11,
    color: '#666',
  },
  messageBody: {
    fontSize: 13,
    lineHeight: 18,
    color: '#333',
  },
  error: {
    color: '#c0392b',
    fontSize: 12,
  },
  composer: {
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
    backgroundColor: '#fff',
  },
  sendButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});
