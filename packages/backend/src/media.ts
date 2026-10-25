import { createHash } from 'node:crypto';
import type { Config } from './config';

class StorageError extends Error {
  constructor(public status: number, public code?: string) {
    super(`Supabase Storage request failed (${status}). Check the server storage configuration or retry.`);
  }
}

/** Server-only adapter. Provider responses and credentials never enter client errors. */
export class MediaStore {
  private base: string;
  private bucket: string;
  constructor(private config: Config, private fetcher: typeof fetch = fetch) {
    this.base = `${config.SUPABASE_URL.replace(/\/+$/, '')}/storage/v1`;
    this.bucket = encodeURIComponent(config.SUPABASE_STORAGE_BUCKET);
  }

  private objectPath(key: string) {
    const parts = key.split('/');
    if (parts.some((part) => !part || part === '.' || part === '..'))
      throw new Error('Invalid storage object path.');
    return `${this.bucket}/${parts.map(encodeURIComponent).join('/')}`;
  }

  private async request(path: string, options: RequestInit = {}) {
    const headers = new Headers(options.headers);
    headers.set('apikey', this.config.SUPABASE_SERVICE_ROLE_KEY);
    headers.set('Authorization', `Bearer ${this.config.SUPABASE_SERVICE_ROLE_KEY}`);
    let response: Response;
    try {
      response = await this.fetcher(`${this.base}${path}`, {
        ...options, headers, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new Error('Supabase Storage is unavailable or timed out. Retry the operation.');
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      // Storage can return HTTP 400 with a more specific statusCode in its body.
      const status = Number(body.statusCode) || response.status;
      throw new StorageError(status, typeof body.code === 'string' ? body.code : undefined);
    }
    return response;
  }

  private json(method: string, body: unknown): RequestInit {
    return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  }

  async ensureBucket() {
    let response: Response;
    try {
      response = await this.request(`/bucket/${this.bucket}`);
    } catch (error) {
      if (!(error instanceof StorageError) || (error.status !== 404 && error.code !== 'NoSuchBucket'))
        throw error;
      try {
        await this.request('/bucket', this.json('POST', {
          id: this.config.SUPABASE_STORAGE_BUCKET,
          name: this.config.SUPABASE_STORAGE_BUCKET,
          public: false,
        }));
      } catch (creationError) {
        // Another API process may have created the same bucket concurrently.
        if (!(creationError instanceof StorageError) || creationError.status !== 409) throw creationError;
      }
      response = await this.request(`/bucket/${this.bucket}`);
    }
    const bucket = await response.json();
    if (bucket.public !== false)
      throw new Error('AuraSpace requires a private storage bucket. Set this bucket to private in Supabase Storage.');
  }

  async put(key: string, bytes: Uint8Array, mimeType: string) {
    await this.request(`/object/${this.objectPath(key)}`, {
      method: 'POST', headers: { 'Content-Type': mimeType, 'x-upsert': 'true', 'Cache-Control': 'max-age=0' },
      body: new Uint8Array(bytes).buffer,
    });
    return { sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.byteLength };
  }

  async get(key: string) {
    const response = await this.request(`/object/authenticated/${this.objectPath(key)}`);
    return new Uint8Array(await response.arrayBuffer());
  }

  async head(key: string) {
    // Metadata queries bypass cached file content after a deletion.
    const response = await this.request(`/object/info/${this.objectPath(key)}`);
    const info = await response.json();
    return { ContentLength: Number(info.metadata?.size ?? info.size), ContentType: info.metadata?.mimetype ?? info.contentType };
  }

  async delete(key: string) {
    this.objectPath(key); // Validate before sending the unencoded object key in JSON.
    await this.request(`/object/${this.bucket}`, this.json('DELETE', { prefixes: [key] }));
  }

  async access(key: string) {
    const response = await this.request(`/object/sign/${this.objectPath(key)}`, this.json('POST', { expiresIn: 300 }));
    const data = await response.json();
    if (typeof data.signedURL !== 'string' || !data.signedURL.startsWith('/object/sign/'))
      throw new Error('Supabase Storage returned an invalid download link.');
    return `${this.base}${data.signedURL}`;
  }
}
