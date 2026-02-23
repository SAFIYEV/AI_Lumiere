import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check, Zap, Eye } from 'lucide-react'
import { MODELS } from '../types'

interface Props {
  selected: string
  onChange: (id: string) => void
}

export default function ModelSelector({ selected, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const current = MODELS.find((m) => m.id === selected)

  return (
    <div className="model-selector" ref={ref}>
      <button className="model-selector__trigger" onClick={() => setOpen((v) => !v)}>
        {current?.name || selected}
        <ChevronDown size={15} style={{ opacity: 0.5 }} />
      </button>

      {open && (
        <div className="model-selector__dropdown">
          {MODELS.map((m) => (
            <button
              key={m.id}
              className={`model-option ${m.id === selected ? 'model-option--active' : ''}`}
              onClick={() => {
                onChange(m.id)
                setOpen(false)
              }}
            >
              <Zap size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <div className="model-option__info">
                <div className="model-option__name">{m.name}</div>
                <div className="model-option__details">
                  <span>{m.provider}</span>
                  <span>{m.speed}</span>
                  <span>{m.context}</span>
                  {m.vision && <span className="model-option__vision"><Eye size={11} /> Vision</span>}
                </div>
              </div>
              {m.id === selected && (
                <Check size={16} className="model-option__check" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
