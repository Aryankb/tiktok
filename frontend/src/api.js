export const API_HOST = import.meta.env.VITE_API_URL ?? ''
const BASE = `${API_HOST}/api/products`
const CATEGORIES_BASE = `${API_HOST}/api/categories`
const ORDERS_BASE = `${API_HOST}/api/orders`

export function staticUrl(path) {
  if (!path) return null
  if (path.startsWith('http')) return path
  return `${API_HOST}${path}`
}

const EXTRA_HEADERS = API_HOST.includes('ngrok') ? { 'ngrok-skip-browser-warning': '1' } : {}

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    ...options,
    headers: { ...EXTRA_HEADERS, ...(options.headers ?? {}) },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

export const TIKTOK_LISTING_IDS = [
  '1734906684322056174',
  '1734896420757145582',
  '1734895336419919854',
  '1734904640940181486',
  '1734893796582459374',
  '1734900396249745390',
  '1734905199303690222',
  '1734899819586029550',
  '1734895630557677550',
  '1735231559956793326',
]

export const api = {
  // Upload file — returns {job_id, status} immediately; processing happens in background
  uploadProducts: (formData) =>
    fetch(BASE + '/upload', { method: 'POST', body: formData, headers: EXTRA_HEADERS }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail || res.statusText)
      }
      return res.json()
    }),

  getJobs: () => request('/jobs'),

  listProducts: () => request('/'),

  getProduct: (id) => request(`/${id}`),

  editProduct: (id, updates) =>
    request(`/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }),

  // ids: array of product_source_ids to apply formula to (empty = all)
  bulkEditPrices: (body) =>
    request('/bulk-price', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  pushProducts: (ids) =>
    request('/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_source_ids: ids }),
    }),

  deleteProducts: (ids) =>
    request('/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_source_ids: ids }),
    }),
}

export const categoryApi = {
  list: () => fetch(CATEGORIES_BASE + '/', { headers: EXTRA_HEADERS }).then(async (res) => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(err.detail || res.statusText)
    }
    return res.json()
  }),
}

async function ordersRequest(path, options = {}) {
  const res = await fetch(ORDERS_BASE + path, {
    ...options,
    headers: { ...EXTRA_HEADERS, ...(options.headers ?? {}) },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

export const ordersApi = {
  sync: (body) =>
    ordersRequest('/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null))
    ).toString()
    return ordersRequest(qs ? `?${qs}` : '')
  },

  listings: () => ordersRequest('/listings'),

  exportUrl: (listingId, dateFrom, dateTo, productName) => {
    const qs = new URLSearchParams()
    if (dateFrom) qs.set('date_from', dateFrom)
    if (dateTo) qs.set('date_to', dateTo)
    if (productName) qs.set('product_name', productName)
    return `${ORDERS_BASE}/export/${encodeURIComponent(listingId)}${qs.toString() ? '?' + qs.toString() : ''}`
  },
}
