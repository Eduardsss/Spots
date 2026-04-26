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

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { headers: headersInit, body, ...rest } = options
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

  const response = await fetch(url, {
    ...rest,
    headers,
    body: requestBody
  })

  const contentType = response.headers.get('Content-Type') ?? ''
  const isJson = contentType.includes('application/json')
  const data = isJson ? await response.json() : await response.text()

  if (!response.ok) {
    const error = new Error(
      typeof data === 'string' && data ? data : 'Request failed'
    )
    throw Object.assign(error, {
      status: response.status,
      statusText: response.statusText,
      body: data
    })
  }

  return data as T
}
