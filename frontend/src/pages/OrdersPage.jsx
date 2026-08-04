import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import {
  RefreshCw, Download, Loader2, Package, ChevronDown, ChevronRight, ShoppingCart, TrendingUp, FileDown,
} from 'lucide-react'
import { ordersApi, API_HOST } from '../api.js'

const EXTRA_HEADERS = API_HOST.includes('ngrok') ? { 'ngrok-skip-browser-warning': '1' } : {}

const today = () => new Date().toISOString().slice(0, 10)
const monthAgo = () => {
  const d = new Date()
  d.setDate(d.getDate() - 60)
  return d.toISOString().slice(0, 10)
}

const STATUS_BADGE = {
  UNPAID:               <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-300">Unpaid</span>,
  ON_HOLD:              <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-300">On Hold</span>,
  AWAITING_SHIPMENT:    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300">Awaiting Shipment</span>,
  AWAITING_COLLECTION:  <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300">Awaiting Collection</span>,
  IN_TRANSIT:           <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300">In Transit</span>,
  DELIVERED:            <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/15 text-green-300">Delivered</span>,
  COMPLETED:            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">Completed</span>,
  CANCELLED:            <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-300">Cancelled</span>,
}

function fmtTs(ts) {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleString()
}

function OrderRow({ order }) {
  const [open, setOpen] = useState(false)
  const Icon = open ? ChevronDown : ChevronRight

  return (
    <>
      <tr
        className="border-b border-white/5 hover:bg-white/3 cursor-pointer select-none"
        onClick={() => setOpen((v) => !v)}
      >
        <td className="p-3 w-5">
          <Icon size={13} className="text-gray-500" />
        </td>
        <td className="p-3 font-mono text-xs text-cyan-400">{order.order_id}</td>
        <td className="p-3">{STATUS_BADGE[order.status] ?? <span className="text-xs text-gray-400">{order.status}</span>}</td>
        <td className="p-3 text-xs text-gray-300">{fmtTs(order.create_time)}</td>
        <td className="p-3 text-xs text-gray-300">
          {order.currency} {order.total_amount ?? '—'}
        </td>
        <td className="p-3 text-xs text-gray-400">
          {order.line_items.length} item{order.line_items.length !== 1 ? 's' : ''}
        </td>
        <td className="p-3 text-xs font-mono text-amber-400">
          {[...new Set(order.line_items.map((i) => i.listing_id).filter(Boolean))].map((l) => (
            <span key={l} className="block">{l.slice(-8)}</span>
          ))}
        </td>
      </tr>
      {open && (
        <tr className="bg-[#111]">
          <td colSpan={7} className="p-0">
            <div className="px-6 py-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-white/5">
                    <th className="text-left py-1 pr-3 font-medium">Image</th>
                    <th className="text-left py-1 pr-3 font-medium">Product</th>
                    <th className="text-left py-1 pr-3 font-medium">Variation</th>
                    <th className="text-left py-1 pr-3 font-medium">Seller SKU</th>
                    <th className="text-left py-1 pr-3 font-medium">Qty</th>
                    <th className="text-left py-1 pr-3 font-medium">Price</th>
                    <th className="text-left py-1 font-medium">Listing</th>
                  </tr>
                </thead>
                <tbody>
                  {order.line_items.map((item) => (
                    <tr key={item.order_line_item_id} className="border-b border-white/5">
                      <td className="py-2 pr-3">
                        {item.sku_image
                          ? <img src={item.sku_image} alt="" className="w-10 h-10 object-cover rounded" />
                          : <div className="w-10 h-10 bg-[#222] rounded flex items-center justify-center text-gray-600"><Package size={14} /></div>
                        }
                      </td>
                      <td className="py-2 pr-3 max-w-xs truncate text-gray-200">{item.product_name}</td>
                      <td className="py-2 pr-3 text-gray-400">{item.sku_name || '—'}</td>
                      <td className="py-2 pr-3 font-mono text-amber-400">{item.seller_sku || '—'}</td>
                      <td className="py-2 pr-3 text-white font-bold">{item.quantity}</td>
                      <td className="py-2 pr-3 text-gray-300">{item.currency} {item.sale_price || '—'}</td>
                      <td className="py-2 font-mono text-cyan-400">{item.listing_id ? item.listing_id.slice(-8) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

const STATUS_COLOR = {
  AWAITING_SHIPMENT:   'text-blue-300',
  AWAITING_COLLECTION: 'text-cyan-300',
  IN_TRANSIT:          'text-purple-300',
  DELIVERED:           'text-green-300',
  COMPLETED:           'text-emerald-300',
  CANCELLED:           'text-red-300',
  UNPAID:              'text-yellow-300',
  ON_HOLD:             'text-orange-300',
}

function ActivityFeed({ listingId }) {
  const [items, setItems] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(null)
  const [revenue, setRevenue] = useState(null)
  const [currency, setCurrency] = useState('SGD')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef(null)

  const loadPage = useCallback(async (p) => {
    if (loading) return
    setLoading(true)
    try {
      const data = await ordersApi.activity(listingId, p, 20)
      setTotal(data.total)
      setRevenue(data.total_revenue)
      setCurrency(data.currency)
      setItems(prev => p === 1 ? data.items : [...prev, ...data.items])
      setPage(p)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [listingId, loading])

  useEffect(() => { loadPage(1) }, [listingId])

  function onScroll() {
    const el = scrollRef.current
    if (!el || loading) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) {
      if (total !== null && items.length < total) {
        loadPage(page + 1)
      }
    }
  }

  return (
    <div className="border-t border-white/8 mt-3 pt-3">
      {revenue !== null && (
        <div className="flex items-center gap-1.5 mb-2 text-xs text-gray-400">
          <TrendingUp size={13} className="text-emerald-400" />
          <span>Total revenue:</span>
          <span className="text-emerald-300 font-semibold">{currency} {revenue.toFixed(2)}</span>
          {total !== null && <span className="ml-auto text-gray-600">{total} orders</span>}
        </div>
      )}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="max-h-52 overflow-y-auto space-y-1 pr-1"
      >
        {items.map((order, i) => (
          <div key={order.order_id + i} className="flex items-start gap-2 text-xs py-1 border-b border-white/5 last:border-0">
            <span className={`shrink-0 font-medium w-28 truncate ${STATUS_COLOR[order.status] ?? 'text-gray-400'}`}>
              {order.status.replace(/_/g, ' ')}
            </span>
            <span className="shrink-0 text-gray-500 w-28">
              {order.update_time
                ? new Date(order.update_time * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : '—'}
            </span>
            <span className="text-gray-300 truncate flex-1">
              {order.line_items.map(i => `${i.sku_name || i.seller_sku || '?'} ×${i.quantity}`).join(', ')}
            </span>
            {order.total_amount && (
              <span className="shrink-0 text-white font-medium">{order.currency} {order.total_amount}</span>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex justify-center py-2">
            <Loader2 size={14} className="animate-spin text-gray-500" />
          </div>
        )}
        {!loading && items.length === 0 && (
          <p className="text-xs text-gray-600 py-2 text-center">No orders yet</p>
        )}
        {!loading && total !== null && items.length >= total && items.length > 0 && (
          <p className="text-xs text-gray-600 py-1 text-center">All {total} orders loaded</p>
        )}
      </div>
    </div>
  )
}

function ListingCard({ listing, dateFrom, dateTo, selected, onToggleSelect }) {
  const [open, setOpen] = useState(false)
  const exportUrl = ordersApi.exportUrl(listing.listing_id, dateFrom, dateTo, listing.product_name)

  return (
    <div className={`bg-[#1a1a1a] border rounded-lg px-4 py-3 transition-colors ${selected ? 'border-emerald-500/50' : 'border-white/8'}`}>
      <div className="flex items-center justify-between gap-2">
        {/* Checkbox */}
        <button
          onClick={() => onToggleSelect(listing.listing_id)}
          className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
            selected ? 'bg-emerald-500 border-emerald-500' : 'border-white/20 hover:border-emerald-500/50'
          }`}
        >
          {selected && <span className="text-white text-xs font-bold leading-none">✓</span>}
        </button>

        <button
          className="flex-1 min-w-0 mr-2 text-left"
          onClick={() => setOpen(v => !v)}
        >
          <div className="flex items-center gap-2">
            <ChevronDown size={13} className={`text-gray-500 transition-transform shrink-0 ${open ? '' : '-rotate-90'}`} />
            <div className="min-w-0">
              <p className="text-xs font-mono text-cyan-400">{listing.listing_id}</p>
              {listing.product_name && (
                <p className="text-sm text-white font-medium mt-0.5 truncate">{listing.product_name}</p>
              )}
              <p className="text-xs text-gray-400 mt-0.5">
                {listing.latest_order_date && <span className="text-gray-500 mr-2">{listing.latest_order_date}</span>}
                {listing.total_orders} orders · <span className="text-white font-medium">{listing.total_units} units</span>
              </p>
            </div>
          </div>
        </button>
        <a
          href={exportUrl}
          download
          className="flex-shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
        >
          <Download size={13} /> Export
        </a>
      </div>
      {open && <ActivityFeed listingId={listing.listing_id} />}
    </div>
  )
}

export default function OrdersPage() {
  const [orders, setOrders] = useState([])
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState(null)
  const [syncResult, setSyncResult] = useState(null)

  const [dateFrom, setDateFrom] = useState(monthAgo())
  const [dateTo, setDateTo] = useState(today())
  const [filterStatus, setFilterStatus] = useState('')
  const [filterListing, setFilterListing] = useState('')
  const [tab, setTab] = useState('listings') // 'listings' | 'orders'
  const [selectedListings, setSelectedListings] = useState(new Set())
  const [exportingMulti, setExportingMulti] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [o, l] = await Promise.all([
        ordersApi.list({
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          status: filterStatus || undefined,
          listing_id: filterListing || undefined,
        }),
        ordersApi.listings(),
      ])
      setOrders(o)
      setListings(l)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    setError(null)
    try {
      const result = await ordersApi.sync({ date_from: dateFrom, date_to: dateTo })
      setSyncResult(result)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSyncing(false)
    }
  }

  function toggleListingSelect(id) {
    setSelectedListings(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function handleExportMulti() {
    if (selectedListings.size === 0) return
    setExportingMulti(true)
    try {
      const res = await fetch(ordersApi.exportMultiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...EXTRA_HEADERS },
        body: JSON.stringify({
          listing_ids: [...selectedListings],
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `combined_export.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e.message)
    } finally {
      setExportingMulti(false)
    }
  }

  const totalQty = useMemo(
    () => orders.reduce((s, o) => s + o.line_items.reduce((ss, i) => ss + i.quantity, 0), 0),
    [orders],
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingCart size={18} className="text-pink-400" />
          <h1 className="text-lg font-semibold text-white">Orders</h1>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing || !dateFrom || !dateTo}
          className="flex items-center gap-1.5 text-sm px-4 py-1.5 bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white rounded-lg transition-colors"
        >
          {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Sync from TikTok
        </button>
      </div>

      {/* Sync result banner */}
      {syncResult && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-2 text-sm text-emerald-300">
          Synced {syncResult.fetched} orders · Saved {syncResult.saved} · {syncResult.skipped} skipped
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-white/10">
        {[['listings', 'Factories / Listings'], ['orders', 'All Orders']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`text-sm px-4 py-2 border-b-2 transition-colors ${
              tab === key
                ? 'border-pink-500 text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-gray-500">
          <Loader2 className="animate-spin mr-2" size={18} />
          Loading…
        </div>
      )}

      {/* Listings tab */}
      {!loading && tab === 'listings' && (
        <div className="space-y-2">
          {selectedListings.size > 0 && (
            <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-2">
              <span className="text-sm text-emerald-300">{selectedListings.size} listing{selectedListings.size !== 1 ? 's' : ''} selected</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedListings(new Set())}
                  className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded transition-colors"
                >
                  Clear
                </button>
                <button
                  onClick={handleExportMulti}
                  disabled={exportingMulti}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  {exportingMulti ? <Loader2 size={12} className="animate-spin" /> : <FileDown size={12} />}
                  Export {selectedListings.size} combined
                </button>
              </div>
            </div>
          )}
          {listings.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-10">
              No listings found. Sync orders first.
            </p>
          ) : (
            listings.map((l) => (
              <ListingCard
                key={l.listing_id}
                listing={l}
                dateFrom={dateFrom}
                dateTo={dateTo}
                selected={selectedListings.has(l.listing_id)}
                onToggleSelect={toggleListingSelect}
              />
            ))
          )}
        </div>
      )}

      {/* Orders tab */}
      {!loading && tab === 'orders' && (
        <div className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="text-sm bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-1.5 text-white outline-none focus:border-pink-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="text-sm bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-1.5 text-white outline-none focus:border-pink-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="text-sm bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-1.5 text-white outline-none focus:border-pink-500"
            >
              <option value="">All statuses</option>
              {['UNPAID','ON_HOLD','AWAITING_SHIPMENT','AWAITING_COLLECTION','IN_TRANSIT','DELIVERED','COMPLETED','CANCELLED'].map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm px-4 py-1.5 bg-[#1a1a1a] border border-white/10 hover:border-pink-500/50 text-gray-300 hover:text-white rounded-lg transition-colors"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Apply filters
          </button>
          {!loading && <span className="text-xs text-gray-500 self-center">{orders.length} orders · {totalQty} units</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-white/10">
                <th className="w-5 p-3" />
                <th className="text-left p-3 font-medium">Order ID</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Created</th>
                <th className="text-left p-3 font-medium">Total</th>
                <th className="text-left p-3 font-medium">Items</th>
                <th className="text-left p-3 font-medium">Listing</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-500 text-sm">
                    No orders found.
                  </td>
                </tr>
              ) : (
                orders.map((o) => <OrderRow key={o.order_id} order={o} />)
              )}
            </tbody>
          </table>
        </div>
        </div>
      )}
    </div>
  )
}
