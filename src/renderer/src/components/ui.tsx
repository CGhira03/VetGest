import type { ReactNode } from 'react'

export function Modal({
  titulo,
  onClose,
  ancho,
  children
}: {
  titulo: string
  onClose: () => void
  ancho?: boolean
  children: ReactNode
}) {
  return (
    <div
      className="modal-fondo"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={ancho ? 'modal ancho' : 'modal'}>
        <div className="modal-cab">
          <h2>{titulo}</h2>
          <button type="button" className="chico gris" onClick={onClose}>
            Cerrar
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Campo({
  label,
  ayuda,
  children
}: {
  label: string
  ayuda?: string
  children: ReactNode
}) {
  return (
    <label className="campo">
      <span className="etiqueta">{label}</span>
      {children}
      {ayuda && <small className="ayuda">{ayuda}</small>}
    </label>
  )
}