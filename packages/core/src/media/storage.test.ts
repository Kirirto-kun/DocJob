/**
 * Unit tests for media/storage's local-disk MediaStorage adapter — pure
 * filesystem I/O against a temp directory (UPLOAD_DIR overridden per test),
 * same pattern banner.service.test.ts uses. No DB involved, so this runs
 * fine without Postgres.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { attachmentKindFromMime, createLocalDiskMediaStorage } from './storage';

describe('media/storage — local disk adapter', () => {
  let tmpDir: string;
  const originalUploadDir = process.env.UPLOAD_DIR;
  const storage = createLocalDiskMediaStorage();

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'docjob-media-test-'));
    process.env.UPLOAD_DIR = tmpDir;
  });

  afterAll(() => {
    if (originalUploadDir === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = originalUploadDir;
  });

  it('attachmentKindFromMime classifies known mime types', () => {
    expect(attachmentKindFromMime('image/png')).toBe('image');
    expect(attachmentKindFromMime('application/pdf')).toBe('pdf');
    expect(attachmentKindFromMime('text/csv')).toBe('document');
    expect(attachmentKindFromMime('application/zip')).toBe('other');
  });

  it('saveAttachment writes the file to UPLOAD_DIR and returns metadata', async () => {
    const buffer = Buffer.from('hello world');
    const saved = await storage.saveAttachment(buffer, 'text/plain');

    expect(saved.mimeType).toBe('text/plain');
    expect(saved.size).toBe(buffer.byteLength);
    expect(saved.kind).toBe('document');
    expect(saved.filename.endsWith('.txt')).toBe(true);
    expect(saved.url).toBe(`/api/attachments/${saved.filename}`);

    const onDisk = await fs.readFile(path.join(tmpDir, saved.filename));
    expect(onDisk.toString()).toBe('hello world');
  });

  it('readAttachment round-trips a saved file', async () => {
    const buffer = Buffer.from('round trip content');
    const saved = await storage.saveAttachment(buffer, 'application/pdf');

    const read = await storage.readAttachment(saved.filename);
    expect(read).not.toBeNull();
    expect(read!.mimeType).toBe('application/pdf');
    expect(read!.buffer.toString()).toBe('round trip content');
  });

  it('readAttachment returns null for a missing file', async () => {
    const read = await storage.readAttachment('does-not-exist.pdf');
    expect(read).toBeNull();
  });

  it('deleteAttachment removes the file, and is a no-op if already gone', async () => {
    const saved = await storage.saveAttachment(Buffer.from('x'), 'image/png');
    await storage.deleteAttachment(saved.filename);
    expect(await storage.readAttachment(saved.filename)).toBeNull();

    // Deleting again should not throw.
    await expect(storage.deleteAttachment(saved.filename)).resolves.toBeUndefined();
  });

  it('saveAttachment rejects an unsupported mime type', async () => {
    await expect(storage.saveAttachment(Buffer.from('x'), 'application/zip')).rejects.toThrow(
      'Unsupported mime type',
    );
  });

  it('saveAttachment rejects a file over the 25 MB cap', async () => {
    const oversized = Buffer.alloc(25 * 1024 * 1024 + 1);
    await expect(storage.saveAttachment(oversized, 'text/plain')).rejects.toThrow(
      'Файл слишком большой',
    );
  });

  it('readAttachment guards against path traversal', async () => {
    const read = await storage.readAttachment('../../etc/passwd');
    expect(read).toBeNull();
  });
});
