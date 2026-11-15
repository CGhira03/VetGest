import { useState } from 'react'
import TerminosModal from '../components/TerminosModal'
import { LOGO } from '../identidad'
import { msgError, type EstadoLicencia } from '../utils'

export default function Activacion({
  estado,
  onActivada
}: {
  estado: EstadoLicencia
  onActivada: () => void
}) {
  const [error, setError] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [acepto, setAcepto] = useState(false)
  const [verTerminos, setVerTerminos] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(estado.idMaquina)
      setCopiado(true)
    } catch {
      setCopiado(false)
    }
  }

  async function cargar() {
    setCargando(true)
    setError('')
    try {
      const r = await window.api.activarLicencia()
      if (r) {
        await window.api.aceptarTerminos()
        onActivada()
      }
    } catch (err) {
      setError(msgError(err))
    }
    setCargando(false)
  }

  return (
    <div className="activacion">
      <div className="activacion-caja">
        <img className="activacion-logo" src={LOGO} alt="VeteMascota" />
        <p className="detalle">Esta copia todavía no está activada.</p>

        {estado.modo === 'invalida' && estado.motivo && (
          <div className="error">La licencia instalada no es válida: {estado.motivo}.</div>
        )}

        <ol className="pasos">
          <li>
            Enviá este <b>ID de máquina</b> a quien te entregó la aplicación:
            <div className="id-maquina">{estado.idMaquina}</div>
            <button type="button" className="chico" onClick={copiar}>
              {copiado ? 'Copiado ✓' : 'Copiar ID'}
            </button>
          </li>
          <li>Vas a recibir un archivo de licencia (extensión .vetlic).</li>
          <li>Aceptá los términos y cargalo acá:</li>
        </ol>

        <label className="acepto">
          <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} />
          <span>
            Leí y acepto los{' '}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault()
                setVerTerminos(true)
              }}
            >
              términos y condiciones
            </a>
            .
          </span>
        </label>

        {error && <div className="error">{error}</div>}
        <button onClick={cargar} disabled={cargando || !acepto}>
          Cargar archivo de licencia
        </button>
        <small className="ayuda">La licencia es válida para esta computadora.</small>
      </div>
      {verTerminos && <TerminosModal onClose={() => setVerTerminos(false)} />}
    </div>
  )
}