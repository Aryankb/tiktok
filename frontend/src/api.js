const BASE = '/api/products'
const CATEGORIES_BASE = '/api/categories'

async function request(path, options = {}) {
  const res = await fetch(BASE + path, options)
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
  // Returns preview records — NOT saved to DB yet
  uploadProducts: (formData) =>
    fetch(BASE + '/upload', { method: 'POST', body: formData }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail || res.statusText)
      }
      return res.json()
    }),

  // Save confirmed (possibly edited) previews to DB
  confirmProducts: (products) =>
    request('/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(products),
    }),

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
  list: () => fetch(CATEGORIES_BASE + '/').then(async (res) => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(err.detail || res.statusText)
    }
    return res.json()
  }),
}
