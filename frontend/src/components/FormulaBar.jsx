import { useState } from 'react'
import { Calculator, Check, Loader2, ChevronDown } from 'lucide-react'
import { api } from '../api.js'

const PRESETS = [
  { label: '+10%', margin: 10 },
  { label: '+20%', margin: 20 },
  { label: '+30%', margin: 30 },
  { label: '+50%', margin: 50 },
]

export default function FormulaBar({ selectedIds, onApplied }) {
  const [mode, setMode] = useState('percent') // 'percent' | 'formula'
  const [percent, setPercent] = useState('20')
  const [formula, setFormula] = useState('cost * 1.20')
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [open, setOpen] = useState(false)

  async function apply() {
    setApplying(true)
    setResult(null)
    setError(null)
    try {
      const body =
        mode === 'percent'
          ? { product_source_ids: selectedIds, formula: '', margin_percent: parseFloat(percent) }
          : { product_source_ids: selectedIds, formula }

      const res = await api.bulkEditPrices(body)
      setResult(res)
      onApplied()
    } catch (err) {
      setError(err.message)
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#1a1a1a] overflow-hidden">
      {/* Toggle header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-300 hover:text-white transition-colors"
      >
        <span className="flex items-center gap-2">
          <Calculator size={15} className="text-pink-400" />
          Price Formula
          {selectedIds.length > 0 && (
            <span className="bg-pink-600/30 text-pink-300 text-xs px-2 py-0.5 rounded-full">
              {selectedIds.length} selected
            </span>
          )}
          {selectedIds.length === 0 && (
            <span className="text-gray-600 text-xs">(applies to all)</span>
          )}
        </span>
        <ChevronDown
          size={15}
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/10 pt-3">
          {/* Mode tabs */}
          <div className="flex bg-white/5 rounded-lg p-1 gap-1">
            {['percent', 'formula'].map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  mode === m ? 'bg-pink-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {m === 'percent' ? 'Margin %' : 'Custom Formula'}
              </button>
            ))}
          </div>

          {mode === 'percent' ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => setPercent(String(p.margin))}
                    className={`flex-1 py-1.5 rounded-lg text-xs border transition-colors ${
                      percent === String(p.margin)
                        ? 'border-pink-500 bg-pink-500/20 text-pink-300'
                        : 'border-white/10 text-gray-400 hover:border-white/30'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Selling = Cost ×</span>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                  className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-pink-500"
                />
                <span className="text-xs text-gray-400">%  markup</span>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-xs text-gray-500">Use <code className="text-pink-300">cost</code> as the variable</p>
              <input
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
                placeholder="e.g. cost * 1.20 + 5"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-pink-500"
              />
            </div>
          )}

          {error && <p className="text-red-400 text-xs">{error}</p>}
          {result && (
            <p className="text-green-400 text-xs flex items-center gap-1">
              <Check size={12} /> Updated {result.updated}, skipped {result.skipped}
            </p>
          )}

          <button
            onClick={apply}
            disabled={applying}
            className="w-full bg-pink-600 hover:bg-pink-500 disabled:bg-pink-900 disabled:cursor-not-allowed text-white text-sm font-medium py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            {applying ? <Loader2 size={14} className="animate-spin" /> : <Calculator size={14} />}
            Apply & Save
          </button>
        </div>
      )}
    </div>
  )
}
