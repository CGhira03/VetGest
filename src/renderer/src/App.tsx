import { useEffect, useState } from 'react'
import Inicio from './pages/Inicio'
import Pacientes from './pages/Pacientes'
import Ventas from './pages/Ventas'
import Clientes from './pages/Clientes'
import Stock from './pages/Stock'
import Proveedores from './pages/Proveedores'
import Configuracion from './pages/Configuracion'
import Activacion from './pages/Activacion'
import { LOGO } from './identidad'
import { diasDesde, msgError, PESTANAS, type EstadoLicencia, type Pestana } from './utils'

const DIAS_AVISO_COPIA = 7

export default function App() {
  const [estado, setEstado] = useState<EstadoLicencia | null>(null)
  const [errorInicio, setErrorInicio] = useState('')
  const [tab, setTab] = useState<Pestana>('Inicio')
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
  
  return (
    <div className="shell">
      <nav>
        <span className="logo-wrap">
          <img src={LOGO} alt="VeteMascota" />
        </span>
        {PESTANAS.map((t) => (
          <button key={t} className={t === tab ? 'tab activo' : 'tab'} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
        <span className="lic-nombre">{estado.licenciatario}</span>
      </nav>
      <div className="contenido">
        {tab === 'Inicio' && <Inicio estado={estado} dias={dias} diasAviso={DIAS_AVISO_COPIA} onIr={setTab} />}
        {tab === 'Pacientes' && <Pacientes />}
        {tab === 'Ventas' && <Ventas />}
        {tab === 'Clientes' && <Clientes />}
        {tab === 'Stock' && <Stock />}
        {tab === 'Proveedores' && <Proveedores />}
        {tab === 'Configuración' && <Configuracion estado={estado} onCambio={cargarEstado} />}
      </div>
    </div>
  )
}