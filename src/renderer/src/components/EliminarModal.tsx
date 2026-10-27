import { useState, type FormEvent, type ReactNode } from 'react'
import { Campo, Modal } from './ui'
import { msgError } from '../utils'

export default function EliminarModal({
  titulo,
  palabra,
  children,
  onClose,
  onConfirmar
}: {
  titulo: string
  palabra: string
  children: ReactNode
  onClose: () => void
  onConfirmar: () => Promise<void>
}) {
  const [txt, setTxt] = useState('')
  const [error, setError] = useState('')
  const [borrando, setBorrando] = useState(false)
  const ok = txt.trim().toLowerCase() === palabra.trim().toLowerCase()

  async function confirmar(e: FormEvent) {
    e.preventDefault()
    if (!ok) return
    setBorrando(true)
    try {
      await onConfirmar()
    } catch (err) {
      setError(msgError(err))
      setBorrando(false)
    }
  }

  return (
    <Modal titulo={titulo} onClose={onClose}>
      <form onSubmit={confirmar}>
        <div className="peligro-caja">{children}</div>
        <Campo label={`Para confirmar, escribí: ${palabra}`}>
          <input autoFocus value={txt} onChange={(e) => setTxt(e.target.value)} />
        </Campo>
        {error && <div className="error">{error}</div>}
        <div className="pie-modal">
          <button type="button" className="gris" onClick={onClose}>
            Cancelar
          </button>
          <button className="peligro" disabled={!ok || borrando}>
            Eliminar definitivamente
          </button>
        </div>
      </form>
    </Modal>
  )
}