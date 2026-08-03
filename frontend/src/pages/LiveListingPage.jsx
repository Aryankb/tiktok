import { useEffect, useState, useRef, useCallback } from 'react'
import {
  Mic, MicOff, Loader2, CheckCircle, XCircle, ChevronLeft,
  Image as ImageIcon, Pencil, Plus, RefreshCw, Trash2, Send, BookmarkPlus, Images,
} from 'lucide-react'
import { API_HOST } from '../api.js'

const LIVE_BASE = `${API_HOST}/api/live-listing`
const EXTRA_HEADERS = API_HOST.includes('ngrok') ? { 'ngrok-skip-browser-warning': '1' } : {}

const UNITS = ['cm', 'm', 'mm', 'in']

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
  try {
    const raw = JSON.parse(localStorage.getItem(draftsKey(listingId)) || '[]')
    if (!Array.isArray(raw)) return []
    return raw
      .filter(d => d && typeof d === 'object' && d.draftId && d.id)
      // Reset any draft stuck in uploading state from a previous crashed session
      .map(d => d.status === 'uploading' ? { ...d, status: undefined, statusLabel: null } : d)
  } catch { return [] }
}
function saveDrafts(listingId, drafts) {
  // Strip large base64 images before saving — keep only drafts that still have their image
  // If localStorage quota is exceeded, save without images (flagged as imageDataUrl: null)
  try {
    localStorage.setItem(draftsKey(listingId), JSON.stringify(drafts))
  } catch (e) {
    // Quota exceeded — try saving without base64 images as fallback
    try {
      const slim = drafts.map(d => ({ ...d, imageDataUrl: d.imageDataUrl ? '__stored__' : null }))
      localStorage.setItem(draftsKey(listingId), JSON.stringify(slim))
    } catch {
      // If even that fails, skip persistence silently — drafts live in memory only this session
    }
  }
}

// Compute next seq from listed SKUs + drafts
function computeNextSeq(skus, drafts) {
  const fromSkus = skus.map(s => parseId(s.title) || parseId(s.seller_sku)).filter(Boolean)
  const fromDrafts = drafts.filter(d => d.status !== 'done').map(d => parseId(d.id)).filter(Boolean)
  const all = [...fromSkus, ...fromDrafts]
  if (all.length === 0) return { prefix: 'A', seq: 1 }
  const max = all.reduce((a, b) => b.seq > a.seq ? b : a)
  return { prefix: max.prefix, seq: max.seq + 1 }
}

