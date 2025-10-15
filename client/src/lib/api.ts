const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'VITE_API_URL=https://spotz-backend.onrender.com';



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

export async function apiFetch<T = unknown>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { headers: headersInit, body, ...rest } = options;
  const headers = new Headers(headersInit ?? {});

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (token && !headers.has('Authorization')) {
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

  const url = path.startsWith('http')
    ? path
    : `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;

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
