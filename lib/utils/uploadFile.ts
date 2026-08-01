// Single client-side entry point for POST /api/upload.
//
// Four near-identical copies of this request used to live in app/page.tsx,
// VideoEditor.tsx, MediaUploadButton.tsx and BgmSettings.tsx. They had already
// drifted: each parsed the error body slightly differently, and only two were
// translated (BgmSettings threw a hard-coded English string).
//
// Error *presentation* deliberately stays with the caller — one surface uses an
// alert, another an inline banner — but the request, the status handling and
// the response shape are fixed here.

export interface UploadResult {
  url: string;
  type?: string;
  filename?: string;
  size?: number;
}

export class UploadError extends Error {
  /** HTTP status, or 0 when the request never completed. */
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'UploadError';
    this.status = status;
  }
}

/**
 * Upload one file and return its stored URL.
 *
 * @param fallbackMessage caller-supplied, already-translated message used when
 *        the server sends no usable `error` field.
 * @throws {UploadError} on a non-2xx response or a malformed response body.
 */
export async function uploadFile(
  file: File,
  fallbackMessage = 'Upload failed',
  init?: { signal?: AbortSignal },
): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
    signal: init?.signal,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const serverMessage =
      body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : null;
    throw new UploadError(serverMessage || fallbackMessage, response.status);
  }

  const data = (await response.json().catch(() => null)) as UploadResult | null;
  if (!data || typeof data.url !== 'string' || data.url === '') {
    throw new UploadError(fallbackMessage, response.status);
  }
  return data;
}
