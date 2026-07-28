import { useRef, useState, useEffect } from 'react'
import {
  Camera, FileImage, FileText, X, Upload, CheckCircle,
  AlertCircle, Loader2, Save, ChevronDown, ChevronUp, Info,
  ImageOff,
} from 'lucide-react'
import { api, TIKTOK_LISTING_IDS, staticUrl } from '../api.js'
import CategorySelect from '../components/CategorySelect.jsx'
import { useNavigate } from 'react-router-dom'

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'tiff'])
const MULTI_EXTS = new Set(['pdf', 'pptx', 'ppt'])

function getExt(file) { return file?.name.split('.').pop().toLowerCase() ?? '' }
function getFileMode(file) {
  const ext = getExt(file)
  if (IMAGE_EXTS.has(ext)) return 'single'
  if (MULTI_EXTS.has(ext)) return 'multiple'
  return null
}

// ── Shared input styles ────────────────────────────────────────────────────
const INP = "w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-pink-500 placeholder-gray-700"
const INP_SM = "w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-pink-500 placeholder-gray-700"

function Field({ label, required, children }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs text-gray-500">
        {label}{required && <span className="text-yellow-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

// ── Single product review card ─────────────────────────────────────────────
function ReviewCard({ product, index, onChange, total }) {
  const [expanded, setExpanded] = useState(true)   // open by default

  function set(field, value) {
    if (['title', 'description', 'category_id'].includes(field)) {
      onChange({ ...product, tiktok_payload: { ...product.tiktok_payload, [field]: value } })
    } else {
      onChange({ ...product, [field]: value })
    }
  }

  const p = product.tiktok_payload ?? {}
  const missingPrice = !product.selling_price

  return (
    <div className={`rounded-xl border overflow-hidden ${missingPrice ? 'border-yellow-500/40' : 'border-white/10'}`}>

      {/* ── Card header ─────────────────────────────── */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-white/5 text-left hover:bg-white/[0.07] transition-colors"
      >
        {/* Thumbnail */}
        {staticUrl(product.image_url)
          ? <img src={staticUrl(product.image_url)} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0 border border-white/10" />
          : <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
              <ImageOff size={18} className="text-gray-600" />
            </div>
        }

        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium truncate">{p.title || '(no title yet)'}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs">
            {total > 1 && <span className="text-gray-600">Page {index + 1}/{total}</span>}
            <span className="text-gray-500">
              Cost: <span className={product.cost_price ? 'text-gray-300' : 'text-gray-700'}>
                {product.cost_price ? `$${product.cost_price}` : 'not found'}
              </span>
            </span>
            <span className="text-gray-500">
              Selling: <span className={product.selling_price ? 'text-green-400 font-semibold' : 'text-yellow-400 font-medium'}>
                {product.selling_price ? `$${product.selling_price}` : '⚠ not set'}
              </span>
            </span>
            {product.sku_code && (
              <span className="text-amber-500 font-mono">{product.sku_code}</span>
            )}
            {product.tiktok_listing_id && (
              <span className="text-cyan-500">Slot …{product.tiktok_listing_id.slice(-6)}</span>
            )}
          </div>
        </div>
        {expanded ? <ChevronUp size={14} className="text-gray-600 shrink-0" /> : <ChevronDown size={14} className="text-gray-600 shrink-0" />}
      </button>

      {/* ── Expanded body ───────────────────────────── */}
      {expanded && (
        <div className="px-4 pb-4 pt-3 space-y-4 bg-[#111]">

          {/* Image + core fields side by side on larger screens */}
          <div className="flex gap-4">
            {/* Larger image */}
            <div className="shrink-0">
              {staticUrl(product.image_url)
                ? <img
                    src={staticUrl(product.image_url)}
                    alt="product"
                    className="w-28 h-28 sm:w-36 sm:h-36 rounded-xl object-cover border border-white/10"
                  />
                : <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-xl bg-white/5 flex flex-col items-center justify-center gap-2 border border-white/10">
                    <ImageOff size={24} className="text-gray-700" />
                    <p className="text-gray-700 text-xs">No image</p>
                  </div>
              }
            </div>

            {/* Title + prices */}
            <div className="flex-1 min-w-0 space-y-3">
              <Field label="Title">
                <input
                  value={p.title ?? ''}
                  onChange={(e) => set('title', e.target.value)}
                  maxLength={255}
                  className={INP_SM}
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Selling Price (USD)" required>
                  <input
                    type="number" step="0.01" min="0"
                    value={product.selling_price ?? ''}
                    onChange={(e) => set('selling_price', e.target.value || null)}
                    placeholder="0.00"
                    className={INP_SM}
                  />
                </Field>
                <Field label="Cost Price (USD)">
                  <input
                    type="text" inputMode="decimal"
                    value={product.cost_price ?? ''}
                    onChange={(e) => set('cost_price', e.target.value || null)}
                    placeholder="auto-detected"
                    className={INP_SM}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Category">
                  <CategorySelect
                    value={p.category_id ?? ''}
                    onChange={(v) => set('category_id', v)}
                  />
                </Field>
                <Field label="TikTok Listing Slot">
                  <select
                    value={product.tiktok_listing_id ?? ''}
                    onChange={(e) => set('tiktok_listing_id', e.target.value || null)}
                    className={INP_SM + ' [&>option]:bg-[#1a1a1a]'}
                  >
                    <option value="">— assign later —</option>
                    {TIKTOK_LISTING_IDS.map((id) => (
                      <option key={id} value={id}>{id}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          </div>

          {/* Description */}
          <Field label="Description (sent to TikTok)">
            <textarea
              rows={4}
              value={p.description ?? ''}
              onChange={(e) => set('description', e.target.value)}
              className={INP + ' resize-none text-xs'}
            />
          </Field>

          {/* Source info */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Source City">
              <input
                value={product.source_city ?? ''}
                onChange={(e) => set('source_city', e.target.value || null)}
                placeholder="e.g. Yiwu"
                className={INP_SM}
              />
            </Field>
            <Field label="Factory Name">
              <input
                value={product.factory_name ?? ''}
                onChange={(e) => set('factory_name', e.target.value || null)}
                placeholder="e.g. Bright Co."
                className={INP_SM}
              />
            </Field>
          </div>

          {/* Package dims — read-only preview, user can edit in full edit modal later */}
          {(p.package_weight || p.package_dimensions) && (
            <div className="rounded-lg bg-white/5 px-3 py-2 text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
              {p.package_weight && (
                <span>Weight: <span className="text-gray-300">{p.package_weight.value} {p.package_weight.unit}</span></span>
              )}
              {p.package_dimensions && (
                <span>Dims: <span className="text-gray-300">
                  {p.package_dimensions.length}×{p.package_dimensions.width}×{p.package_dimensions.height} {p.package_dimensions.unit}
                </span></span>
              )}
            </div>
          )}

          {/* Extracted text (collapsible) */}
          {product.extracted_text && (
            <details className="group">
              <summary className="cursor-pointer text-xs text-gray-600 hover:text-gray-400 transition-colors select-none">
                Extracted text from source ▸
              </summary>
              <p className="mt-1 text-xs text-gray-600 font-mono whitespace-pre-wrap leading-relaxed max-h-24 overflow-y-auto">
                {product.extracted_text}
              </p>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Upload page ───────────────────────────────────────────────────────
export default function UploadPage() {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)

  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [mode, setMode] = useState(null)

  const [text, setText] = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [sourceCity, setSourceCity] = useState('')
  const [factoryName, setFactoryName] = useState('')

  // Existing cities/factories fetched from saved products for datalist suggestions
  const [existingCities, setExistingCities] = useState([])
  const [existingFactories, setExistingFactories] = useState([])
  useEffect(() => {
    api.listProducts().then((products) => {
      setExistingCities([...new Set(products.map((p) => p.source_city).filter(Boolean))])
      setExistingFactories([...new Set(products.map((p) => p.factory_name).filter(Boolean))])
    }).catch(() => {})
  }, [])

  // idle → generating → reviewing → saving → done
  const [stage, setStage] = useState('idle')
  const [previews, setPreviews] = useState([])
  const [error, setError] = useState(null)

  function handleFile(f) {
    if (!f) return
    const m = getFileMode(f)
    if (!m) { setError(`Unsupported file type: .${getExt(f)}`); return }
    setFile(f); setMode(m); setError(null); setPreviews([]); setStage('idle')
    setPreview(IMAGE_EXTS.has(getExt(f)) ? URL.createObjectURL(f) : null)
  }

  function handleFileInput(e) { handleFile(e.target.files?.[0]); e.target.value = '' }
  function handleCamera(e) { const f = e.target.files?.[0]; if (f) { handleFile(f); setMode('single') }; e.target.value = '' }
  function clearFile() { setFile(null); setPreview(null); setMode(null); setPreviews([]); setStage('idle'); setError(null) }

  async function handleGenerate(e) {
    e.preventDefault()
    if (!file) return
    setStage('generating')
    setError(null)
    try {
      const fd = new FormData()
      fd.append('upload_type', mode)
      fd.append('file', file)
      if (text) fd.append('text', text)
      if (sellingPrice) fd.append('selling_price', sellingPrice)
      if (sourceCity) fd.append('source_city', sourceCity)
      if (factoryName) fd.append('factory_name', factoryName)
      const products = await api.uploadProducts(fd)
      setPreviews(products)
      setStage('reviewing')
    } catch (err) {
      setError(err.message)
      setStage('idle')
    }
  }

  async function handleConfirm() {
    setStage('saving')
    setError(null)
    try {
      await api.confirmProducts(previews)
      setStage('done')
    } catch (err) {
      setError(err.message)
      setStage('reviewing')
    }
  }

  const allHavePrice = previews.every((p) => p.selling_price)

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-5">
      <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.webp,.bmp,.gif,.pdf,.pptx,.ppt" className="hidden" onChange={handleFileInput} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCamera} />

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Upload Product</h1>
        <p className="text-gray-500 text-sm mt-1">
          {stage === 'idle' && 'Pick a file → Gemini generates the listing → Review & edit → Save to database'}
          {stage === 'generating' && `Processing${mode === 'multiple' ? ' each page' : ''}…`}
          {stage === 'reviewing' && `Review ${previews.length} product${previews.length !== 1 ? 's' : ''} before saving`}
          {stage === 'saving' && 'Saving to database…'}
          {stage === 'done' && 'Saved successfully.'}
        </p>
      </div>

      {/* ── Pick file ─────────────────────────────────────────── */}
      {!file && (
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => cameraInputRef.current.click()}
            className="flex flex-col items-center gap-3 py-8 rounded-2xl border border-white/10 bg-white/5 hover:bg-pink-600/20 hover:border-pink-500/40 transition-all active:scale-95">
            <Camera size={30} className="text-pink-400" />
            <span className="text-sm font-medium text-white">Camera</span>
            <span className="text-xs text-gray-600">Single product</span>
          </button>
          <button onClick={() => fileInputRef.current.click()}
            className="flex flex-col items-center gap-3 py-8 rounded-2xl border border-white/10 bg-white/5 hover:bg-pink-600/20 hover:border-pink-500/40 transition-all active:scale-95">
            <FileImage size={30} className="text-pink-400" />
            <span className="text-sm font-medium text-white">File / Gallery</span>
            <span className="text-xs text-gray-600">Image · PDF · PPTX</span>
          </button>
        </div>
      )}

      {/* ── File chip ─────────────────────────────────────────── */}
      {file && stage !== 'done' && (
        <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
          {preview
            ? <img src={preview} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
            : <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                {MULTI_EXTS.has(getExt(file)) ? <FileText size={18} className="text-pink-400" /> : <FileImage size={18} className="text-pink-400" />}
              </div>
          }
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm truncate">{file.name}</p>
            <span className={`text-xs ${mode === 'single' ? 'text-blue-400' : 'text-purple-400'}`}>
              {mode === 'single' ? 'Single product' : 'Multi-page — each page becomes a product'}
            </span>
          </div>
          {stage === 'idle' && (
            <button onClick={clearFile} className="text-gray-600 hover:text-red-400 transition-colors">
              <X size={16} />
            </button>
          )}
        </div>
      )}

      {/* ── Upload form ───────────────────────────────────────── */}
      {file && stage === 'idle' && (
        <form onSubmit={handleGenerate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Selling Price (USD)</label>
              <input type="number" step="0.01" min="0" placeholder="e.g. 29.99" value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)} className={INP} />
              <p className="text-xs text-gray-700 mt-1">Leave blank → stays null until you set it</p>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Source City</label>
              <input type="text" list="cities-list" placeholder="e.g. Yiwu" value={sourceCity}
                onChange={(e) => setSourceCity(e.target.value)} className={INP} />
              <datalist id="cities-list">
                {existingCities.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Factory Name</label>
            <input type="text" list="factories-list" placeholder="e.g. Shenzhen Bright Co." value={factoryName}
              onChange={(e) => setFactoryName(e.target.value)} className={INP} />
            <datalist id="factories-list">
              {existingFactories.map((f) => <option key={f} value={f} />)}
            </datalist>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Additional Details</label>
            <textarea rows={2} placeholder="Brand, material, size range, special notes…" value={text}
              onChange={(e) => setText(e.target.value)}
              className={INP + ' resize-none'} />
          </div>
          <button type="submit"
            className="w-full bg-pink-600 hover:bg-pink-500 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors active:scale-[0.98]">
            <Upload size={16} /> Generate with Gemini
          </button>
        </form>
      )}

      {/* ── Generating spinner ────────────────────────────────── */}
      {stage === 'generating' && (
        <div className="flex flex-col items-center gap-3 py-16 text-gray-400">
          <Loader2 size={36} className="animate-spin text-pink-400" />
          <p className="text-sm font-medium">Running Gemini Vision{mode === 'multiple' ? ' on all pages in parallel' : ''}…</p>
          <p className="text-xs text-gray-700">Extracting text · detecting product region · generating listing</p>
        </div>
      )}

      {/* ── Review stage ─────────────────────────────────────── */}
      {stage === 'reviewing' && previews.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-start gap-2 bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 text-blue-300 text-xs">
            <Info size={13} className="shrink-0 mt-0.5" />
            <span>
              {previews.length > 1
                ? `${previews.length} products extracted — one per page. `
                : ''}
              Review each card below. Edit anything before saving — nothing hits the database until you click "Confirm & Save".
            </span>
          </div>

          {previews.map((p, i) => (
            <ReviewCard
              key={p.product_source_id}
              product={p}
              index={i}
              total={previews.length}
              onChange={(updated) =>
                setPreviews((prev) => prev.map((x, j) => j === i ? updated : x))
              }
            />
          ))}

          {!allHavePrice && (
            <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-2.5 text-yellow-300 text-xs">
              <AlertCircle size={13} className="shrink-0" />
              Some products are missing a selling price. You can save now and set prices later.
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-300 text-sm">
              <AlertCircle size={14} className="shrink-0 mt-0.5" /> {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button onClick={clearFile}
              className="flex-1 py-3 rounded-xl border border-white/10 text-gray-500 hover:text-white text-sm transition-colors">
              Discard
            </button>
            <button onClick={handleConfirm}
              className="flex-2 flex-grow-[2] bg-green-600 hover:bg-green-500 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors active:scale-[0.98] text-sm">
              <Save size={15} /> Confirm & Save ({previews.length})
            </button>
          </div>
        </div>
      )}

      {/* ── Saving ───────────────────────────────────────────── */}
      {stage === 'saving' && (
        <div className="flex flex-col items-center gap-3 py-16">
          <Loader2 size={32} className="animate-spin text-green-400" />
          <p className="text-gray-400 text-sm">Saving {previews.length} product{previews.length !== 1 ? 's' : ''} to database…</p>
        </div>
      )}

      {/* ── Done ─────────────────────────────────────────────── */}
      {stage === 'done' && (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3 py-10">
            <CheckCircle size={44} className="text-green-400" />
            <p className="text-white text-lg font-semibold">
              {previews.length} product{previews.length !== 1 ? 's' : ''} saved!
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={clearFile}
              className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 hover:text-white text-sm transition-colors">
              Upload another
            </button>
            <button onClick={() => navigate('/products')}
              className="flex-1 bg-pink-600 hover:bg-pink-500 text-white py-3 rounded-xl text-sm font-medium transition-colors">
              View Products →
            </button>
          </div>
        </div>
      )}

      {/* ── Idle error ───────────────────────────────────────── */}
      {stage === 'idle' && error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-300 text-sm">
          <AlertCircle size={14} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}
    </div>
  )
}
