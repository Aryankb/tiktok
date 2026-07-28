import { useState, useEffect, useRef } from 'react'
import { Search, ChevronDown } from 'lucide-react'
import { categoryApi } from '../api.js'

export default function CategorySelect({ value, onChange, className = '' }) {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    setLoading(true)
    categoryApi.list()
      .then(setCategories)
      .catch((e) => setFetchError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = query
    ? categories.filter((c) => c.full_path.toLowerCase().includes(query.toLowerCase()))
    : categories

  const selected = categories.find((c) => c.id === value)

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-left flex items-center justify-between gap-2 focus:outline-none focus:border-pink-500 transition-colors"
      >
        <span className={`truncate ${selected ? 'text-white' : 'text-gray-600'}`}>
          {loading ? 'Loading…' : selected ? selected.full_path : '— select category —'}
        </span>
        <ChevronDown size={11} className="text-gray-500 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[280px] bg-[#1a1a1a] border border-white/15 rounded-xl shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-white/10">
            <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-1.5">
              <Search size={11} className="text-gray-500 shrink-0" />
              <input
                autoFocus
                placeholder="Search categories…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="bg-transparent text-white text-xs outline-none flex-1 placeholder-gray-600"
              />
            </div>
          </div>

          {fetchError && (
            <p className="text-red-400 text-xs px-3 py-2">{fetchError}</p>
          )}

          <div className="max-h-52 overflow-y-auto">
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); setQuery('') }}
              className="w-full text-left px-3 py-2 text-xs text-gray-500 hover:bg-white/5 transition-colors"
            >
              — none —
            </button>
            {filtered.length === 0 && !fetchError && (
              <p className="text-gray-600 text-xs px-3 py-2">No results</p>
            )}
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => { onChange(c.id); setOpen(false); setQuery('') }}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-white/5 transition-colors ${
                  c.id === value ? 'text-pink-400 bg-pink-500/5' : 'text-gray-300'
                }`}
              >
                <span className="block truncate">{c.full_path}</span>
                <span className="text-gray-600 font-mono text-[10px]">{c.id}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
