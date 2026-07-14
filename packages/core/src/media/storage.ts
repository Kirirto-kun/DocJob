import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

/**
 * Transport/infra-agnostic media-storage interface (SP-1b Task 8 scaffold).
 *
 * This mirrors the shape of apps/web/src/lib/storage.ts's
 * `saveAttachment`/`readAttachment`/`deleteAttachmentFile`, but core cannot
 * import `@/lib/storage` (that's `@/` transport code, grep-enforced out of
 * packages/core/src) — so the same filesystem logic is duplicated
 * self-contained here (same convention banner.service.ts uses for the
 * banner-manifest filesystem I/O; see task-7-report.md).
 *
 * `@/lib/storage` itself is intentionally left untouched: the existing
 * `/api/attachments/*` and `/api/images/*` route handlers keep calling it
 * directly. This interface is the seam future @docjob/core domain services
 * (and an eventual S3 adapter — SP-5) will plug into; it is not wired into
 * any action yet.
 */
export type AttachmentKind = 'image' | 'pdf' | 'document' | 'other';

export type SavedAttachment = {
  filename: string;
  mimeType: string;
  size: number;
  kind: AttachmentKind;
  url: string;
};

export type ReadAttachmentResult = { buffer: Buffer; mimeType: string } | null;

export interface MediaStorage {
  saveAttachment(buffer: Buffer, mimeType: string): Promise<SavedAttachment>;
  readAttachment(filename: string): Promise<ReadAttachmentResult>;
  deleteAttachment(filename: string): Promise<void>;
}

const ATTACHMENT_MIME_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'text/plain': '.txt',
  'text/csv': '.csv',
};

const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25 MB, same cap as @/lib/storage

export function attachmentKindFromMime(mimeType: string): AttachmentKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  if (
    mimeType === 'application/msword' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/vnd.ms-excel' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-powerpoint' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    mimeType === 'text/plain' ||
    mimeType === 'text/csv'
  ) {
    return 'document';
  }
  return 'other';
}

/**
 * Local-disk `MediaStorage` implementation. Resolves `UPLOAD_DIR` per call
 * (not cached at construction time) so tests can override
 * `process.env.UPLOAD_DIR` before each call — same pattern
 * banner.service.ts's `uploadDir()` uses. In production the env var never
 * actually changes mid-process, so this has no runtime cost beyond a string
 * read.
 */
class LocalDiskMediaStorage implements MediaStorage {
  private uploadDir(): string {
    return process.env.UPLOAD_DIR || path.join(process.cwd(), 'storage', 'uploads');
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.uploadDir(), { recursive: true });
  }

  /** Same path-traversal guard as @/lib/storage's getImageAbsolutePath. */
  private absolutePath(filename: string): string {
    const sanitized = path.basename(filename);
    if (sanitized !== filename) {
      throw new Error('Invalid filename');
    }
    return path.join(this.uploadDir(), sanitized);
  }

  async saveAttachment(buffer: Buffer, mimeType: string): Promise<SavedAttachment> {
    const ext = ATTACHMENT_MIME_EXT[mimeType];
    if (!ext) {
      throw new Error(`Unsupported mime type: ${mimeType}`);
    }
    if (buffer.byteLength > MAX_ATTACHMENT_SIZE) {
      throw new Error('Файл слишком большой (лимит 25 МБ).');
    }
    await this.ensureDir();
    const filename = `${randomUUID()}${ext}`;
    await fs.writeFile(this.absolutePath(filename), buffer);
    return {
      filename,
      mimeType,
      size: buffer.byteLength,
      kind: attachmentKindFromMime(mimeType),
      url: `/api/attachments/${filename}`,
    };
  }

  async readAttachment(filename: string): Promise<ReadAttachmentResult> {
    try {
      const buffer = await fs.readFile(this.absolutePath(filename));
      const ext = path.extname(filename).toLowerCase();
      const mimeType =
        Object.entries(ATTACHMENT_MIME_EXT).find(([, e]) => e === ext)?.[0] ?? 'application/octet-stream';
      return { buffer, mimeType };
    } catch {
      return null;
    }
  }

  async deleteAttachment(filename: string): Promise<void> {
    try {
      await fs.unlink(this.absolutePath(filename));
    } catch {
      // ignore — file may already be gone, same as @/lib/storage's deleteAttachmentFile
    }
  }
}

export function createLocalDiskMediaStorage(): MediaStorage {
  return new LocalDiskMediaStorage();
}