// Crop + compress to 1:1 JPEG
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
      canvas.width = size; canvas.height = size
      canvas.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, size, size)
      canvas.toBlob(blob => resolve(new File([blob], 'product.jpg', { type: 'image/jpeg' })), 'image/jpeg', quality)
    }
    img.src = url
  })
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
          <p className="text-sm text-gray-500 text-center py-16">No listings found.</p>
        ) : (
          <div className="space-y-2">
            {listings.map(l => {
              const draftCount = loadDrafts(l.listing_id).filter(d => d.status !== 'done').length
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
                      {l.sku_count} listed
                      {l.status && <span className="ml-2 capitalize">{l.status.toLowerCase()}</span>}
                      {draftCount > 0 && <span className="ml-2 text-amber-400">{draftCount} draft{draftCount > 1 ? 's' : ''}</span>}
                    </p>
                  </div>
                  <span className="text-xs text-pink-400 opacity-0 group-hover:opacity-100 transition-opacity ml-4 flex-shrink-0">Select →</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return <ListingWorkspace listing={selected} onBack={() => setSelected(null)} />
}

// ── workspace ──────────────────────────────────────────────────────────────

function ListingWorkspace({ listing, onBack }) {
  const [prefix, setPrefix] = useState('A')
  const [nextSeq, setNextSeq] = useState(1)
  const [unit, setUnit] = useState('cm')

  const [existingSkus, setExistingSkus] = useState([])
  const [loadingSkus, setLoadingSkus] = useState(true)
  const [skusError, setSkusError] = useState(null)

  // Drafts — only storage, no separate queue
  const [drafts, setDrafts] = useState(() => loadDrafts(listing.listing_id))
  const [selectedDraftIds, setSelectedDraftIds] = useState(new Set())
  const [pushingDrafts, setPushingDrafts] = useState(false)

  // editingDraftId — when set, form is editing that draft instead of creating new
  const [editingDraftId, setEditingDraftId] = useState(null)

  // Form state
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

  // Bulk add state
  const [bulkImages, setBulkImages] = useState([]) // [{file, preview}]
  const [bulkName, setBulkName] = useState('')
  const [bulkDims, setBulkDims] = useState({ length: '', width: '', height: '' })
  const [bulkIncludeDims, setBulkIncludeDims] = useState(false)
  const [bulkPrice, setBulkPrice] = useState('')
  const [bulkStock, setBulkStock] = useState('')
  const [bulkError, setBulkError] = useState(null)
  const bulkFileRef = useRef(null)
  const bulkCameraRef = useRef(null)

  const currentTitle = buildTitle(prefix, nextSeq, {
    length: dims.length || '?',
    width: dims.width || '?',
    height: dims.height || '?',
  }, unit, productName || 'Product', includeDims)

  // Persist drafts
  useEffect(() => { saveDrafts(listing.listing_id, drafts) }, [drafts, listing.listing_id])

  // Recompute next seq whenever skus or drafts change
  const recomputeSeq = useCallback((skus, currentDrafts) => {
    const { prefix: p, seq } = computeNextSeq(skus, currentDrafts)
    setPrefix(p)
    setNextSeq(seq)
  }, [])

  const loadSkus = useCallback((updateSeq = false, currentDrafts) => {
    setLoadingSkus(true)
    setSkusError(null)
    apiGet(`/skus/${listing.listing_id}`)
      .then(data => {
        const skus = data.skus || []
        setExistingSkus(skus)
        if (updateSeq) recomputeSeq(skus, currentDrafts || [])
      })
      .catch(e => setSkusError(e.message))
      .finally(() => setLoadingSkus(false))
  }, [listing.listing_id, recomputeSeq])

  useEffect(() => {
    const initialDrafts = loadDrafts(listing.listing_id)
    loadSkus(true, initialDrafts)
  }, [loadSkus, listing.listing_id])

  // When drafts change (add/remove/edit), recompute seq using latest skus
  useEffect(() => {
    if (existingSkus.length >= 0 && !loadingSkus) {
      recomputeSeq(existingSkus, drafts)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts])

  // Voice
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
    } catch (e) { setFormError('Microphone access denied: ' + e.message) }
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
    } catch (e) { setFormError('Transcription failed: ' + e.message) }
    finally { setTranscribing(false) }
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

  function clearForm() {
    setEditingDraftId(null)
    setImageFile(null); setImagePreview(null)
    setProductName(''); setDims({ length: '', width: '', height: '' })
    setIncludeDims(false)
    setPrice(''); setStock(''); setVoiceText('')
    setFormError(null)
    if (fileRef.current) fileRef.current.value = ''
    if (cameraRef.current) cameraRef.current.value = ''
  }

  // Load a draft into the form for editing
  function handleEditDraft(draft) {
    setEditingDraftId(draft.draftId)
    setPrefix(parseId(draft.id)?.prefix || 'A')
    setNextSeq(parseId(draft.id)?.seq || 1)
    setProductName(draft.productName)
    setDims(draft.dims || { length: '', width: '', height: '' })
    setIncludeDims(draft.includeDims || false)
    setUnit(draft.unit || 'cm')
    setPrice(draft.price)
    setStock(draft.stock)
    setVoiceText('')
    setImageFile(null)
    setImagePreview(draft.imageDataUrl || null)
    setFormError(null)
    // scroll to top of form
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSaveDraft() {
    if (!imagePreview) { setFormError('Image required.'); return }
    if (!productName) { setFormError('Product name required.'); return }
    if (!price) { setFormError('Price required.'); return }
    if (!stock) { setFormError('Stock required.'); return }

    // Get data URL — use existing imageFile if present, else existing preview (editing case)
    let dataUrl = imagePreview
    if (imageFile) {
      dataUrl = await new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = e => resolve(e.target.result)
        reader.readAsDataURL(imageFile)
      })
    }

    const title = buildTitle(prefix, nextSeq, dims, unit, productName, includeDims)

    if (editingDraftId) {
      // Update existing draft in place
      setDrafts(d => d.map(x => x.draftId === editingDraftId ? {
        ...x,
        id: `${prefix}${nextSeq}`,
        title,
        imageDataUrl: dataUrl,
        productName,
        dims: { ...dims }, unit, includeDims, price, stock,
        status: undefined, error: undefined,
        savedAt: new Date().toISOString(),
      } : x))
    } else {
      const draft = {
        draftId: `${listing.listing_id}_${Date.now()}`,
        id: `${prefix}${nextSeq}`,
        title,
        imageDataUrl: dataUrl,
        productName,
        dims: { ...dims }, unit, includeDims, price, stock,
        savedAt: new Date().toISOString(),
      }
      setDrafts(d => [...d, draft])
    }
    clearForm()
  }

  function removeDraft(draftId) {
    setDrafts(d => d.filter(x => x.draftId !== draftId))
    setSelectedDraftIds(s => { const n = new Set(s); n.delete(draftId); return n })
    if (editingDraftId === draftId) clearForm()
  }

  function toggleDraftSelect(draftId) {
    setSelectedDraftIds(s => {
      const n = new Set(s)
      n.has(draftId) ? n.delete(draftId) : n.add(draftId)
      return n
    })
  }

  function toggleSelectAll() {
    const pushable = drafts.filter(d => d.status !== 'done' && d.status !== 'uploading')
    if (selectedDraftIds.size === pushable.length) {
      setSelectedDraftIds(new Set())
    } else {
      setSelectedDraftIds(new Set(pushable.map(d => d.draftId)))
    }
  }

  async function handlePushDrafts() {
    const toPush = drafts.filter(d => selectedDraftIds.has(d.draftId) && d.status !== 'done')
    if (toPush.length === 0) return
    setPushingDrafts(true)

    // Mark all selected as uploading
    setDrafts(d => d.map(x => toPush.some(t => t.draftId === x.draftId)
      ? { ...x, status: 'uploading', error: null, statusLabel: 'Uploading image…' }
      : x))

    // Step 1: upload all images in parallel
    const uploadResults = await Promise.all(toPush.map(async (draft) => {
      try {
        if (!draft.imageDataUrl || draft.imageDataUrl === '__stored__')
          throw new Error('Image was not saved (localStorage was full). Re-add this draft with a new photo.')
        const res = await fetch(draft.imageDataUrl)
        const blob = await res.blob()
        const file = new File([blob], 'product.jpg', { type: blob.type || 'image/jpeg' })
        const imgFd = new FormData()
        imgFd.append('image', file)
        const { uri } = await apiPost('/upload-image', imgFd)
        return { draft, uri, error: null }
      } catch (e) {
        return { draft, uri: null, error: e.message }
      }
    }))

    // Mark image-upload failures immediately
    const failed = uploadResults.filter(r => r.error)
    const succeeded = uploadResults.filter(r => r.uri)
    if (failed.length > 0) {
      setDrafts(d => d.map(x => {
        const f = failed.find(r => r.draft.draftId === x.draftId)
        return f ? { ...x, status: 'error', statusLabel: null, error: `Image upload failed: ${f.error}` } : x
      }))
    }

    if (succeeded.length === 0) {
      setPushingDrafts(false)
      return
    }

    // Step 2: single PUT with all successfully uploaded SKUs
    setDrafts(d => d.map(x => succeeded.some(r => r.draft.draftId === x.draftId)
      ? { ...x, statusLabel: 'Adding to TikTok…' }
      : x))

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3 * 60 * 1000)
    try {
      const r = await fetch(LIVE_BASE + '/add-sku', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...EXTRA_HEADERS },
        body: JSON.stringify({
          listing_id: listing.listing_id,
          skus: succeeded.map(({ draft, uri }) => ({
            title: draft.title,
            image_uri: uri,
            price: draft.price,
            stock: parseInt(draft.stock, 10),
            seller_sku: draft.id,
          })),
        }),
        signal: controller.signal,
      })
      clearTimeout(timer)
      const result = await r.json()
      if (!r.ok) throw new Error(result.detail || r.statusText)

      if (result.success) {
        // All succeeded in the batch — mark all done
        setDrafts(d => d.map(x => succeeded.some(r => r.draft.draftId === x.draftId)
          ? { ...x, status: 'done', statusLabel: null }
          : x))
        setSelectedDraftIds(s => {
          const n = new Set(s)
          succeeded.forEach(r => n.delete(r.draft.draftId))
          return n
        })
      } else {
        // TikTok rejected the whole batch
        setDrafts(d => d.map(x => succeeded.some(r => r.draft.draftId === x.draftId)
          ? { ...x, status: 'error', statusLabel: null, error: result.error }
          : x))
      }
    } catch (e) {
      clearTimeout(timer)
      const msg = e.name === 'AbortError'
        ? 'Timed out — SKUs may still have been added. Reload listed SKUs to check.'
        : e.message
      setDrafts(d => d.map(x => succeeded.some(r => r.draft.draftId === x.draftId)
        ? { ...x, status: 'error', statusLabel: null, error: msg }
        : x))
    }

    setPushingDrafts(false)
    apiGet(`/skus/${listing.listing_id}`).then(data => setExistingSkus(data.skus || [])).catch(() => {})
  }

  async function handleBulkImagesChange(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setBulkError(null)
    const compressed = await Promise.all(files.map(f => compressToSquare(f)))
    const entries = compressed.map(f => ({ file: f, preview: URL.createObjectURL(f) }))
    setBulkImages(prev => [...prev, ...entries])
    e.target.value = ''
  }

  function removeBulkImage(idx) {
    setBulkImages(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleBulkSave() {
    if (bulkImages.length === 0) { setBulkError('Add at least one image.'); return }
    if (!bulkName) { setBulkError('Product name required.'); return }
    if (!bulkPrice) { setBulkError('Price required.'); return }
    if (!bulkStock) { setBulkError('Stock required.'); return }

    // Compute starting seq from current state — drafts haven't changed yet
    const { prefix: p, seq: startSeq } = computeNextSeq(existingSkus, drafts)

    const newDrafts = await Promise.all(bulkImages.map(async ({ file, preview }, i) => {
      const seq = startSeq + i
      const title = buildTitle(p, seq, bulkDims, unit, bulkName, bulkIncludeDims)
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = e => resolve(e.target.result)
        reader.readAsDataURL(file)
      })
      return {
        draftId: `${listing.listing_id}_${Date.now()}_${i}`,
        id: `${p}${seq}`,
        title,
        imageDataUrl: dataUrl,
        productName: bulkName,
        dims: { ...bulkDims },
        unit,
        includeDims: bulkIncludeDims,
        price: bulkPrice,
        stock: bulkStock,
        savedAt: new Date().toISOString(),
      }
    }))

    setDrafts(d => [...d, ...newDrafts])
    // Clear bulk form
    setBulkImages([])
    setBulkName('')
    setBulkDims({ length: '', width: '', height: '' })
    setBulkIncludeDims(false)
    setBulkPrice('')
    setBulkStock('')
    setBulkError(null)
  }

  const canSave = !!imagePreview && !!productName && !!price && !!stock
  const pushableDraftCount = drafts.filter(d => selectedDraftIds.has(d.draftId) && d.status !== 'done').length
  const isEditing = !!editingDraftId

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

      {/* Already Listed */}
      <div className="bg-[#1a1a1a] border border-white/8 rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Already Listed ({existingSkus.length})</p>
          <button onClick={() => loadSkus(false)} disabled={loadingSkus}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-white transition-colors disabled:opacity-40">
            <RefreshCw size={12} className={loadingSkus ? 'animate-spin' : ''} /> Reload
          </button>
        </div>
        {skusError && <p className="text-xs text-red-400">Could not load: {skusError}</p>}
        {!loadingSkus && existingSkus.length === 0 && !skusError && <p className="text-xs text-gray-600">No variations listed yet.</p>}
        {existingSkus.length > 0 && (
          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {existingSkus.map(s => (
              <div key={s.sku_id} className="flex items-center gap-2 bg-[#111] rounded-lg px-3 py-2">
                {s.image_url ? <img src={s.image_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                  : <div className="w-8 h-8 rounded bg-white/5 flex-shrink-0" />}
                <div className="min-w-0 flex-1"><p className="text-xs text-gray-400 truncate">{s.title}</p></div>
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
            <input value={prefix} onChange={e => setPrefix(e.target.value.toUpperCase())} placeholder="A"
              className="bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono outline-none focus:border-pink-500" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">Next number</label>
            <input type="number" min={1} value={nextSeq} onChange={e => setNextSeq(parseInt(e.target.value) || 1)}
              className="bg-[#111] border border-amber-400/30 rounded-lg px-3 py-2 text-sm font-mono text-amber-400 outline-none focus:border-amber-400" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">Dimension unit</label>
            <select value={unit} onChange={e => setUnit(e.target.value)}
              className="bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-pink-500">
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <div className="bg-[#111] rounded-lg px-3 py-2">
          <p className="text-xs text-gray-500 mb-0.5">Title preview</p>
          <p className="text-sm font-mono text-amber-400 break-all">{currentTitle}</p>
        </div>
      </div>

      {/* Product form */}
      <div className={`bg-[#1a1a1a] border rounded-xl p-4 space-y-3 ${isEditing ? 'border-amber-400/40' : 'border-white/8'}`}>
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
            {isEditing ? `Editing ${drafts.find(d => d.draftId === editingDraftId)?.id || ''}` : `New — ${prefix}${nextSeq}`}
          </p>
          {isEditing && (
            <button onClick={clearForm} className="text-xs text-gray-500 hover:text-white transition-colors">
              Cancel edit
            </button>
          )}
        </div>

        <div className="flex gap-3">
          <div className="flex flex-col gap-1.5 flex-shrink-0">
            <button onClick={() => fileRef.current?.click()}
              className="relative w-28 h-28 rounded-lg border-2 border-dashed border-white/15 hover:border-pink-500/50 flex items-center justify-center overflow-hidden transition-colors">
              {imagePreview
                ? <img src={imagePreview} className="w-full h-full object-cover" alt="" />
                : <div className="flex flex-col items-center gap-1 text-gray-600"><ImageIcon size={22} /><span className="text-xs">Photo</span></div>}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageChange} />
            <button onClick={() => cameraRef.current?.click()} className="text-xs text-gray-500 hover:text-white text-center transition-colors">
              📷 Camera
            </button>
          </div>

          <div className="flex-1 flex flex-col gap-2">
            {!transcribing ? (
              <button onClick={recording ? stopRecording : startRecording}
                className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg transition-colors w-fit ${
                  recording ? 'bg-red-600 text-white animate-pulse' : 'bg-[#111] border border-white/10 text-gray-300 hover:text-white'
                }`}>
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

        <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
          <div onClick={() => setIncludeDims(v => !v)}
            className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
              includeDims ? 'bg-pink-500 border-pink-500' : 'border-white/20 bg-transparent'
            }`}>
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

        <button onClick={handleSaveDraft} disabled={!canSave}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#111] border border-amber-400/30 hover:border-amber-400/60 disabled:opacity-40 text-amber-400 rounded-lg transition-colors text-sm">
          <BookmarkPlus size={15} /> {isEditing ? 'Update draft' : 'Save to drafts'}
        </button>
      </div>

      {/* Bulk Add panel */}
      <div className="bg-[#1a1a1a] border border-white/8 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Images size={14} className="text-pink-400" />
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Bulk Add — same details, multiple photos</p>
        </div>

        {/* Photo grid + add buttons */}
        <div className="flex flex-wrap gap-2">
          {bulkImages.map((img, idx) => {
            const { prefix: bp, seq: bs } = computeNextSeq(existingSkus, drafts)
            return (
              <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 group">
                <img src={img.preview} className="w-full h-full object-cover" alt="" />
                <button
                  onClick={() => removeBulkImage(idx)}
                  className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity text-white">
                  <Trash2 size={14} />
                </button>
                <span className="absolute bottom-0.5 right-1 text-white text-xs font-mono opacity-80 drop-shadow">
                  {bp}{bs + idx}
                </span>
              </div>
            )
          })}
          <div className="flex flex-col gap-1.5">
            <button onClick={() => bulkFileRef.current?.click()}
              className="w-20 h-9 rounded-lg border-2 border-dashed border-white/15 hover:border-pink-500/50 flex items-center justify-center gap-1 text-gray-600 hover:text-gray-400 transition-colors text-xs">
              <ImageIcon size={13} /> Gallery
            </button>
            <button onClick={() => bulkCameraRef.current?.click()}
              className="w-20 h-9 rounded-lg border-2 border-dashed border-white/15 hover:border-pink-500/50 flex items-center justify-center gap-1 text-gray-600 hover:text-gray-400 transition-colors text-xs">
              📷 Camera
            </button>
          </div>
        </div>
        <input ref={bulkFileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleBulkImagesChange} />
        <input ref={bulkCameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleBulkImagesChange} />

        {/* Shared fields */}
        <FieldInput label="Product Name" value={bulkName} onChange={setBulkName} placeholder="e.g. Patterned Rug" />

        <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
          <div onClick={() => setBulkIncludeDims(v => !v)}
            className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
              bulkIncludeDims ? 'bg-pink-500 border-pink-500' : 'border-white/20 bg-transparent'
            }`}>
            {bulkIncludeDims && <span className="text-white text-xs font-bold leading-none">✓</span>}
          </div>
          <span className="text-xs text-gray-400">Include dimensions in title</span>
        </label>

        {bulkIncludeDims && (
          <div className="grid grid-cols-3 gap-3">
            <FieldInput label="Length" value={bulkDims.length} onChange={v => setBulkDims(d => ({ ...d, length: v }))} placeholder="10" />
            <FieldInput label="Width" value={bulkDims.width} onChange={v => setBulkDims(d => ({ ...d, width: v }))} placeholder="5" />
            <FieldInput label="Height" value={bulkDims.height} onChange={v => setBulkDims(d => ({ ...d, height: v }))} placeholder="3" />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <FieldInput label="Price (SGD)" value={bulkPrice} onChange={setBulkPrice} placeholder="12.90" />
          <FieldInput label="Stock (qty)" value={bulkStock} onChange={setBulkStock} placeholder="50" type="number" />
        </div>

        {bulkError && (
          <div className="flex items-center gap-2 text-xs text-red-400">
            <XCircle size={13} /> {bulkError}
          </div>
        )}

        <button
          onClick={handleBulkSave}
          disabled={bulkImages.length === 0 || !bulkName || !bulkPrice || !bulkStock}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#111] border border-pink-400/30 hover:border-pink-400/60 disabled:opacity-40 text-pink-400 rounded-lg transition-colors text-sm">
          <BookmarkPlus size={15} /> Save {bulkImages.length > 0 ? bulkImages.length : ''} to drafts
        </button>
      </div>

      {/* Drafts panel */}
      {drafts.length > 0 && (
        <div className="bg-[#1a1a1a] border border-amber-400/20 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-xs text-amber-400 font-medium uppercase tracking-wide">Drafts ({drafts.filter(d => d.status !== 'done').length})</p>
              {drafts.some(d => d.status !== 'done' && d.status !== 'uploading') && (
                <button onClick={toggleSelectAll} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
                  {selectedDraftIds.size === drafts.filter(d => d.status !== 'done' && d.status !== 'uploading').length ? 'Deselect all' : 'Select all'}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!pushingDrafts && pushableDraftCount > 0 && (
                <button onClick={handlePushDrafts}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-medium rounded-lg transition-colors">
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
              <div key={draft.draftId}
                onClick={() => draft.status !== 'done' && draft.status !== 'uploading' && toggleDraftSelect(draft.draftId)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 border cursor-pointer transition-colors ${
                  draft.status === 'done' ? 'bg-emerald-500/5 border-emerald-500/20 cursor-default'
                  : draft.status === 'uploading' ? 'bg-blue-500/5 border-blue-500/20 cursor-default'
                  : draft.status === 'error' ? 'bg-red-500/5 border-red-500/20'
                  : editingDraftId === draft.draftId ? 'bg-amber-500/10 border-amber-400/60'
                  : selectedDraftIds.has(draft.draftId) ? 'bg-amber-500/10 border-amber-400/40'
                  : 'bg-[#111] border-white/5 hover:border-amber-400/20'
                }`}>
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
                  {draft.statusLabel && <p className="text-xs text-blue-400 mt-0.5">{draft.statusLabel}</p>}
                  {draft.error && <p className="text-xs text-red-400 mt-0.5 truncate">{draft.error}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-gray-500">${draft.price}</span>
                  {draft.status === 'done' && <CheckCircle size={14} className="text-emerald-400" />}
                  {draft.status === 'uploading' && <Loader2 size={14} className="animate-spin text-blue-400" />}
                  {draft.status !== 'uploading' && draft.status !== 'done' && (
                    <button onClick={e => { e.stopPropagation(); handleEditDraft(draft) }}
                      className="text-gray-500 hover:text-amber-400 transition-colors">
                      <Pencil size={13} />
                    </button>
                  )}
                  <button onClick={e => { e.stopPropagation(); removeDraft(draft.draftId) }}
                    className="text-gray-600 hover:text-red-400 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
