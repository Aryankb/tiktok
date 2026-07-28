import { useState } from 'react'
import { X, Save, Loader2 } from 'lucide-react'
import { api, TIKTOK_LISTING_IDS } from '../api.js'
import CategorySelect from './CategorySelect.jsx'

export default function EditProductModal({ product, onClose, onSaved }) {
  const currentStock = product.tiktok_payload?.skus?.[0]?.stock_infos?.[0]?.available_stock ?? 0

  const [form, setForm] = useState({
    title: product.title ?? '',
    description: product.description ?? '',
    category_id: product.category_id ?? '',
    cost_price: product.cost_price ?? '',
    selling_price: product.selling_price ?? '',
    source_city: product.source_city ?? '',
    factory_name: product.factory_name ?? '',
    tiktok_listing_id: product.tiktok_listing_id ?? '',
    available_stock: String(currentStock),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const updates = {}
      const strFields = ['title', 'description', 'category_id', 'cost_price', 'selling_price', 'source_city', 'factory_name', 'tiktok_listing_id']
      for (const f of strFields) {
        const orig = product[f] ?? ''
        if (form[f] !== orig) {
          updates[f] = form[f] || null
        }
      }
      if (form.available_stock !== String(currentStock)) {
        updates.available_stock = parseInt(form.available_stock, 10) || 0
      }
      const updated = await api.editProduct(product.product_source_id, updates)
      onSaved(updated)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-white font-semibold text-base">Edit Product</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <Field label="Title">
            <input value={form.title} onChange={(e) => set('title', e.target.value)} className="inp" maxLength={255} />
          </Field>

          <Field label="Description">
            <textarea rows={4} value={form.description} onChange={(e) => set('description', e.target.value)} className="inp resize-none" />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Cost Price (USD)">
              <input type="text" inputMode="decimal" value={form.cost_price} onChange={(e) => set('cost_price', e.target.value)} className="inp" placeholder="0.00" />
            </Field>
            <Field label="Selling Price (USD)">
              <input type="number" step="0.01" value={form.selling_price} onChange={(e) => set('selling_price', e.target.value)} className="inp" placeholder="0.00" />
            </Field>
            <Field label="Stock (units)">
              <input type="number" min="0" step="1" value={form.available_stock} onChange={(e) => set('available_stock', e.target.value)} className="inp" placeholder="0" />
            </Field>
          </div>

          <Field label="Category">
            <CategorySelect value={form.category_id} onChange={(v) => set('category_id', v)} className="[&>button]:!py-2 [&>button]:!text-sm [&>button]:!rounded-lg" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Source City">
              <input value={form.source_city} onChange={(e) => set('source_city', e.target.value)} className="inp" placeholder="e.g. Yiwu" />
            </Field>
            <Field label="Factory Name">
              <input value={form.factory_name} onChange={(e) => set('factory_name', e.target.value)} className="inp" placeholder="e.g. Bright Co." />
            </Field>
          </div>

          <Field label="TikTok Listing Slot">
            <select value={form.tiktok_listing_id} onChange={(e) => set('tiktok_listing_id', e.target.value)} className="inp">
              <option value="">— not assigned —</option>
              {TIKTOK_LISTING_IDS.map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          </Field>

          {error && (
            <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        <div className="px-5 py-4 border-t border-white/10 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white text-sm transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-500 disabled:bg-pink-900 disabled:cursor-not-allowed text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Save
          </button>
        </div>
      </div>

      <style>{`.inp { width: 100%; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 8px 10px; color: white; font-size: 13px; outline: none; box-sizing: border-box; } .inp:focus { border-color: #ec4899; } .inp option { background: #1a1a1a; }`}</style>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs text-gray-400 font-medium">{label}</label>
      {children}
    </div>
  )
}
