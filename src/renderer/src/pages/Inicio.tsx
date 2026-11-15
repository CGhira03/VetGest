import { useEffect, useState } from 'react'
import { LOGO } from '../identidad'
import {
  estadoStock,
  ETIQUETA_ESTADO,
  msgError,
  plural,
  type EstadoLicencia,
  type Pestana,
  type Producto
} from '../utils'

const MAX_LISTA = 8

export default function Inicio({
  estado,
  dias,
  diasAviso,
  onIr
}: {
  estado: EstadoLicencia
  dias: number | null
  diasAviso: number
  onIr: (t: Pestana) => void
}) {
  const [reponer, setReponer] = useState<Producto[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    window.api
      .listarProductos()
      .then((lista: Producto[]) => {
        const aviso = lista
          .filter((p) => p.activo === 1 && estadoStock(p) !== 'ok')
          .sort((a, b) => {
            const sa = estadoStock(a) === 'sin' ? 0 : 1
            const sb = estadoStock(b) === 'sin' ? 0 : 1
            return sa - sb || a.nombre.localeCompare(b.nombre)
          })
        setReponer(aviso)
      })
      .catch((e: unknown) => setError(msgError(e)))
  }, [])

  const nombre = estado.modo === 'licencia' ? (estado.licenciatario ?? '') : ''
  const fecha = new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })

  const sinCopia = dias !== null && dias >= diasAviso
  const hayStock = reponer !== null && reponer.length > 0
  const todoBien = reponer !== null && !hayStock && dias !== null && !sinCopia
  const sinStock = (reponer ?? []).filter((p) => estadoStock(p) === 'sin').length

  return (
    <div className="inicio">
      <div className="portada">
        <img className="portada-logo" src={LOGO} alt="VeteMascota" />
        <div className="portada-texto">
          <h1>{nombre ? `Hola, ${nombre}` : 'Hola'}</h1>
          <span className="detalle">Hoy es {fecha}.</span>
        </div>
      </div>

      <h2>Avisos</h2>
      {error && <div className="error">{error}</div>}

      {hayStock && reponer && (
        <div className={sinStock > 0 ? 'aviso-caja rojo' : 'aviso-caja naranja'}>
          <div className="cabecera">
            <b>
              {plural(reponer.length, 'producto necesita', 'productos necesitan')} reposición
              {sinStock > 0 ? ` (${sinStock} sin stock)` : ''}
            </b>
            <button className="chico" onClick={() => onIr('Stock')}>
              Ver en Stock
            </button>
          </div>
          <ul className="aviso-lista">
            {reponer.slice(0, MAX_LISTA).map((p) => (
              <li key={p.id}>
                <span>{p.nombre}</span>
                <span>
                  {p.stock} {p.unidad}{' '}
                  <span className={`estado ${estadoStock(p)}`}>{ETIQUETA_ESTADO[estadoStock(p)]}</span>
                </span>
              </li>
            ))}
          </ul>
          {reponer.length > MAX_LISTA && (
            <small className="ayuda">y {reponer.length - MAX_LISTA} más en la pestaña Stock</small>
          )}
        </div>
      )}

      {sinCopia && (
        <div className="aviso-caja naranja">
          <div className="cabecera">
            <b>
              {dias === Infinity
                ? 'Todavía no exportaste ninguna copia de seguridad.'
                : `Hace ${dias} días que no exportás una copia de seguridad.`}
            </b>
            <button className="chico" onClick={() => onIr('Configuración')}>
              Hacer una copia
            </button>
          </div>
          <small className="ayuda">
            Si la computadora falla y no tenés una copia, se pierden las historias clínicas.
          </small>
        </div>
      )}

      {todoBien && (
        <div className="aviso-caja ok">
          Todo en orden: no hay productos para reponer y tus copias de seguridad están al día.
        </div>
      )}

      {dias !== null && !sinCopia && (
        <small className="ayuda">
          Última copia de seguridad: {dias === 0 ? 'hoy' : dias === 1 ? 'hace 1 día' : `hace ${dias} días`}.
        </small>
      )}
    </div>
  )
}