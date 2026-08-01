import { useEffect, useState, useRef, useCallback } from 'react'
import {
  Mic, MicOff, Loader2, CheckCircle, XCircle, ChevronLeft,
  Image as ImageIcon, Pencil, Plus, RefreshCw, Trash2, Send,
} from 'lucide-react'
import { API_HOST } from '../api.js'

const LIVE_BASE = `${API_HOST}/api/live-listing`
const EXTRA_HEADERS = API_HOST.includes('ngrok') ? { 'ngrok-skip-browser-warning': '1' } : {}

const UNITS = ['cm', 'm', 'mm', 'in']

// ── helpers ────────────────────────────────────────────────────────────────

function buildTitle(prefix, seq, dims, unit, name) {
  const id = `${prefix}${seq}`
  const dimStr = dims ? `${dims.length}x${dims.width}x${dims.height}` : ''
  const parts = [id, dimStr ? `${dimStr}-${unit}` : '', name].filter(Boolean)
  return parts.join('-')
}

async function apiGet(path) {
  const res = await fetch(LIVE_BASE + path, { headers: EXTRA_HEADERS })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || res.statusText)
  return data
}

async function apiPost(path, formData) {
  const res = await fetch(LIVE_BASE + path, {
    method: 'POST',
    body: formData,
    headers: EXTRA_HEADERS,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || res.statusText)
  return data
}

async function apiPostJson(path, body) {
  const res = await fetch(LIVE_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...EXTRA_HEADERS },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || res.statusText)
  return data
}

// Parse prefix+number from a variation title like "A1 : (30x30x1.5) Chopping Board" or seller_sku "A3"
function parseId(str) {
  const m = str?.match(/^([A-Za-z]+)(\d+)/)
  return m ? { prefix: m[1].toUpperCase(), seq: parseInt(m[2], 10) } : null
}

// ── sub-components ─────────────────────────────────────────────────────────

function FieldInput({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-400">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-pink-500 transition-colors"
      />
    </div>
  )
}

// ── main page ──────────────────────────────────────────────────────────────

