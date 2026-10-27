import { useState } from 'react'
import Pacientes from './pages/Pacientes'
import Stock from './pages/Stock'
import Proveedores from './pages/Proveedores'

const tabs = ['Pacientes', 'Stock', 'Proveedores'] as const

export default function App() {
  const [tab, setTab] = useState<(typeof tabs)[number]>('Pacientes')

  return (
    <div className="shell">
      <nav>
        <span className="logo">VetGest</span>
        {tabs.map((t) => (
          <button key={t} className={t === tab ? 'tab activo' : 'tab'} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>
      <div className="contenido">
        {tab === 'Pacientes' && <Pacientes />}
        {tab === 'Stock' && <Stock />}
        {tab === 'Proveedores' && <Proveedores />}
      </div>
    </div>
  )
}