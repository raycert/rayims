/**
 * Provider-independent object storage contract.
 * Keys are relative object keys (see keys.ts); no URLs, no bucket names.
 * Application code depends on this interface only, so the provider can be
 * replaced (S3-compatible, Cloudflare R2, ...) without touching entities.
 */
export interface StorageProvider {
  /** Stored in files.storage_provider. */
  readonly name: string;
  upload(
    key: string,
    body: Blob | ArrayBuffer,
    options: { contentType?: string },
  ): Promise<void>;
  /**
   * Short-lived URL generated on demand. Never persist the result. With `downloadName` the
   * response is served as an attachment with that file name.
   */
  createSignedUrl(key: string, expiresInSeconds: number, options?: { downloadName?: string }): Promise<string>;
  /** Stored object's size in bytes, or null when the object does not exist / cannot be read. */
  stat(key: string): Promise<{ size: number | null } | null>;
  remove(keys: string[]): Promise<void>;
}
