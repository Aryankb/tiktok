import { useRef, useState, useEffect } from 'react'
import {
  Camera, FileImage, FileText, X, Upload, CheckCircle,
  AlertCircle, Loader2,
} from 'lucide-react'
import { api } from '../api.js'
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

const INP = "w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-pink-500 placeholder-gray-700"

function jobColor(status) {
  if (status === 'done') return 'text-green-400'
  if (status === 'partial') return 'text-yellow-400'
  if (status === 'error') return 'text-red-400'
  return 'text-pink-400'
}
function jobIcon(status) {
  if (status === 'done') return <CheckCircle size={14} />
  if (status === 'error') return <AlertCircle size={14} />
  if (status === 'partial') return <AlertCircle size={14} />
  return <Loader2 size={14} className="animate-spin" />
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
  const [costPrice, setCostPrice] = useState('')
  const [dims, setDims] = useState({ length: '', width: '', height: '' })
  const [useAI, setUseAI] = useState(false)
  const [sourceCity, setSourceCity] = useState('')
  const [factoryName, setFactoryName] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // Auto-calculated: cost (USD) × 1.3 × 1.2 × 3 = × 4.68, displayed in SGD
  const sellingPriceSGD = costPrice ? (parseFloat(costPrice) * 4.68).toFixed(2) : ''

  // Job queue — list of {job_id, filename, status, total, done, errors}
  const [jobs, setJobs] = useState([])

  // Poll active jobs every 2s
  useEffect(() => {
    const active = jobs.filter((j) => j.status === 'queued' || j.status === 'processing')
    if (!active.length) return
    const tid = setTimeout(async () => {
      try {
        const all = await api.getJobs()
        setJobs((prev) => prev.map((j) => all[j.job_id] ? { ...j, ...all[j.job_id] } : j))
      } catch (_) {}
    }, 2000)
    return () => clearTimeout(tid)
  }, [jobs])

  // Existing cities/factories fetched from saved products for datalist suggestions
  const [existingCities, setExistingCities] = useState([])
  const [existingFactories, setExistingFactories] = useState([])
  useEffect(() => {
    api.listProducts().then((products) => {
      setExistingCities([...new Set(products.map((p) => p.source_city).filter(Boolean))])
      setExistingFactories([...new Set(products.map((p) => p.factory_name).filter(Boolean))])
    }).catch(() => {})
  }, [])

  function handleFile(f) {
    if (!f) return
    const m = getFileMode(f)
    if (!m) { setError(`Unsupported file type: .${getExt(f)}`); return }
    setFile(f); setMode(m); setError(null)
    setPreview(IMAGE_EXTS.has(getExt(f)) ? URL.createObjectURL(f) : null)
  }

  function handleFileInput(e) { handleFile(e.target.files?.[0]); e.target.value = '' }
  function handleCamera(e) { const f = e.target.files?.[0]; if (f) { handleFile(f); setMode('single') }; e.target.value = '' }
  function clearFile() { setFile(null); setPreview(null); setMode(null); setError(null) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!file) return
    setSubmitting(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('upload_type', mode)
      fd.append('file', file)
      fd.append('use_ai', useAI ? 'true' : 'false')
      if (text) fd.append('text', text)
      if (costPrice) fd.append('cost_price', costPrice)
      if (sellingPriceSGD) fd.append('selling_price', sellingPriceSGD)
      if (dims.length) fd.append('dim_length', dims.length)
      if (dims.width) fd.append('dim_width', dims.width)
      if (dims.height) fd.append('dim_height', dims.height)
      if (sourceCity) fd.append('source_city', sourceCity)
      if (factoryName) fd.append('factory_name', factoryName)
      const { job_id } = await api.uploadProducts(fd)
      setJobs((prev) => [{ job_id, filename: file.name, status: 'queued', total: 0, done: 0, errors: [] }, ...prev])
      clearFile()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-5">
      <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.webp,.bmp,.gif,.pdf,.pptx,.ppt" className="hidden" onChange={handleFileInput} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCamera} />

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Upload Product</h1>
        <p className="text-gray-500 text-sm mt-1">Fill in the form, hit Upload — processing happens in the background. Upload the next file straight away.</p>
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

      {/* ── File chip + form ──────────────────────────────────── */}
      {file && (
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* File chip */}
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
            <button type="button" onClick={clearFile} className="text-gray-600 hover:text-red-400 transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* AI toggle */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              onClick={() => setUseAI((v) => !v)}
              className={`relative w-10 h-5 rounded-full transition-colors ${useAI ? 'bg-pink-600' : 'bg-white/10'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${useAI ? 'translate-x-5' : 'translate-x-0'}`} />
            </div>
            <span className="text-sm font-medium text-gray-300">AI</span>
            <span className="text-xs text-gray-600">
              {useAI ? 'Gemini will extract product title & info' : 'Skip AI — manual entry only'}
            </span>
          </label>

          {/* Cost + Selling price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Cost Price (USD)</label>
              <input
                type="text" inputMode="decimal"
                placeholder="e.g. 8.90"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                className={INP}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">
                Selling Price (SGD) <span className="text-gray-600">auto</span>
              </label>
              <input
                type="text"
                value={sellingPriceSGD ? `S$ ${sellingPriceSGD}` : ''}
                readOnly
                placeholder="= cost × 4.68"
                className={INP + ' cursor-not-allowed opacity-60'}
              />
              <p className="text-xs text-gray-700 mt-1">USD × 1.3 × 1.2 × 3</p>
            </div>
          </div>

          {/* Dimensions */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Package Dimensions (cm)</label>
            <div className="grid grid-cols-3 gap-2">
              <input type="text" inputMode="decimal" placeholder="Length"
                value={dims.length} onChange={(e) => setDims((d) => ({ ...d, length: e.target.value }))} className={INP} />
              <input type="text" inputMode="decimal" placeholder="Width"
                value={dims.width} onChange={(e) => setDims((d) => ({ ...d, width: e.target.value }))} className={INP} />
              <input type="text" inputMode="decimal" placeholder="Height"
                value={dims.height} onChange={(e) => setDims((d) => ({ ...d, height: e.target.value }))} className={INP} />
            </div>
          </div>

          {/* City + Factory */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Source City</label>
              <input type="text" list="cities-list" placeholder="e.g. Yiwu" value={sourceCity}
                onChange={(e) => setSourceCity(e.target.value)} className={INP} />
              <datalist id="cities-list">{existingCities.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Factory Name</label>
              <input type="text" list="factories-list" placeholder="e.g. Shenzhen Bright Co." value={factoryName}
                onChange={(e) => setFactoryName(e.target.value)} className={INP} />
              <datalist id="factories-list">{existingFactories.map((f) => <option key={f} value={f} />)}</datalist>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Additional Details</label>
            <textarea rows={2} placeholder="Brand, material, size range, special notes…" value={text}
              onChange={(e) => setText(e.target.value)} className={INP + ' resize-none'} />
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-300 text-sm">
              <AlertCircle size={14} className="shrink-0 mt-0.5" /> {error}
            </div>
          )}

          <button type="submit" disabled={submitting}
            className="w-full bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors active:scale-[0.98]">
            {submitting
              ? <><Loader2 size={16} className="animate-spin" /> Queuing…</>
              : <><Upload size={16} /> {useAI ? 'Upload & Process with AI' : 'Upload'}</>
            }
          </button>
        </form>
      )}

      {/* ── Job queue ─────────────────────────────────────────── */}
      {jobs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Processing queue</p>
            <button onClick={() => navigate('/products')}
              className="text-xs text-pink-400 hover:text-pink-300 transition-colors">
              View Products →
            </button>
          </div>
          {jobs.map((j) => (
            <div key={j.job_id} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
              <span className={jobColor(j.status)}>{jobIcon(j.status)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm truncate">{j.filename}</p>
                <p className={`text-xs ${jobColor(j.status)}`}>
                  {j.status === 'queued' && 'Queued…'}
                  {j.status === 'processing' && `Processing… ${j.done}/${j.total || '?'}`}
                  {j.status === 'done' && `Done — ${j.total} saved`}
                  {j.status === 'partial' && `Partial — ${j.done}/${j.total} saved, ${j.errors.length} error(s)`}
                  {j.status === 'error' && `Failed: ${j.errors[0] || 'unknown error'}`}
                </p>
              </div>
              {(j.status === 'done' || j.status === 'error' || j.status === 'partial') && (
                <button onClick={() => setJobs((prev) => prev.filter((x) => x.job_id !== j.job_id))}
                  className="text-gray-700 hover:text-gray-400 transition-colors">
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
