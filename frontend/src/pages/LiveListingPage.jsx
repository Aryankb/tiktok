import { useEffect, useState, useRef, useCallback } from 'react'
import {
  Mic, MicOff, Loader2, CheckCircle, XCircle, ChevronLeft,
  Image as ImageIcon, Pencil, Plus, RefreshCw, Trash2, Send, BookmarkPlus,
} from 'lucide-react'
import { API_HOST } from '../api.js'

const LIVE_BASE = `${API_HOST}/api/live-listing`
const EXTRA_HEADERS = API_HOST.includes('ngrok') ? { 'ngrok-skip-browser-warning': '1' } : {}

const UNITS = ['cm', 'm', 'mm', 'in']

// Crop to square, resize to maxPx, compress to JPEG quality 0.82
// Returns a File ready to upload (~200-400KB for typical product shots)
function compressToSquare(file, maxPx = 1200, quality = 0.82) {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const side = Math.min(img.width, img.height)
      const sx = (img.width - side) / 2
      const sy = (img.height - side) / 2
      const size = Math.min(side, maxPx)
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size)
      canvas.toBlob(blob => {
        resolve(new File([blob], 'product.jpg', { type: 'image/jpeg' }))
      }, 'image/jpeg', quality)
    }
    img.src = url
  })
}

// ── helpers ────────────────────────────────────────────────────────────────

