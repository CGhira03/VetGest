import { Modal } from './ui'
import terminos from '../assets/terminos.limpio.txt?raw'

export default function TerminosModal({ onClose }: { onClose: () => void }) {
  const bloques = terminos
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
  return (
    <Modal ancho titulo="Términos y condiciones" onClose={onClose}>
      <div className="terminos">
        {bloques.map((b, i) => {
          if (b.startsWith('## ')) return <h3 key={i}>{b.slice(3)}</h3>
          const lineas = b.split('\n')
          if (lineas.every((l) => l.startsWith('- '))) {
            return (
              <ul key={i}>
                {lineas.map((l, j) => (
                  <li key={j}>{l.slice(2)}</li>
                ))}
              </ul>
            )
          }
          return <p key={i}>{b}</p>
        })}
      </div>
    </Modal>
  )
}