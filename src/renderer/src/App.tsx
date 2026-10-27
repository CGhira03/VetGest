import { useEffect, useState } from 'react'
import Pacientes from './pages/Pacientes'
import Stock from './pages/Stock'
import Proveedores from './pages/Proveedores'
import Configuracion from './pages/Configuracion'
import Activacion from './pages/Activacion'
import { diasDesde, msgError, type EstadoLicencia } from './utils'

const tabs = ['Pacientes', 'Stock', 'Proveedores', 'Configuración'] as const
const DIAS_AVISO_COPIA = 7

export default function App() {
  const [estado, setEstado] = useState<EstadoLicencia | null>(null)
  const [errorInicio, setErrorInicio] = useState('')
  const [tab, setTab] = useState<(typeof tabs)[number]>('Pacientes')
  const [ultimaCopia, setUltimaCopia] = useState<string | null | undefined>(undefined)

  const cargarEstado = () =>
    window.api
      .estadoLicencia()
      .then(setEstado)
      .catch((e: unknown) => setErrorInicio(msgError(e)))

  useEffect(() => {
    cargarEstado()
  }, [])

  useEffect(() => {
    if (estado?.activada) {
      window.api.estadoCopias().then((c: { ultimaCopia: string | null }) => setUltimaCopia(c.ultimaCopia))
    }
  }, [estado, tab])

  if (errorInicio) {
    return (
      <div className="pagina">
        <div className="error">{errorInicio}</div>
      </div>
    )
  }
  if (!estado) {
    return (
      <div className="pagina">
        <p className="vacio">Iniciando...</p>
      </div>
    )
  }
  if (!estado.activada) return <Activacion estado={estado} onActivada={cargarEstado} />

  const dias = ultimaCopia === undefined ? null : ultimaCopia === null ? Infinity : diasDesde(ultimaCopia)
  const avisarCopia = dias !== null && dias >= DIAS_AVISO_COPIA && tab !== 'Configuración'

  return (
    <div className="shell">
      <nav>
        <span className="logo">VetGest</span>
        {tabs.map((t) => (
          <button key={t} className={t === tab ? 'tab activo' : 'tab'} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
        <span className="lic-nombre">{estado.licenciatario}</span>
      </nav>
      {avisarCopia && (
        <div className="banner-copia">
          <span>
            {dias === Infinity
              ? 'Todavía no exportaste ninguna copia de seguridad.'
              : `Hace ${dias} días que no exportás una copia de seguridad.`}
          </span>
          <button className="chico" onClick={() => setTab('Configuración')}>
            Hacer una copia
          </button>
        </div>
      )}
      <div className="contenido">
        {tab === 'Pacientes' && <Pacientes />}
        {tab === 'Stock' && <Stock />}
        {tab === 'Proveedores' && <Proveedores />}
        {tab === 'Configuración' && <Configuracion estado={estado} onCambio={cargarEstado} />}
      </div>
    </div>
  )
}