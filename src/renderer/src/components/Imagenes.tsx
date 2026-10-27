import { useEffect, useState } from 'react'
import { msgError, type AdjuntoMini, type Elegida } from '../utils'

export function VisorImagen({
  id,
  nombre,
  onClose
}: {
  id: number
  nombre: string
  onClose: () => void
}) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    window.api
      .verImagen(id)
      .then((r: { url: string }) => setUrl(r.url))
      .catch((e: unknown) => setError(msgError(e)))
  }, [id])

  return (
    <div
      className="modal-fondo visor"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal ancho">
        <div className="modal-cab">
          <h2>{nombre}</h2>
          <button type="button" className="chico gris" onClick={onClose}>
            Cerrar
          </button>
        </div>
        {error ? (
          <div className="error">{error}</div>
        ) : url ? (
          <img className="visor-img" src={url} alt={nombre} />
        ) : (
          <p className="vacio">Cargando...</p>
        )}
      </div>
    </div>
  )
}

export function Miniatura({
  src,
  titulo,
  pie,
  etiqueta,
  onVer,
  onQuitar,
  textoQuitar = 'Quitar'
}: {
  src: string
  titulo: string
  pie?: string
  etiqueta?: string
  onVer?: () => void
  onQuitar?: () => void
  textoQuitar?: string
}) {
  return (
    <div className="thumb-wrap">
      <button type="button" className="thumb" title={titulo} onClick={onVer} disabled={!onVer}>
        {src ? <img src={src} alt={titulo} /> : <span className="sin-vista">Sin vista previa</span>}
      </button>
      {etiqueta && <span className="nueva">{etiqueta}</span>}
      {onQuitar && (
        <button type="button" className="quitar" onClick={onQuitar}>
          {textoQuitar}
        </button>
      )}
      <div className="thumb-pie">{pie ?? titulo}</div>
    </div>
  )
}

// Selector que se usa dentro de la ventana de consulta (nueva o editada)
export function SelectorImagenes({
  existentes,
  quitar,
  nuevas,
  onNuevas,
  onQuitar
}: {
  existentes: AdjuntoMini[]
  quitar: number[]
  nuevas: Elegida[]
  onNuevas: (n: Elegida[]) => void
  onQuitar: (ids: number[]) => void
}) {
  const [ver, setVer] = useState<AdjuntoMini | null>(null)
  const [error, setError] = useState('')
  const vigentes = existentes.filter((a) => !quitar.includes(a.id))

  async function agregar() {
    try {
      const elegidas: Elegida[] = await window.api.elegirImagenes()
      onNuevas([...nuevas, ...elegidas.filter((e) => !nuevas.some((n) => n.ruta === e.ruta))])
      setError('')
    } catch (err) {
      setError(msgError(err))
    }
  }

  return (
    <div>
      <div className="thumbs">
        {vigentes.map((a) => (
          <Miniatura
            key={a.id}
            src={a.miniatura}
            titulo={a.nombre}
            onVer={() => setVer(a)}
            onQuitar={() => onQuitar([...quitar, a.id])}
          />
        ))}
        {nuevas.map((n) => (
          <Miniatura
            key={n.ruta}
            src={n.vista}
            titulo={n.nombre}
            etiqueta="Nueva"
            onQuitar={() => onNuevas(nuevas.filter((x) => x.ruta !== n.ruta))}
          />
        ))}
      </div>
      {vigentes.length + nuevas.length === 0 && <p className="vacio">Sin imágenes.</p>}
      {error && <div className="error">{error}</div>}
      <button type="button" className="sec" onClick={agregar}>
        + Agregar imágenes
      </button>
      <small className="ayuda">
        JPG o PNG, hasta 25 MB cada una. Se guardan dentro de la app cuando guardás la consulta.
      </small>
      {ver && <VisorImagen id={ver.id} nombre={ver.nombre} onClose={() => setVer(null)} />}
    </div>
  )
}