function buildTitle(prefix, seq, dims, unit, name, includeDims) {
  const id = `${prefix}${seq}`
  const dimStr = includeDims && dims ? `${dims.length}x${dims.width}x${dims.height}` : ''
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

function parseId(str) {
  const m = str?.match(/^([A-Za-z]+)(\d+)/)
  return m ? { prefix: m[1].toUpperCase(), seq: parseInt(m[2], 10) } : null
}

// ── draft localStorage helpers ─────────────────────────────────────────────

function draftsKey(listingId) { return `drafts_${listingId}` }

function loadDrafts(listingId) {
  try { return JSON.parse(localStorage.getItem(draftsKey(listingId)) || '[]') }
  catch { return [] }
}

function saveDrafts(listingId, drafts) {
  localStorage.setItem(draftsKey(listingId), JSON.stringify(drafts))
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
  const [selected, setSelected] = useState(null)

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
            {listings.map(l => {
              const draftCount = loadDrafts(l.listing_id).length
              return (
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
                      {draftCount > 0 && <span className="ml-2 text-amber-400">{draftCount} draft{draftCount > 1 ? 's' : ''}</span>}
                    </p>
                  </div>
                  <span className="text-xs text-pink-400 opacity-0 group-hover:opacity-100 transition-opacity ml-4 flex-shrink-0">
                    Select →
                  </span>
                </button>
              )
            })}
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
  const [prefix, setPrefix] = useState('A')
  const [nextSeq, setNextSeq] = useState(1)
  const [unit, setUnit] = useState('cm')

  const [existingSkus, setExistingSkus] = useState([])
  const [loadingSkus, setLoadingSkus] = useState(true)
  const [skusError, setSkusError] = useState(null)

  // Queue — live items to push now
  const [queue, setQueue] = useState([])
  const [submitting, setSubmitting] = useState(false)

  // Drafts — persisted in localStorage, imageFile is null on reload (only preview stored)
  const [drafts, setDrafts] = useState(() => loadDrafts(listing.listing_id))
  const [selectedDraftIds, setSelectedDraftIds] = useState(new Set())
  const [pushingDrafts, setPushingDrafts] = useState(false)

  // Current form
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [productName, setProductName] = useState('')
  const [dims, setDims] = useState({ length: '', width: '', height: '' })
  const [includeDims, setIncludeDims] = useState(false)
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('')
  const [voiceText, setVoiceText] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [formError, setFormError] = useState(null)

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
  }, unit, productName || 'Product', includeDims)

  // Persist drafts whenever they change
  useEffect(() => {
    saveDrafts(listing.listing_id, drafts)
  }, [drafts, listing.listing_id])

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

  async function handleImageChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFormError(null)
    const compressed = await compressToSquare(file)
    setImageFile(compressed)
    setImagePreview(URL.createObjectURL(compressed))
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

  function buildQueueItem(statusOverride = 'queued') {
    return {
      id: `${prefix}${nextSeq}`,
      title: currentTitle,
      imageFile, imagePreview, productName,
      dims: { ...dims }, unit, includeDims, price, stock,
      status: statusOverride,
      error: null,
      result: null,
    }
  }

  function clearForm() {
    setNextSeq(n => n + 1)
    setImageFile(null); setImagePreview(null)
    setProductName(''); setDims({ length: '', width: '', height: '' })
    setIncludeDims(false)
    setPrice(''); setStock(''); setVoiceText('')
    setFormError(null)
    if (fileRef.current) fileRef.current.value = ''
    if (cameraRef.current) cameraRef.current.value = ''
  }

  function handleAddToQueue() {
    if (!imageFile) { setFormError('Image required.'); return }
    if (!productName) { setFormError('Product name required.'); return }
    if (!price) { setFormError('Price required.'); return }
    if (!stock) { setFormError('Stock required.'); return }
    setQueue(q => [...q, buildQueueItem('queued')])
    clearForm()
  }

  // Save draft — store imagePreview as data URL so it survives page reload
  async function handleSaveDraft() {
    if (!imageFile) { setFormError('Image required.'); return }
    if (!productName) { setFormError('Product name required.'); return }
    if (!price) { setFormError('Price required.'); return }
    if (!stock) { setFormError('Stock required.'); return }

    // Convert imageFile to base64 data URL for persistence
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = e => resolve(e.target.result)
      reader.readAsDataURL(imageFile)
    })

    const draft = {
      draftId: `${listing.listing_id}_${Date.now()}`,
      id: `${prefix}${nextSeq}`,
      title: currentTitle,
      imageDataUrl: dataUrl,  // persisted
      productName,
      dims: { ...dims }, unit, price, stock,
      savedAt: new Date().toISOString(),
    }
    setDrafts(d => [...d, draft])
    clearForm()
  }

  function removeDraft(draftId) {
    setDrafts(d => d.filter(x => x.draftId !== draftId))
    setSelectedDraftIds(s => { const n = new Set(s); n.delete(draftId); return n })
  }

  function toggleDraftSelect(draftId) {
    setSelectedDraftIds(s => {
      const n = new Set(s)
      n.has(draftId) ? n.delete(draftId) : n.add(draftId)
      return n
    })
  }

  function toggleSelectAll() {
    const pushable = drafts.filter(d => d.status !== 'done')
    if (selectedDraftIds.size === pushable.length) {
      setSelectedDraftIds(new Set())
    } else {
      setSelectedDraftIds(new Set(pushable.map(d => d.draftId)))
    }
  }

  // Push selected drafts to TikTok
  async function handlePushDrafts() {
    const toPush = drafts.filter(d => selectedDraftIds.has(d.draftId) && d.status !== 'done')
    if (toPush.length === 0) return
    setPushingDrafts(true)

    for (const draft of toPush) {
      // Mark as uploading
      setDrafts(d => d.map(x => x.draftId === draft.draftId ? { ...x, status: 'uploading', error: null } : x))

      try {
        // Convert data URL back to File for upload
        const res = await fetch(draft.imageDataUrl)
        const blob = await res.blob()
        const file = new File([blob], 'product.jpg', { type: blob.type || 'image/jpeg' })

        const imgFd = new FormData()
        imgFd.append('image', file)
        const { uri } = await apiPost('/upload-image', imgFd)

        const result = await apiPostJson('/add-sku', {
          listing_id: listing.listing_id,
          title: draft.title,
          image_uri: uri,
          price: draft.price,
          stock: parseInt(draft.stock, 10),
          seller_sku: draft.id,
        })

        if (result.success) {
          setDrafts(d => d.map(x => x.draftId === draft.draftId ? { ...x, status: 'done' } : x))
          // Remove from selection
          setSelectedDraftIds(s => { const n = new Set(s); n.delete(draft.draftId); return n })
        } else {
          setDrafts(d => d.map(x => x.draftId === draft.draftId ? { ...x, status: 'error', error: result.error } : x))
        }
      } catch (e) {
        setDrafts(d => d.map(x => x.draftId === draft.draftId ? { ...x, status: 'error', error: e.message } : x))
      }
    }

    setPushingDrafts(false)
    apiGet(`/skus/${listing.listing_id}`).then(data => setExistingSkus(data.skus || [])).catch(() => {})
  }

  function removeFromQueue(idx) {
    setQueue(q => q.filter((_, i) => i !== idx))
  }

  async function handleSubmitQueue() {
    if (queue.length === 0) return
    setSubmitting(true)

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i]
      if (item.status === 'done') continue

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
    apiGet(`/skus/${listing.listing_id}`).then(data => setExistingSkus(data.skus || [])).catch(() => {})
  }

  const canAddToQueue = !!imageFile && !!productName && !!price && !!stock
  const pendingCount = queue.filter(x => x.status === 'queued' || x.status === 'error').length
  const pushableDraftCount = drafts.filter(d => selectedDraftIds.has(d.draftId) && d.status !== 'done').length

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
          <div className="flex flex-col gap-1.5 flex-shrink-0">
            <button
              onClick={() => fileRef.current?.click()}
              className="relative w-28 h-28 rounded-lg border-2 border-dashed border-white/15 hover:border-pink-500/50 flex items-center justify-center overflow-hidden transition-colors"
            >
              {imagePreview
                ? <img src={imagePreview} className="w-full h-full object-cover" alt="" />
                : <div className="flex flex-col items-center gap-1 text-gray-600"><ImageIcon size={22} /><span className="text-xs">Photo</span></div>}
            </button>
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

            {voiceText && (
              <div className="relative">
                <textarea value={voiceText} onChange={e => setVoiceText(e.target.value)} rows={2}
                  className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-300 outline-none focus:border-pink-500 resize-none" />
                <button onClick={() => setVoiceText('')} className="absolute top-1.5 right-2 text-gray-600 hover:text-gray-400 text-xs">✕</button>
              </div>
            )}

            <button onClick={handleExtract} disabled={extracting || !imageFile}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-purple-700 hover:bg-purple-600 disabled:opacity-40 text-white rounded-lg transition-colors w-fit">
              {extracting ? <Loader2 size={12} className="animate-spin" /> : <Pencil size={12} />}
              {extracting ? 'Extracting…' : 'AI fill (image only)'}
            </button>
          </div>
        </div>

        <FieldInput label="Product Name" value={productName} onChange={setProductName} placeholder="e.g. Wooden Serving Bowl" />

        {/* Dimension toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
          <div
            onClick={() => setIncludeDims(v => !v)}
            className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
              includeDims ? 'bg-pink-500 border-pink-500' : 'border-white/20 bg-transparent'
            }`}
          >
            {includeDims && <span className="text-white text-xs font-bold leading-none">✓</span>}
          </div>
          <span className="text-xs text-gray-400">Include dimensions in title</span>
        </label>

        {includeDims && (
          <div className="grid grid-cols-3 gap-3">
            <FieldInput label="Length" value={dims.length} onChange={v => setDims(d => ({ ...d, length: v }))} placeholder="10" />
            <FieldInput label="Width" value={dims.width} onChange={v => setDims(d => ({ ...d, width: v }))} placeholder="5" />
            <FieldInput label="Height" value={dims.height} onChange={v => setDims(d => ({ ...d, height: v }))} placeholder="3" />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <FieldInput label="Price (SGD)" value={price} onChange={setPrice} placeholder="12.90" />
          <FieldInput label="Stock (qty)" value={stock} onChange={setStock} placeholder="50" type="number" />
        </div>

        {formError && (
          <div className="flex items-center gap-2 text-xs text-red-400">
            <XCircle size={13} /> {formError}
          </div>
        )}

        {/* Two action buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleSaveDraft}
            disabled={!canAddToQueue}
            className="flex items-center justify-center gap-2 py-2.5 bg-[#111] border border-amber-400/30 hover:border-amber-400/60 disabled:opacity-40 text-amber-400 rounded-lg transition-colors text-sm"
          >
            <BookmarkPlus size={15} /> Save draft
          </button>
          <button
            onClick={handleAddToQueue}
            disabled={!canAddToQueue}
            className="flex items-center justify-center gap-2 py-2.5 bg-[#111] border border-white/10 hover:border-pink-500/50 disabled:opacity-40 text-white rounded-lg transition-colors text-sm"
          >
            <Plus size={15} /> Add to queue
          </button>
        </div>
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
                  {(item.status === 'queued' || item.status === 'error') && !submitting && (
                    <button onClick={() => removeFromQueue(idx)} className="text-gray-600 hover:text-red-400 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Drafts panel */}
      {drafts.length > 0 && (
        <div className="bg-[#1a1a1a] border border-amber-400/20 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-xs text-amber-400 font-medium uppercase tracking-wide">Drafts ({drafts.length})</p>
              {drafts.some(d => d.status !== 'done') && (
                <button
                  onClick={toggleSelectAll}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {selectedDraftIds.size === drafts.filter(d => d.status !== 'done').length ? 'Deselect all' : 'Select all'}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!pushingDrafts && pushableDraftCount > 0 && (
                <button
                  onClick={handlePushDrafts}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-medium rounded-lg transition-colors"
                >
                  <Send size={12} /> Push {pushableDraftCount}
                </button>
              )}
              {pushingDrafts && (
                <span className="text-xs text-amber-400 flex items-center gap-1">
                  <Loader2 size={11} className="animate-spin" /> Pushing…
                </span>
              )}
            </div>
          </div>

          <div className="space-y-2">
            {drafts.map(draft => (
              <div
                key={draft.draftId}
                onClick={() => draft.status !== 'done' && toggleDraftSelect(draft.draftId)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 border cursor-pointer transition-colors ${
                  draft.status === 'done' ? 'bg-emerald-500/5 border-emerald-500/20 cursor-default'
                  : draft.status === 'error' ? 'bg-red-500/5 border-red-500/20'
                  : draft.status === 'uploading' ? 'bg-blue-500/5 border-blue-500/20 cursor-default'
                  : selectedDraftIds.has(draft.draftId)
                    ? 'bg-amber-500/10 border-amber-400/40'
                    : 'bg-[#111] border-white/5 hover:border-amber-400/20'
                }`}
              >
                {/* Checkbox */}
                {draft.status !== 'done' && draft.status !== 'uploading' && (
                  <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                    selectedDraftIds.has(draft.draftId) ? 'bg-amber-400 border-amber-400' : 'border-white/20'
                  }`}>
                    {selectedDraftIds.has(draft.draftId) && <span className="text-black text-xs font-bold">✓</span>}
                  </div>
                )}
                {draft.imageDataUrl
                  ? <img src={draft.imageDataUrl} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                  : <div className="w-10 h-10 rounded bg-white/5 flex-shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-mono text-amber-400">{draft.id}</p>
                  <p className="text-xs text-gray-400 truncate">{draft.productName}</p>
                  {draft.error && <p className="text-xs text-red-400 mt-0.5 truncate">{draft.error}</p>}
                  {!draft.status && <p className="text-xs text-gray-600">{new Date(draft.savedAt).toLocaleTimeString()}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-gray-500">${draft.price}</span>
                  {draft.status === 'done' && <CheckCircle size={14} className="text-emerald-400" />}
                  {draft.status === 'uploading' && <Loader2 size={14} className="animate-spin text-blue-400" />}
                  {draft.status !== 'uploading' && (
                    <button
                      onClick={e => { e.stopPropagation(); removeDraft(draft.draftId) }}
                      className="text-gray-600 hover:text-red-400 transition-colors"
                    >
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
