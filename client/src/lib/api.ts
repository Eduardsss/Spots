const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  (import.meta.env.DEV ? 'http://localhost:3000' : '')

type JsonLike = Record<string, unknown> | Array<unknown>

type ApiFetchOptions = Omit<RequestInit, 'body'> & {
  body?: RequestInit['body'] | JsonLike
}

function isJsonLike(body: ApiFetchOptions['body']): body is JsonLike {
  return (
    body !== null &&
    typeof body === 'object' &&
    !(body instanceof FormData) &&
    !(body instanceof Blob) &&
    !(body instanceof ArrayBuffer) &&
    !(body instanceof URLSearchParams) &&
    !(body instanceof ReadableStream)
  )
}

function resolveUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }

  const normalizedBase = API_BASE_URL.trim()

  if (!normalizedBase) {
    return path.startsWith('/') ? path : `/${path}`
  }

  const base = normalizedBase.endsWith('/')
    ? normalizedBase.slice(0, -1)
    : normalizedBase
  const suffix = path.startsWith('/') ? path : `/${path}`

  return `${base}${suffix}`
}

const DEFAULT_TIMEOUT_MS = 60_000;

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions & { timeoutMs?: number } = {}
): Promise<T> {
  const { headers: headersInit, body, timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = options
  const headers = new Headers(headersInit ?? {})

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null

  const url = resolveUrl(path)

  if (!headers.has('Authorization') && token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json')
  }

  let requestBody: BodyInit | undefined
  if (isJsonLike(body)) {
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
    requestBody = JSON.stringify(body)
  } else if (body !== undefined) {
    requestBody = body as BodyInit
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      headers,
      body: requestBody,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Pieprasījums pārsniedza laika ierobežojumu. Pārbaudi interneta savienojumu un mēģini vēlreiz.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  const contentType = response.headers.get('Content-Type') ?? ''
  const isJson = contentType.includes('application/json')
  const data = isJson ? await response.json() : await response.text()

  if (!response.ok) {
    const message =
      typeof data === 'string' && data
        ? data
        : (data as { message?: string })?.message ?? 'Request failed';
    const error = new Error(message);
    throw Object.assign(error, {
      status: response.status,
      statusText: response.statusText,
      body: data,
    });
  }

  return data as T
}
