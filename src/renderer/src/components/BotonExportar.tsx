import { useState } from 'react'
import { msgError, type PedidoExport } from '../utils'

export default function BotonExportar({
  armar,
  onListo,
  onError,
  etiqueta = 'Exportar'
}: {
  armar: () => PedidoExport
  onListo: (mensaje: string) => void
  onError: (mensaje: string) => void
  etiqueta?: string
}) {
  const [abierto, setAbierto] = useState(false)

  async function exportar(formato: 'pdf' | 'xlsx') {
    setAbierto(false)
    try {
      const r: { ruta: string } | null = await window.api.exportarTabla({ ...armar(), formato })
      if (r) onListo(`Archivo guardado en ${r.ruta}`)
    } catch (err) {
      onError(msgError(err))
    }
  }

  return (
    <div className="exp-wrap">
      <button type="button" className="sec" onClick={() => setAbierto(!abierto)}>
        {etiqueta} ▾
      </button>
      {abierto && (
        <>
          <div className="menu-fondo" onClick={() => setAbierto(false)} />
          <div className="menu-exp">
            <button type="button" onClick={() => exportar('pdf')}>
              PDF
            </button>
            <button type="button" onClick={() => exportar('xlsx')}>
              Excel (.xlsx)
            </button>
          </div>
        </>
      )}
    </div>
  )
}