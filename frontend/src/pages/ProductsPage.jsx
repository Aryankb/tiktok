import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  RefreshCw, Send, Pencil, Loader2, CheckCircle, XCircle,
  Clock, AlertCircle, Search, ChevronDown, ChevronRight, ImageOff, Trash2, ArrowUpDown,
} from 'lucide-react'
import { api, TIKTOK_LISTING_IDS } from '../api.js'
import EditProductModal from '../components/EditProductModal.jsx'
import FormulaBar from '../components/FormulaBar.jsx'

const STATUS_BADGE = {
  pending: <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-300 whitespace-nowrap"><Clock size={10} />Pending</span>,
  pushed:  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-500/15 text-green-300 whitespace-nowrap"><CheckCircle size={10} />Pushed</span>,
  failed:  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 whitespace-nowrap"><XCircle size={10} />Failed</span>,
}

function ListingIdCell({ product, onSave }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(product.tiktok_listing_id ?? '')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (val === (product.tiktok_listing_id ?? '')) { setEditing(false); return }
    setSaving(true)
    try {
      await onSave(product.product_source_id, { tiktok_listing_id: val || null })
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  if (saving) return <Loader2 size={12} className="animate-spin text-gray-400 mx-auto" />

  if (editing) {
    return (
      <div className="flex flex-col gap-1">
        <select
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={save}
          className="text-xs bg-[#1a1a1a] border border-pink-500/50 rounded px-2 py-1 text-white outline-none"
        >
          <option value="">— none —</option>
          {TIKTOK_LISTING_IDS.map((id) => (
            <option key={id} value={id}>{id}</option>
          ))}
        </select>
      </div>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group flex items-center gap-1 text-xs font-mono hover:text-pink-300 transition-colors"
      title="Click to assign listing slot"
    >
      {product.tiktok_listing_id
        ? <span className="text-cyan-400">{product.tiktok_listing_id.slice(-6)}</span>
        : <span className="text-gray-700">assign</span>}
      <Pencil size={10} className="text-gray-600 group-hover:text-pink-400 transition-colors" />
    </button>
  )
}

function ExpandedRow({ product }) {
  const p = product.tiktok_payload
  return (
    <tr className="bg-white/[0.02] border-b border-white/5">
      <td colSpan={11} className="px-6 py-4">
        <div className="flex gap-5">
          {/* Large image */}
          {product.image_url
            ? <img src={product.image_url} alt="" className="w-28 h-28 rounded-xl object-cover border border-white/10 shrink-0" />
            : <div className="w-28 h-28 rounded-xl bg-white/5 flex items-center justify-center border border-white/10 shrink-0">
                <ImageOff size={22} className="text-gray-700" />
              </div>
          }
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm flex-1">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">Description</p>
            <p className="text-gray-300 text-xs leading-relaxed line-clamp-5"
              dangerouslySetInnerHTML={{ __html: p?.description || '—' }} />
          </div>
          <div className="space-y-2">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">TikTok Payload Fields</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <Row label="Category ID" value={p?.category_id} />
                <Row label="Brand ID" value={p?.brand_id ?? '—'} />
                <Row label="Package Weight" value={p?.package_weight ? `${p.package_weight.value} ${p.package_weight.unit}` : '—'} />
                <Row label="Dimensions" value={p?.package_dimensions ? `${p.package_dimensions.length}×${p.package_dimensions.width}×${p.package_dimensions.height} ${p.package_dimensions.unit}` : '—'} />
                <Row label="SKU Price" value={p?.skus?.[0]?.original_price ? `$${p.skus[0].original_price.amount}` : '—'} />
                <Row label="Stock" value={p?.skus?.[0]?.stock_infos?.[0]?.available_stock ?? '—'} />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Source Info</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <Row label="City" value={product.source_city ?? '—'} />
                <Row label="Factory" value={product.factory_name ?? '—'} />
                <Row label="File" value={product.source_file ?? '—'} />
                <Row label="Page" value={product.source_page != null ? product.source_page + 1 : '—'} />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">IDs</p>
              <div className="text-xs">
                <Row label="Source ID" value={<span className="font-mono">{product.product_source_id}</span>} />
                {product.sku_code && <Row label="Supplier SKU" value={<span className="font-mono text-amber-400">{product.sku_code}</span>} />}
                <Row label="TikTok Listing" value={<span className="font-mono text-cyan-400">{product.tiktok_listing_id ?? '—'}</span>} />
                {product.updated_at && <Row label="Last modified" value={new Date(product.updated_at).toLocaleString()} />}
              </div>
            </div>
          </div>
        </div>
        </div>
      </td>
    </tr>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex gap-1">
      <span className="text-gray-600 shrink-0">{label}:</span>
      <span className="text-gray-300 truncate">{value}</span>
    </div>
  )
}

function FilterSelect({ value, onChange, children }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-pink-500 [&>option]:bg-[#1a1a1a]"
    >
      {children}
    </select>
  )
}

export default function ProductsPage() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [pushing, setPushing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [pushResults, setPushResults] = useState([])
  const [editingProduct, setEditingProduct] = useState(null)
  const [expandedIds, setExpandedIds] = useState(new Set())

  // Filters
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterCity, setFilterCity] = useState('')
  const [filterFactory, setFilterFactory] = useState('')
  const [filterListing, setFilterListing] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  // 'newest' | 'oldest'
  const [sortOrder, setSortOrder] = useState('newest')

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setProducts(await api.listProducts())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchProducts() }, [fetchProducts])

  // Unique values for filter dropdowns
  const cities = useMemo(() => [...new Set(products.map((p) => p.source_city).filter(Boolean))], [products])
  const factories = useMemo(() => [...new Set(products.map((p) => p.factory_name).filter(Boolean))], [products])
  const categories = useMemo(() => [...new Set(products.map((p) => p.category_id).filter(Boolean))], [products])

  // Filtered list
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return products.filter((p) => {
      if (filterStatus !== 'all' && p.push_status !== filterStatus) return false
      if (filterCity && p.source_city !== filterCity) return false
      if (filterFactory && p.factory_name !== filterFactory) return false
      if (filterListing && p.tiktok_listing_id !== filterListing) return false
      if (filterCategory && p.category_id !== filterCategory) return false
      if (q) {
        const hay = [p.title, p.product_source_id, p.source_city, p.factory_name, p.tiktok_listing_id, p.sku_code]
          .join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [products, search, filterStatus, filterCity, filterFactory, filterListing, filterCategory])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const ta = a.updated_at || a.created_at || ''
      const tb = b.updated_at || b.created_at || ''
      return sortOrder === 'newest' ? tb.localeCompare(ta) : ta.localeCompare(tb)
    })
  }, [filtered, sortOrder])

  function toggleExpand(id) {
    setExpandedIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleSelect(id) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleAll() {
    const unpushed = filtered.filter((p) => p.push_status !== 'pushed').map((p) => p.product_source_id)
    const allSel = unpushed.every((id) => selected.has(id))
    setSelected(allSel ? new Set() : new Set(unpushed))
  }

  async function handlePush() {
    if (selected.size === 0) return
    setPushing(true)
    setPushResults([])
    try {
      const results = await api.pushProducts([...selected])
      setPushResults(results)
      setSelected(new Set())
      await fetchProducts()
    } catch (err) {
      setError(err.message)
    } finally {
      setPushing(false)
    }
  }

  async function handleDelete() {
    if (selected.size === 0) return
    if (!window.confirm(`Delete ${selected.size} product${selected.size !== 1 ? 's' : ''}? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await api.deleteProducts([...selected])
      setSelected(new Set())
      await fetchProducts()
    } catch (err) {
      setError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  async function handleInlineEdit(id, patch) {
    const updated = await api.editProduct(id, patch)
    setProducts((prev) => prev.map((p) => p.product_source_id === id ? updated : p))
  }

  function onProductSaved(updated) {
    setProducts((prev) => prev.map((p) => p.product_source_id === updated.product_source_id ? updated : p))
  }

  const unpushedFiltered = filtered.filter((p) => p.push_status !== 'pushed').map((p) => p.product_source_id)
  const allUnpushedSelected = unpushedFiltered.length > 0 && unpushedFiltered.every((id) => selected.has(id))

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-gray-400">
      <Loader2 size={24} className="animate-spin mr-2" /> Loading products…
    </div>
  )

  return (
    <div className="space-y-4 py-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">Products</h1>
          <p className="text-gray-500 text-sm">
            {products.length} total · {products.filter((p) => p.push_status === 'pushed').length} pushed
            {filtered.length !== products.length && ` · ${filtered.length} shown`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={fetchProducts} className="p-2 rounded-lg border border-white/10 text-gray-400 hover:text-white transition-colors" title="Refresh">
            <RefreshCw size={16} />
          </button>
          <button
            onClick={handleDelete}
            disabled={selected.size === 0 || deleting}
            className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-600 disabled:bg-red-900/40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Delete {selected.size > 0 ? `(${selected.size})` : ''}
          </button>
          <button
            onClick={handlePush}
            disabled={selected.size === 0 || pushing}
            className="flex items-center gap-2 px-4 py-2 bg-pink-600 hover:bg-pink-500 disabled:bg-pink-900 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {pushing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Push {selected.size > 0 ? `(${selected.size})` : ''}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex-1 min-w-[160px] relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" />
          <input
            placeholder="Search title, ID, city, factory, SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-white placeholder-gray-700 focus:outline-none focus:border-pink-500 text-sm"
          />
        </div>
        <FilterSelect value={filterStatus} onChange={setFilterStatus} defaultLabel="All statuses">
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="pushed">Pushed</option>
          <option value="failed">Failed</option>
        </FilterSelect>
        {cities.length > 0 && (
          <FilterSelect value={filterCity} onChange={setFilterCity} defaultLabel="All cities">
            <option value="">All cities</option>
            {cities.map((c) => <option key={c} value={c}>{c}</option>)}
          </FilterSelect>
        )}
        {factories.length > 0 && (
          <FilterSelect value={filterFactory} onChange={setFilterFactory} defaultLabel="All factories">
            <option value="">All factories</option>
            {factories.map((f) => <option key={f} value={f}>{f}</option>)}
          </FilterSelect>
        )}
        {categories.length > 0 && (
          <FilterSelect value={filterCategory} onChange={setFilterCategory} defaultLabel="All categories">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </FilterSelect>
        )}
        <FilterSelect value={filterListing} onChange={setFilterListing} defaultLabel="All slots">
          <option value="">All slots</option>
          {TIKTOK_LISTING_IDS.map((id) => (
            <option key={id} value={id}>…{id.slice(-6)}</option>
          ))}
        </FilterSelect>
        <button
          onClick={() => setSortOrder((s) => s === 'newest' ? 'oldest' : 'newest')}
          className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300 hover:text-white hover:border-white/20 transition-colors"
          title="Toggle sort order"
        >
          <ArrowUpDown size={13} />
          {sortOrder === 'newest' ? 'Newest first' : 'Oldest first'}
        </button>
      </div>

      {/* Formula bar — operates on currently selected IDs */}
      <FormulaBar selectedIds={[...selected]} onApplied={fetchProducts} />

      {/* Push results */}
      {pushResults.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-1.5">
          <p className="text-xs font-medium text-gray-400">Push results</p>
          {pushResults.map((r) => (
            <div key={r.product_source_id} className="flex items-center gap-2 text-xs">
              {r.success
                ? <CheckCircle size={12} className="text-green-400 shrink-0" />
                : <XCircle size={12} className="text-red-400 shrink-0" />}
              <span className="text-gray-500 font-mono">{r.product_source_id.slice(0, 14)}…</span>
              {r.success
                ? <span className="text-green-400">→ {r.tiktok_product_id}</span>
                : <span className="text-red-400 truncate">{r.error}</span>}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-300 text-sm">
          <AlertCircle size={14} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {/* Table */}
      {sorted.length === 0 ? (
        <div className="text-center py-16 text-gray-600">
          {products.length === 0
            ? <><p>No products yet.</p><a href="/" className="text-pink-400 underline">Upload one.</a></>
            : 'No products match the current filters.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-white/10 bg-white/5 text-gray-500 text-xs uppercase tracking-wider">
                <th className="w-8 px-3 py-3">
                  <input type="checkbox" checked={allUnpushedSelected} onChange={toggleAll} className="accent-pink-500 cursor-pointer" />
                </th>
                <th className="w-6 px-1 py-3" />
                <th className="w-12 px-2 py-3" />
                <th className="px-4 py-3 text-left">Title</th>
                <th className="px-3 py-3 text-right">Cost</th>
                <th className="px-3 py-3 text-right">Selling</th>
                <th className="px-3 py-3 text-center">City</th>
                <th className="px-3 py-3 text-center">Factory</th>
                <th className="px-3 py-3 text-center">Listing Slot</th>
                <th className="px-3 py-3 text-center">Status</th>
                <th className="px-3 py-3 text-center">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {sorted.map((p) => {
                const isPushed = p.push_status === 'pushed'
                const isSelected = selected.has(p.product_source_id)
                const isExpanded = expandedIds.has(p.product_source_id)

                return [
                  <tr
                    key={p.product_source_id}
                    className={`hover:bg-white/[0.03] transition-colors ${isSelected ? 'bg-pink-500/5' : ''}`}
                  >
                    {/* Checkbox */}
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={isPushed}
                        onChange={() => toggleSelect(p.product_source_id)}
                        className="accent-pink-500 cursor-pointer disabled:opacity-25"
                      />
                    </td>

                    {/* Expand toggle */}
                    <td className="px-1 py-2 text-center">
                      <button
                        onClick={() => toggleExpand(p.product_source_id)}
                        className="text-gray-600 hover:text-gray-300 transition-colors"
                      >
                        {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </button>
                    </td>

                    {/* Image thumbnail */}
                    <td className="px-2 py-2">
                      {p.image_url
                        ? <img src={p.image_url} alt="" className="w-10 h-10 rounded-lg object-cover border border-white/10" />
                        : <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center border border-white/5">
                            <ImageOff size={14} className="text-gray-700" />
                          </div>
                      }
                    </td>

                    {/* Title + source ID */}
                    <td className="px-4 py-2">
                      <p className="text-white font-medium truncate max-w-[200px]">{p.title || '—'}</p>
                      <p className="text-gray-700 text-xs font-mono mt-0.5 truncate max-w-[200px]">{p.product_source_id.slice(0, 18)}…</p>
                    </td>

                    {/* Cost */}
                    <td className="px-3 py-3 text-right text-gray-400">
                      {p.cost_price ? `$${p.cost_price}` : <span className="text-gray-700">—</span>}
                    </td>

                    {/* Selling */}
                    <td className="px-3 py-3 text-right">
                      {p.selling_price
                        ? <span className="text-green-400 font-medium">${p.selling_price}</span>
                        : <span className="text-yellow-600 text-xs">not set</span>}
                    </td>

                    {/* City */}
                    <td className="px-3 py-3 text-center">
                      <span className="text-gray-400 text-xs">{p.source_city ?? <span className="text-gray-700">—</span>}</span>
                    </td>

                    {/* Factory */}
                    <td className="px-3 py-3 text-center">
                      <span className="text-gray-400 text-xs truncate max-w-[90px] block">{p.factory_name ?? <span className="text-gray-700">—</span>}</span>
                    </td>

                    {/* TikTok Listing Slot — inline selector */}
                    <td className="px-3 py-3 text-center">
                      <ListingIdCell product={p} onSave={handleInlineEdit} />
                    </td>

                    {/* Status */}
                    <td className="px-3 py-3 text-center">{STATUS_BADGE[p.push_status] ?? STATUS_BADGE.pending}</td>

                    {/* Edit */}
                    <td className="px-3 py-3 text-center">
                      <button
                        onClick={() => setEditingProduct(p)}
                        className="p-1.5 rounded-lg text-gray-600 hover:text-white hover:bg-white/10 transition-colors"
                      >
                        <Pencil size={13} />
                      </button>
                    </td>
                  </tr>,

                  isExpanded && <ExpandedRow key={`${p.product_source_id}-exp`} product={p} />,
                ]
              })}
            </tbody>
          </table>
        </div>
      )}

      {editingProduct && (
        <EditProductModal
          product={editingProduct}
          onClose={() => setEditingProduct(null)}
          onSaved={(updated) => { onProductSaved(updated); setEditingProduct(null) }}
        />
      )}
    </div>
  )
}
