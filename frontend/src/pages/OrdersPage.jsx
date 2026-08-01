import { useEffect, useState, useMemo } from 'react'
import {
  RefreshCw, Download, Loader2, Package, ChevronDown, ChevronRight, ShoppingCart,
} from 'lucide-react'
import { ordersApi } from '../api.js'

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

function ListingCard({ listing, dateFrom, dateTo }) {
  const exportUrl = ordersApi.exportUrl(listing.listing_id, dateFrom, dateTo, listing.product_name)

  return (
    <div className="flex items-center justify-between bg-[#1a1a1a] border border-white/8 rounded-lg px-4 py-3">
      <div className="flex-1 min-w-0 mr-4">
        <p className="text-xs font-mono text-cyan-400">{listing.listing_id}</p>
        {listing.product_name && (
          <p className="text-sm text-white font-medium mt-0.5 truncate">{listing.product_name}</p>
        )}
        <p className="text-xs text-gray-400 mt-0.5">
          {listing.latest_order_date && <span className="text-gray-500 mr-2">{listing.latest_order_date}</span>}
          {listing.total_orders} orders · <span className="text-white font-medium">{listing.total_units} units</span>
        </p>
      </div>
      <a
        href={exportUrl}
        download
        className="flex-shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
      >
        <Download size={13} /> Export Excel
      </a>
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
          {!loading && (
            <span className="text-xs text-gray-500">
              {orders.length} orders · {totalQty} units
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 text-gray-400 hover:text-white transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleSync}
            disabled={syncing || !dateFrom || !dateTo}
            className="flex items-center gap-1.5 text-sm px-4 py-1.5 bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Sync from TikTok
          </button>
        </div>
      </div>

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
          Apply filters
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
          {listings.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-10">
              No listings found. Sync orders first.
            </p>
          ) : (
            listings.map((l) => (
              <ListingCard key={l.listing_id} listing={l} dateFrom={dateFrom} dateTo={dateTo} />
            ))
          )}
        </div>
      )}

      {/* Orders tab */}
      {!loading && tab === 'orders' && (
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
      )}
    </div>
  )
}
