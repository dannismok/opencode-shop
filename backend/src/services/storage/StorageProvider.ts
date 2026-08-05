import { mkdirSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

export interface StorageProvider {
  save(data: Buffer, key: string, mimetype: string): Promise<string>;
  delete(key: string): Promise<void>;
}

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

export class LocalDiskStorageProvider implements StorageProvider {
  constructor(private readonly baseDir: string) {}

  async save(data: Buffer, key: string, mimetype: string): Promise<string> {
    const ext = extensionForMimetype(mimetype);
    const dir = join(resolve(this.baseDir), 'foods');
    mkdirSync(dir, { recursive: true });

    const filename = `${sanitize(key)}-${randomBytes(4).toString('hex')}${ext}`;
    const fullPath = join(dir, filename);
    writeFileSync(fullPath, data);
    return `/uploads/foods/${filename}`;
  }

  async delete(url: string): Promise<void> {
    if (!url.startsWith('/uploads/foods/')) return;
    const filename = url.replace('/uploads/foods/', '');
    const fullPath = join(resolve(this.baseDir), 'foods', filename);
    if (existsSync(fullPath)) {
      unlinkSync(fullPath);
    }
  }
}

function extensionForMimetype(mimetype: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
  };
  const ext = map[mimetype] ?? '.jpg';
  return ALLOWED_EXTENSIONS.includes(ext) ? ext : '.jpg';
}

function sanitize(key: string): string {
  return key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
