const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const SUPABASE_URL_STRING = (() => {
  if (!SUPABASE_URL) {
    return '';
  }

  try {
    const url = new URL(SUPABASE_URL);
    return url.toString();
  } catch (error) {
    console.warn('Invalid Supabase URL provided in environment:', error);
    return '';
  }
})();


type JsonLike = Record<string, unknown> | Array<unknown>;

type ApiFetchOptions = Omit<RequestInit, 'body'> & {
  body?: RequestInit['body'] | JsonLike;
};

function isJsonLike(body: ApiFetchOptions['body']): body is JsonLike {
  return (
    body !== null &&
    typeof body === 'object' &&
    !(body instanceof FormData) &&
    !(body instanceof Blob) &&
    !(body instanceof ArrayBuffer) &&
    !(body instanceof URLSearchParams) &&
    !(body instanceof ReadableStream)
  );
}

function resolveUrl(path: string): { url: string; isSupabaseRequest: boolean } {
  const baseUrl = path.startsWith('http')
    ? path
    : `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;

  if (!SUPABASE_URL_STRING) {
    return { url: baseUrl, isSupabaseRequest: false };
  }

  try {
    const reference =
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const target = new URL(baseUrl, reference);
    const supabase = new URL(SUPABASE_URL_STRING);

    const isSupabaseRequest = target.toString().startsWith(supabase.toString());

    if (isSupabaseRequest && SUPABASE_ANON_KEY) {
      if (!target.searchParams.has('apikey')) {
        target.searchParams.set('apikey', SUPABASE_ANON_KEY);
      }

      return { url: target.toString(), isSupabaseRequest: true };
    }

    return { url: target.toString(), isSupabaseRequest };
  } catch (error) {
    console.warn('Failed to resolve request URL:', error);
    return { url: baseUrl, isSupabaseRequest: false };
  }
}

export async function apiFetch<T = unknown>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { headers: headersInit, body, ...rest } = options;
  const headers = new Headers(headersInit ?? {});

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const { url, isSupabaseRequest } = resolveUrl(path);

  if (isSupabaseRequest) {
    if (SUPABASE_ANON_KEY) {
      if (!headers.has('apikey')) {
        headers.set('apikey', SUPABASE_ANON_KEY);
      }
      headers.set('Authorization', `Bearer ${SUPABASE_ANON_KEY}`);
    }
  } else if (!headers.has('Authorization') && token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  let requestBody: BodyInit | undefined;
  if (isJsonLike(body)) {
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    requestBody = JSON.stringify(body);
  } else if (body !== undefined) {
    requestBody = body as BodyInit;
  }

  const response = await fetch(url, {
    ...rest,
    headers,
    body: requestBody,
  });

  const contentType = response.headers.get('Content-Type') ?? '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const error = new Error(
      typeof data === 'string' && data ? data : 'Request failed'
    );
    throw Object.assign(error, {
      status: response.status,
      statusText: response.statusText,
      body: data,
    });
  }

  return data as T;
}