export default function LiveListingPage() {
  const [listings, setListings] = useState([])
  const [loadingListings, setLoadingListings] = useState(true)
  const [selected, setSelected] = useState(null)   // chosen listing card

  useEffect(() => {
    apiGet('/listings').then(setListings).finally(() => setLoadingListings(false))
  }, [])

  if (!selected) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Plus size={18} className="text-pink-400" />
          <h1 className="text-lg font-semibold text-white">Live Listing</h1>
          <span className="text-xs text-gray-500">Select a factory to start listing products</span>
        </div>

        {loadingListings ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <Loader2 className="animate-spin mr-2" size={18} /> Loading factories…
          </div>
        ) : listings.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-16">No listings found. Sync orders first.</p>
        ) : (
          <div className="space-y-2">
            {listings.map(l => (
              <button
                key={l.listing_id}
                onClick={() => setSelected(l)}
                className="w-full text-left flex items-center justify-between bg-[#1a1a1a] border border-white/8 hover:border-pink-500/50 rounded-lg px-4 py-3 transition-colors group"
              >
                <div className="min-w-0">
                  <p className="text-xs font-mono text-cyan-400">{l.listing_id}</p>
                  {l.product_name && <p className="text-sm text-white font-medium mt-0.5 truncate">{l.product_name}</p>}
                  <p className="text-xs text-gray-500 mt-0.5">
                    {l.sku_count} variations
                    {l.status && <span className="ml-2 capitalize">{l.status.toLowerCase()}</span>}
                  </p>
                </div>
                <span className="text-xs text-pink-400 opacity-0 group-hover:opacity-100 transition-opacity ml-4 flex-shrink-0">
                  Select →
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <ListingWorkspace listing={selected} onBack={() => setSelected(null)} />
  )
}

// ── workspace ──────────────────────────────────────────────────────────────

function ListingWorkspace({ listing, onBack }) {
  // Prefix / sequence state
  const [prefix, setPrefix] = useState('A')
  const [nextSeq, setNextSeq] = useState(1)
  const [unit, setUnit] = useState('cm')

  // Existing SKUs from TikTok
  const [existingSkus, setExistingSkus] = useState([])
  const [loadingSkus, setLoadingSkus] = useState(true)
  const [skusError, setSkusError] = useState(null)

  // Batch queue — array of {id, imageFile, imagePreview, productName, dims, price, stock, status, error}
  const [queue, setQueue] = useState([])
  const [submitting, setSubmitting] = useState(false)

  // Current form (staged before adding to queue)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [productName, setProductName] = useState('')
  const [dims, setDims] = useState({ length: '', width: '', height: '' })
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('')
  const [voiceText, setVoiceText] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [formError, setFormError] = useState(null)

  // Voice recording (MediaRecorder → backend transcribe)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const fileRef = useRef(null)
  const cameraRef = useRef(null)

  const currentTitle = buildTitle(prefix, nextSeq, {
    length: dims.length || '?',
    width: dims.width || '?',
    height: dims.height || '?',
  }, unit, productName || 'Product')

  // Load / reload SKUs ──────────────────────────────────────────────────────
  const loadSkus = useCallback((updateSeq = false) => {
    setLoadingSkus(true)
    setSkusError(null)
    apiGet(`/skus/${listing.listing_id}`)
      .then(data => {
        const skus = data.skus || []
        setExistingSkus(skus)
        if (updateSeq) {
          const parsed = skus.map(s => parseId(s.title) || parseId(s.seller_sku)).filter(Boolean)
          if (parsed.length > 0) {
            const maxEntry = parsed.reduce((a, b) => b.seq > a.seq ? b : a)
            setPrefix(maxEntry.prefix || 'A')
            setNextSeq(maxEntry.seq + 1)
          }
        }
      })
      .catch(e => setSkusError(e.message))
      .finally(() => setLoadingSkus(false))
  }, [listing.listing_id])

  useEffect(() => { loadSkus(true) }, [loadSkus])

  // Voice ──────────────────────────────────────────────────────────────────
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioChunksRef.current = []
      const mr = new MediaRecorder(stream)
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(audioChunksRef.current, { type: mr.mimeType || 'audio/webm' })
        await sendAudioToBackend(blob, mr.mimeType)
      }
      mr.start()
      mediaRecorderRef.current = mr
      setRecording(true)
    } catch (e) {
      setFormError('Microphone access denied: ' + e.message)
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    setRecording(false)
    setTranscribing(true)
  }

  async function sendAudioToBackend(blob, mimeType) {
    setFormError(null)
    try {
      const fd = new FormData()
      const ext = mimeType?.includes('ogg') ? 'ogg' : mimeType?.includes('mp4') ? 'mp4' : 'webm'
      fd.append('audio', blob, `recording.${ext}`)
      if (imageFile) fd.append('image', imageFile)
      const data = await apiPost('/transcribe', fd)
      if (data.transcript) setVoiceText(data.transcript)
      if (data.product_name) setProductName(data.product_name)
      if (data.dimensions) setDims({ length: data.dimensions.length || '', width: data.dimensions.width || '', height: data.dimensions.height || '' })
      if (data.price) setPrice(data.price)
      if (data.stock != null) setStock(String(data.stock))
    } catch (e) {
      setFormError('Transcription failed: ' + e.message)
    } finally {
      setTranscribing(false)
    }
  }

  function handleImageChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setFormError(null)
  }

  async function handleExtract() {
    if (!imageFile) { setFormError('Upload an image first.'); return }
    setExtracting(true); setFormError(null)
    try {
      const fd = new FormData()
      fd.append('image', imageFile)
      if (voiceText) fd.append('voice_text', voiceText)
      const data = await apiPost('/extract', fd)
      if (data.product_name) setProductName(data.product_name)
      if (data.dimensions) setDims({ length: data.dimensions.length || '', width: data.dimensions.width || '', height: data.dimensions.height || '' })
      if (data.price) setPrice(data.price)
      if (data.stock != null) setStock(String(data.stock))
    } catch (e) { setFormError(e.message) }
    finally { setExtracting(false) }
  }

  // Add current form to queue ───────────────────────────────────────────────
  function handleAddToQueue() {
    if (!imageFile) { setFormError('Image required.'); return }
    if (!productName) { setFormError('Product name required.'); return }
    if (!price) { setFormError('Price required.'); return }
    if (!stock) { setFormError('Stock required.'); return }

    const item = {
      id: `${prefix}${nextSeq}`,
      title: currentTitle,
      imageFile, imagePreview, productName,
      dims: { ...dims }, unit, price, stock,
      status: 'queued', // queued | uploading | done | error
      error: null,
      result: null,
    }
    setQueue(q => [...q, item])
    // Advance seq and clear form
    setNextSeq(n => n + 1)
    setImageFile(null); setImagePreview(null)
    setProductName(''); setDims({ length: '', width: '', height: '' })
    setPrice(''); setStock(''); setVoiceText('')
    setFormError(null)
    // reset file input
    if (fileRef.current) fileRef.current.value = ''
  }

  function removeFromQueue(idx) {
    setQueue(q => q.filter((_, i) => i !== idx))
  }

  // Submit all queued items to TikTok ──────────────────────────────────────
  async function handleSubmitQueue() {
    if (queue.length === 0) return
    setSubmitting(true)

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i]
      if (item.status === 'done') continue

      // mark uploading
      setQueue(q => q.map((x, idx) => idx === i ? { ...x, status: 'uploading', error: null } : x))

      try {
        const imgFd = new FormData()
        imgFd.append('image', item.imageFile)
        const { uri } = await apiPost('/upload-image', imgFd)

        const res = await apiPostJson('/add-sku', {
          listing_id: listing.listing_id,
          title: item.title,
          image_uri: uri,
          price: item.price,
          stock: parseInt(item.stock, 10),
          seller_sku: item.id,
        })

        if (res.success) {
          setQueue(q => q.map((x, idx) => idx === i ? { ...x, status: 'done', result: res } : x))
        } else {
          setQueue(q => q.map((x, idx) => idx === i ? { ...x, status: 'error', error: res.error } : x))
        }
      } catch (e) {
        setQueue(q => q.map((x, idx) => idx === i ? { ...x, status: 'error', error: e.message } : x))
      }
    }

    setSubmitting(false)
    // Refresh already-listed panel (don't reset seq — user manages it)
    apiGet(`/skus/${listing.listing_id}`).then(data => setExistingSkus(data.skus || [])).catch(() => {})
  }

  const canAddToQueue = !!imageFile && !!productName && !!price && !!stock
  const pendingCount = queue.filter(x => x.status === 'queued' || x.status === 'error').length

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-gray-500 hover:text-white transition-colors">
          <ChevronLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-mono text-cyan-400">{listing.listing_id}</p>
          <p className="text-sm text-white font-medium truncate">{listing.product_name || 'Listing'}</p>
        </div>
      </div>

      {/* Already Listed panel */}
      <div className="bg-[#1a1a1a] border border-white/8 rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Already Listed ({existingSkus.length})</p>
          <button
            onClick={() => loadSkus(false)}
            disabled={loadingSkus}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-white transition-colors disabled:opacity-40"
          >
            <RefreshCw size={12} className={loadingSkus ? 'animate-spin' : ''} />
            Reload
          </button>
        </div>
        {skusError && <p className="text-xs text-red-400">Could not load: {skusError}</p>}
        {!loadingSkus && existingSkus.length === 0 && !skusError && (
          <p className="text-xs text-gray-600">No variations listed yet.</p>
        )}
        {existingSkus.length > 0 && (
          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {existingSkus.map(s => (
              <div key={s.sku_id} className="flex items-center gap-2 bg-[#111] rounded-lg px-3 py-2">
                {s.image_url
                  ? <img src={s.image_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                  : <div className="w-8 h-8 rounded bg-white/5 flex-shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-400 truncate">{s.title}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  {s.price && <p className="text-xs text-white">${s.price}</p>}
                  <p className="text-xs text-gray-500">qty {s.stock}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Identifier settings */}
      <div className="bg-[#1a1a1a] border border-white/8 rounded-xl p-4 space-y-3">
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Identifier Settings</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">Prefix</label>
            <input
              value={prefix}
              onChange={e => setPrefix(e.target.value.toUpperCase())}
              placeholder="A"
              className="bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono outline-none focus:border-pink-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">Next number</label>
            <input
              type="number"
              min={1}
              value={nextSeq}
              onChange={e => setNextSeq(parseInt(e.target.value) || 1)}
              className="bg-[#111] border border-amber-400/30 rounded-lg px-3 py-2 text-sm font-mono text-amber-400 outline-none focus:border-amber-400"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">Dimension unit</label>
            <select
              value={unit}
              onChange={e => setUnit(e.target.value)}
              className="bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-pink-500"
            >
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <div className="bg-[#111] rounded-lg px-3 py-2">
          <p className="text-xs text-gray-500 mb-0.5">Next title preview</p>
          <p className="text-sm font-mono text-amber-400 break-all">{currentTitle}</p>
        </div>
      </div>

      {/* Product input form */}
      <div className="bg-[#1a1a1a] border border-white/8 rounded-xl p-4 space-y-3">
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Product Input — {prefix}{nextSeq}</p>

        <div className="flex gap-3">
          {/* Image — tap opens gallery+camera picker on mobile */}
          <div className="flex flex-col gap-1.5 flex-shrink-0">
            <button
              onClick={() => fileRef.current?.click()}
              className="relative w-28 h-28 rounded-lg border-2 border-dashed border-white/15 hover:border-pink-500/50 flex items-center justify-center overflow-hidden transition-colors"
            >
              {imagePreview
                ? <img src={imagePreview} className="w-full h-full object-cover" alt="" />
                : <div className="flex flex-col items-center gap-1 text-gray-600"><ImageIcon size={22} /><span className="text-xs">Photo</span></div>}
            </button>
            {/* Two hidden inputs: gallery (default) and camera */}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageChange} />
            <button
              onClick={() => cameraRef.current?.click()}
              className="text-xs text-gray-500 hover:text-white text-center transition-colors"
            >
              📷 Camera
            </button>
          </div>

          <div className="flex-1 flex flex-col gap-2">
            {/* Record button */}
            {!transcribing ? (
              <button
                onClick={recording ? stopRecording : startRecording}
                className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg transition-colors w-fit ${
                  recording ? 'bg-red-600 text-white animate-pulse' : 'bg-[#111] border border-white/10 text-gray-300 hover:text-white'
                }`}
              >
                {recording ? <><MicOff size={14} /> Stop & transcribe</> : <><Mic size={14} /> Record voice</>}
              </button>
            ) : (
              <div className="flex items-center gap-2 text-xs text-gray-400 px-3 py-2 bg-[#111] border border-white/10 rounded-lg w-fit">
                <Loader2 size={13} className="animate-spin" /> Transcribing…
              </div>
            )}

            {/* Transcript display / edit */}
            {voiceText && (
              <div className="relative">
                <textarea value={voiceText} onChange={e => setVoiceText(e.target.value)} rows={2}
                  className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-300 outline-none focus:border-pink-500 resize-none" />
                <button onClick={() => setVoiceText('')} className="absolute top-1.5 right-2 text-gray-600 hover:text-gray-400 text-xs">✕</button>
              </div>
            )}

            {/* Manual AI extract (image only, no audio) */}
            <button onClick={handleExtract} disabled={extracting || !imageFile}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-purple-700 hover:bg-purple-600 disabled:opacity-40 text-white rounded-lg transition-colors w-fit">
              {extracting ? <Loader2 size={12} className="animate-spin" /> : <Pencil size={12} />}
              {extracting ? 'Extracting…' : 'AI fill (image only)'}
            </button>
          </div>
        </div>

        <FieldInput label="Product Name" value={productName} onChange={setProductName} placeholder="e.g. Wooden Serving Bowl" />
        <div className="grid grid-cols-3 gap-3">
          <FieldInput label="Length" value={dims.length} onChange={v => setDims(d => ({ ...d, length: v }))} placeholder="10" />
          <FieldInput label="Width" value={dims.width} onChange={v => setDims(d => ({ ...d, width: v }))} placeholder="5" />
          <FieldInput label="Height" value={dims.height} onChange={v => setDims(d => ({ ...d, height: v }))} placeholder="3" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FieldInput label="Price (SGD)" value={price} onChange={setPrice} placeholder="12.90" />
          <FieldInput label="Stock (qty)" value={stock} onChange={setStock} placeholder="50" type="number" />
        </div>

        {formError && (
          <div className="flex items-center gap-2 text-xs text-red-400">
            <XCircle size={13} /> {formError}
          </div>
        )}

        <button
          onClick={handleAddToQueue}
          disabled={!canAddToQueue}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#111] border border-white/10 hover:border-pink-500/50 disabled:opacity-40 text-white rounded-lg transition-colors text-sm"
        >
          <Plus size={15} /> Add {prefix}{nextSeq} to queue
        </button>
      </div>

      {/* Queue */}
      {queue.length > 0 && (
        <div className="bg-[#1a1a1a] border border-white/8 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Queue ({queue.length})</p>
            {!submitting && pendingCount > 0 && (
              <button
                onClick={handleSubmitQueue}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-pink-600 hover:bg-pink-500 text-white rounded-lg transition-colors"
              >
                <Send size={12} /> Submit all {pendingCount}
              </button>
            )}
            {submitting && <span className="text-xs text-gray-500 flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Submitting…</span>}
          </div>

          <div className="space-y-2">
            {queue.map((item, idx) => (
              <div key={idx} className={`flex items-center gap-3 rounded-lg px-3 py-2 border ${
                item.status === 'done' ? 'bg-emerald-500/5 border-emerald-500/20'
                : item.status === 'error' ? 'bg-red-500/5 border-red-500/20'
                : item.status === 'uploading' ? 'bg-blue-500/5 border-blue-500/20'
                : 'bg-[#111] border-white/5'
              }`}>
                {item.imagePreview
                  ? <img src={item.imagePreview} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                  : <div className="w-10 h-10 rounded bg-white/5 flex-shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-mono text-amber-400">{item.id}</p>
                  <p className="text-xs text-gray-400 truncate">{item.productName}</p>
                  {item.error && <p className="text-xs text-red-400 mt-0.5 truncate">{item.error}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-gray-500">${item.price}</span>
                  {item.status === 'done' && <CheckCircle size={14} className="text-emerald-400" />}
                  {item.status === 'uploading' && <Loader2 size={14} className="animate-spin text-blue-400" />}
                  {item.status === 'queued' && !submitting && (
                    <button onClick={() => removeFromQueue(idx)} className="text-gray-600 hover:text-red-400 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  )}
                  {item.status === 'error' && !submitting && (
                    <button onClick={() => removeFromQueue(idx)} className="text-red-500 hover:text-red-300 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
