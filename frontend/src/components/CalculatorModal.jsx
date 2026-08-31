import { useState, useEffect, useRef } from 'react'
import { X, Delete } from 'lucide-react'

// Built-in POS calculator. Keyboard-friendly; "Use amount" pushes the result
// into the Paid field on the sale. Pure client-side, no persistence.
export default function CalculatorModal({ onClose, onUse }) {
  const [expr, setExpr] = useState('')
  const [result, setResult] = useState('0')
  const [error, setError] = useState(false)
  const boxRef = useRef(null)

  // Strict full-expression eval — used only when the user presses "=".
  function evaluate(e) {
    if (!e.trim()) return { ok: true, value: '0' }
    if (!/^[\d+\-*/%.()\s]+$/.test(e)) return { ok: false }
    try {
      // eslint-disable-next-line no-new-func
      const v = Function('"use strict";return (' + e.replace(/%/g, '/100') + ')')()
      if (typeof v !== 'number' || !isFinite(v)) return { ok: false }
      return { ok: true, value: String(Math.round(v * 100) / 100) }
    } catch { return { ok: false } }
  }

  // Live running preview: a trailing operator / open paren is normal while typing,
  // so strip incomplete tails and show the last computable value instead of "Error".
  function preview(e) {
    let s = e.replace(/[+\-*/%.\s]+$/, '')            // drop trailing operators/dots
    const open = (s.match(/\(/g) || []).length
    const close = (s.match(/\)/g) || []).length
    if (open > close) s += ')'.repeat(open - close)   // auto-close open parens for preview
    return evaluate(s)
  }

  function refresh(next) {
    const r = preview(next)
    if (r.ok) { setResult(r.value); setError(false) }
    // if not computable mid-type, keep the last good result quietly (no error flash)
  }

  function push(ch) { setExpr(prev => { const next = prev + ch; refresh(next); return next }) }
  function clearAll() { setExpr(''); setResult('0'); setError(false) }
  function backspace() { setExpr(prev => { const next = prev.slice(0, -1); if (!next) { setResult('0'); setError(false) } else refresh(next); return next }) }
  function equals() {
    const r = evaluate(expr)
    if (r.ok) { setExpr(r.value); setResult(r.value); setError(false) }
    else { const p = preview(expr); if (p.ok) { setExpr(p.value); setResult(p.value); setError(false) } else setError(true) }
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); equals(); return }
      if (e.key === 'Backspace') { e.preventDefault(); backspace(); return }
      if (e.key.toLowerCase() === 'c') { clearAll(); return }
      if (/^[0-9+\-*/.%()]$/.test(e.key)) { push(e.key) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expr])

  const keys = ['C', '(', ')', '/', '7', '8', '9', '*', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', '%', '=']

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div ref={boxRef} className="bg-white rounded-2xl w-full max-w-xs shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">Calculator</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>

        <div className="px-4 pt-3">
          <div className="bg-slate-900 rounded-xl px-4 py-3 text-right">
            <div className="text-slate-400 text-xs h-4 truncate font-mono">{expr || ' '}</div>
            <div className={'text-3xl font-bold font-mono truncate ' + (error ? 'text-red-400' : 'text-white')}>
              {error ? 'Error' : result}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 p-4">
          {keys.map(k => (
            <button key={k}
              onClick={() => k === 'C' ? clearAll() : k === '=' ? equals() : push(k)}
              className={
                'py-3 rounded-xl text-lg font-semibold transition-colors ' +
                (k === '=' ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                  : k === 'C' ? 'bg-red-50 text-red-600 hover:bg-red-100'
                  : /[/*\-+%()]/.test(k) ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  : 'bg-gray-50 text-gray-900 hover:bg-gray-100')
              }>
              {k}
            </button>
          ))}
        </div>

        <div className="flex gap-2 px-4 pb-4">
          <button onClick={backspace} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-semibold hover:bg-gray-200 flex items-center justify-center gap-1.5">
            <Delete size={16} /> Backspace
          </button>
          {onUse && (
            <button onClick={() => { const r = expr.trim() ? preview(expr) : { ok: true, value: result }; if (r.ok && Number(r.value) >= 0) onUse(Number(r.value)) }}
              disabled={error || result === '0'}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed">
              Use as Paid
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
