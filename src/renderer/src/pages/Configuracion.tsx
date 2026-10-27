import { useEffect, useState } from 'react'
import { diasDesde, fechaHora, fechaLarga, msgError, type EstadoLicencia } from '../utils'

interface ResultadoCopia {
  ruta: string
  mismaUnidad: boolean
}

export default function Configuracion({
  estado,
  onCambio
}: {
  estado: EstadoLicencia
  onCambio: () => void
}) {
  const [ultima, setUltima] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ResultadoCopia | null>(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [copiado, setCopiado] = useState(false)

  const cargar = () =>
    window.api.estadoCopias().then((c: { ultimaCopia: string | null }) => setUltima(c.ultimaCopia))

  useEffect(() => {
    cargar()
  }, [])

  async function copiarId() {
    try {
      await navigator.clipboard.writeText(estado.idMaquina)
      setCopiado(true)
    } catch {
      setCopiado(false)
    }
  }

  async function cambiarLicencia() {
    setError('')
    try {
      const r = await window.api.activarLicencia()
      if (r) {
        setAviso('Licencia actualizada')
        onCambio()
      }
    } catch (err) {
      setError(msgError(err))
    }
  }

  async function exportar() {
    setOcupado(true)
    setError('')
    setResultado(null)
    setAviso('')
    try {
      const r: ResultadoCopia | null = await window.api.exportarCopia()
      if (r) {
        setResultado(r)
        await cargar()
      }
    } catch (err) {
      setError(msgError(err))
    }
    setOcupado(false)
  }

  async function restaurar() {
    setError('')
    setResultado(null)
    setAviso('')
    try {
      const c: { ruta: string; fecha: string } | null = await window.api.elegirRestauracion()
      if (!c) return
      const cuando = c.fecha ? fechaHora(c.fecha) : 'fecha desconocida'
      if (
        !window.confirm(
          `Se van a reemplazar TODOS los datos actuales por los de la copia del ${cuando}.\n\nLos datos actuales se guardan antes en la carpeta "respaldo-previo" dentro de la carpeta de datos. La aplicación se reinicia sola.\n\n¿Continuar?`
        )
      ) {
        return
      }
      setOcupado(true)
      await window.api.restaurarCopia(c.ruta)
      setAviso('Restaurando... la aplicación se reinicia sola.')
    } catch (err) {
      setError(msgError(err))
      setOcupado(false)
    }
  }

  const dias = ultima ? diasDesde(ultima) : null

  return (
    <div className="pagina">
      <h1>Configuración</h1>
      {aviso && <div className="aviso-ok">{aviso}</div>}
      {error && <div className="error">{error}</div>}

      <div className="panel">
        <h2 className="titulo-panel">Licencia</h2>
        <dl className="ficha">
          <dt>Licenciado a</dt>
          <dd>{estado.licenciatario}</dd>
          <dt>Emitida</dt>
          <dd>{estado.emitida ? fechaLarga(estado.emitida + 'T12:00:00') : '—'}</dd>
          <dt>ID de máquina</dt>
          <dd>
            <span className="id-chico">{estado.idMaquina}</span>{' '}
            <button className="chico gris" onClick={copiarId}>
              {copiado ? 'Copiado ✓' : 'Copiar'}
            </button>
          </dd>
          <dt>Versión</dt>
          <dd>{estado.version}</dd>
        </dl>
        <div className="acciones">
          <button className="sec" onClick={cambiarLicencia}>
            Cargar otro archivo de licencia
          </button>
        </div>
        <small className="ayuda">
          Guardá una copia del archivo de licencia junto con tus copias de seguridad. Si reinstalás la
          aplicación en esta misma computadora, alcanza con volver a cargarlo.
        </small>
      </div>

      <div className="panel">
        <h2 className="titulo-panel">Copias de seguridad</h2>
        <p className="detalle">
          Hacer copias periódicas y guardarlas fuera de esta computadora es responsabilidad del titular.
          La copia incluye la base de datos, las imágenes y el archivo de licencia.
        </p>
        <p>
          Última copia exportada:{' '}
          <b>{ultima ? `${fechaHora(ultima)} (hace ${dias} ${dias === 1 ? 'día' : 'días'})` : 'nunca'}</b>
        </p>
        <div className="acciones">
          <button onClick={exportar} disabled={ocupado}>
            Exportar copia de seguridad
          </button>
          <button className="sec" onClick={restaurar} disabled={ocupado}>
            Restaurar desde una copia
          </button>
        </div>
        {resultado && (
          <div className="aviso-ok">
            Copia guardada en: <b>{resultado.ruta}</b>
          </div>
        )}
        {resultado?.mismaUnidad && (
          <div className="alerta">
            La copia quedó en el mismo disco que la aplicación. Si el disco falla, se pierde todo. Copiala
            a un pendrive, un disco externo o la nube.
          </div>
        )}
      </div>

      <div className="panel">
        <h2 className="titulo-panel">Datos</h2>
        <p className="detalle">
          Carpeta donde se guardan los datos de esta computadora:
          <br />
          <span className="id-chico">{estado.carpetaDatos}</span>
        </p>
      </div>
    </div>
  )
}