import { useEffect, useState, type FormEvent } from 'react'
import BotonExportar from '../components/BotonExportar'
import { Campo, Modal } from '../components/ui'
import {
  aCentavos,
  diasDesde,
  fechaArchivo,
  fechaHora,
  fechaLarga,
  moneda,
  msgError,
  type CuentaCliente,
  type CuentaDetalle,
  type PedidoExport
} from '../utils'

type ModalAbierto = null | 'nuevo' | 'editar' | 'cobro'

const ETIQ_ESTADO = { pagada: 'Pagada', parcial: 'Parcial', pendiente: 'Pendiente' } as const
const CLASE_ESTADO = { pagada: 'ok', parcial: 'bajo', pendiente: 'sin' } as const

export default function Clientes() {
  const [todos, setTodos] = useState<CuentaCliente[]>([])
  const [q, setQ] = useState('')
  const [soloDeuda, setSoloDeuda] = useState(false)
  const [selId, setSelId] = useState<number | null>(null)
  const [det, setDet] = useState<CuentaDetalle | null>(null)
  const [modal, setModal] = useState<ModalAbierto>(null)
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState('')

  const cargar = async () => setTodos(await window.api.listarCuentas('', false))

  useEffect(() => {
    cargar()
  }, [])

  useEffect(() => {
    if (selId === null) {
      setDet(null)
      return
    }
    window.api
      .detalleCuenta(selId)
      .then(setDet)
      .catch((e: unknown) => setError(msgError(e)))
  }, [selId, todos])

  function mostrarAviso(texto: string) {
    setAviso(texto)
    setTimeout(() => setAviso(''), 4000)
  }

  const t = q.trim().toLowerCase()
  const visibles = todos.filter(
    (c) =>
      (!soloDeuda || c.saldo > 0) &&
      (!t || [c.nombre, c.telefono ?? ''].some((x) => x.toLowerCase().includes(t)))
  )
  const conDeuda = todos.filter((c) => c.saldo > 0)
  const porCobrar = conDeuda.reduce((s, c) => s + c.saldo, 0)

  function exportarListado(): PedidoExport {
    return {
      archivo: `cuentas-corrientes-${fechaArchivo()}`,
      titulo: 'Cuentas corrientes de clientes',
      subtitulo: `Generado el ${fechaHora(new Date().toISOString())}`,
      columnas: [
        { titulo: 'Cliente' },
        { titulo: 'Teléfono' },
        { titulo: 'Dirección' },
        { titulo: 'Último cobro' },
        { titulo: 'Saldo (deuda)', tipo: 'moneda' }
      ],
      filas: visibles.map((c) => [
        c.nombre,
        c.telefono ?? '',
        c.direccion ?? '',
        c.ultimo_cobro ? fechaLarga(c.ultimo_cobro) : '',
        c.saldo / 100
      ]),
      notas: [`Total por cobrar: ${moneda(porCobrar)}`]
    }
  }

  function exportarEstado(): PedidoExport {
    const c = det?.cuenta
    const vigentes = [...(det?.movimientos ?? [])].reverse().filter((m) => !m.anulado)
    return {
      archivo: `cuenta-corriente-${(c?.nombre ?? 'cliente').replace(/\s+/g, '-')}-${fechaArchivo()}`,
      titulo: `Estado de cuenta: ${c?.nombre ?? ''}`,
      subtitulo: `Generado el ${fechaHora(new Date().toISOString())}`,
      columnas: [
        { titulo: 'Fecha' },
        { titulo: 'Detalle' },
        { titulo: 'Debe', tipo: 'moneda' },
        { titulo: 'Haber', tipo: 'moneda' },
        { titulo: 'Saldo', tipo: 'moneda' },
        { titulo: 'Estado' }
      ],
      filas: vigentes.map((m) => [
        fechaHora(m.fecha),
        m.detalle,
        m.debe ? m.debe / 100 : null,
        m.haber ? m.haber / 100 : null,
        m.saldo / 100,
        m.estado ? ETIQ_ESTADO[m.estado] : ''
      ]),
      notas: [
        `Comprado a cuenta: ${moneda(det?.resumen.comprado ?? 0)} · Cobrado: ${moneda(det?.resumen.cobrado ?? 0)}`,
        `Saldo actual: ${moneda(c?.saldo ?? 0)}`
      ]
    }
  }

  async function anularCobro(id: number) {
    if (!window.confirm('¿Anular este cobro? La deuda de la cuenta vuelve a aumentar.')) return
    try {
      await window.api.anularCobro(id)
      setError('')
      await cargar()
      mostrarAviso('Cobro anulado')
    } catch (err) {
      setError(msgError(err))
    }
  }

  async function eliminar() {
    if (!det) return
    if (!window.confirm(`¿Eliminar la cuenta de ${det.cuenta.nombre}?\n\nSolo se puede si no tiene ventas ni cobros.`)) return
    try {
      await window.api.eliminarCuenta(det.cuenta.id)
      setError('')
      setSelId(null)
      await cargar()
      mostrarAviso('Cuenta eliminada')
    } catch (err) {
      setError(msgError(err))
    }
  }

  async function alGuardar(mensaje: string, id?: number) {
    setModal(null)
    await cargar()
    if (id !== undefined) setSelId(id)
    mostrarAviso(mensaje)
  }

  const saldo = det?.cuenta.saldo ?? 0
  const res = det?.resumen

  return (
    <div className="pagina">
      <div className="cabecera">
        <h1>Clientes y cuentas corrientes</h1>
        <div className="cab-acciones">
          <BotonExportar armar={exportarListado} onListo={mostrarAviso} onError={setError} etiqueta="Exportar listado" />
          <button onClick={() => setModal('nuevo')}>+ Nueva cuenta</button>
        </div>
      </div>

      <div className="resumen">
        <div className="tarjeta sinclic">
          <span>Cuentas</span>
          <b>{todos.length}</b>
        </div>
        <div className={conDeuda.length > 0 ? 'tarjeta naranja' : 'tarjeta'} onClick={() => setSoloDeuda(true)}>
          <span>Con deuda</span>
          <b>{conDeuda.length}</b>
        </div>
        <div className="tarjeta sinclic">
          <span>Total por cobrar</span>
          <b>{moneda(porCobrar)}</b>
        </div>
      </div>

      {aviso && <div className="aviso-ok">{aviso}</div>}
      {error && <div className="error">{error}</div>}

      <div className="dos-col">
        <div>
          <input placeholder="Buscar por nombre o teléfono..." value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="check bloque">
            <input type="checkbox" checked={soloDeuda} onChange={(e) => setSoloDeuda(e.target.checked)} />
            Mostrar solo cuentas con deuda
          </label>
          <ul className="lista alta">
            {visibles.map((c) => (
              <li key={c.id} className={c.id === selId ? 'activo' : ''} onClick={() => setSelId(c.id)}>
                <strong>{c.nombre}</strong>
                {c.saldo > 0 && <span className="estado bajo chip">Debe {moneda(c.saldo)}</span>}
                <small className="sub">{c.telefono || 'Sin teléfono'}</small>
              </li>
            ))}
            {visibles.length === 0 && (
              <li className="vacio">
                {todos.length === 0 ? 'Todavía no hay cuentas. Usá "+ Nueva cuenta".' : 'Sin resultados.'}
              </li>
            )}
          </ul>
        </div>

        <div>
          {!det ? (
            <p className="vacio">
              Elegí una cuenta para ver cómo viene pagando. Las cuentas se cargan a mano y no tienen relación con
              los pacientes.
            </p>
          ) : (
            <>
              <div className="panel">
                <div className="cabecera">
                  <h2 className="titulo-panel">{det.cuenta.nombre}</h2>
                  <div className="acciones">
                    <button onClick={() => setModal('cobro')}>Registrar cobro</button>
                    <button className="gris" onClick={() => setModal('editar')}>
                      Editar
                    </button>
                    <button className="peligro" onClick={eliminar}>
                      Eliminar
                    </button>
                  </div>
                </div>
                <dl className="ficha">
                  <dt>Teléfono</dt>
                  <dd>{det.cuenta.telefono || '—'}</dd>
                  <dt>Dirección</dt>
                  <dd>{det.cuenta.direccion || '—'}</dd>
                  <dt>Nota</dt>
                  <dd>{det.cuenta.nota || '—'}</dd>
                </dl>
                <div className={saldo > 0 ? 'saldo-grande saldo-debe' : 'saldo-grande saldo-ok'}>
                  {saldo > 0 ? `Debe ${moneda(saldo)}` : saldo < 0 ? `Saldo a favor ${moneda(-saldo)}` : 'Al día'}
                </div>
                {res && (
                  <div className="stats">
                    <div className="stat">
                      <span>Comprado a cuenta</span>
                      <b>{moneda(res.comprado)}</b>
                    </div>
                    <div className="stat">
                      <span>Cobrado</span>
                      <b>{moneda(res.cobrado)}</b>
                    </div>
                    <div className="stat">
                      <span>Último cobro</span>
                      <b>{res.ultimoCobro ? fechaLarga(res.ultimoCobro) : 'Todavía no pagó'}</b>
                    </div>
                    <div className="stat">
                      <span>Deuda más antigua</span>
                      <b>
                        {res.masAntigua && saldo > 0
                          ? diasDesde(res.masAntigua) === 0
                            ? 'de hoy'
                            : `hace ${diasDesde(res.masAntigua)} días`
                          : '—'}
                      </b>
                    </div>
                  </div>
                )}
              </div>

              <div className="panel">
                <div className="cabecera">
                  <h2 className="titulo-panel">Movimientos de la cuenta</h2>
                  <BotonExportar armar={exportarEstado} onListo={mostrarAviso} onError={setError} etiqueta="Exportar estado de cuenta" />
                </div>
                <small className="ayuda">
                  Cada venta a cuenta suma deuda y cada cobro la resta. Los cobros se aplican primero a las ventas
                  más antiguas, por eso cada venta figura como Pagada, Parcial o Pendiente. Para corregir una venta,
                  anulala desde Ventas.
                </small>
                <table className="tabla sinclick">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Detalle</th>
                      <th>Estado</th>
                      <th>Debe</th>
                      <th>Haber</th>
                      <th>Saldo</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {det.movimientos.map((m) => (
                      <tr key={m.clave} className={m.anulado ? 'anulado' : ''}>
                        <td>{fechaHora(m.fecha)}</td>
                        <td className="celda-larga">
                          {m.detalle} {m.anulado ? <span className="badge gris">Anulado</span> : null}
                        </td>
                        <td>
                          {m.estado && (
                            <span className={`estado ${CLASE_ESTADO[m.estado]}`}>
                              {ETIQ_ESTADO[m.estado]}
                              {m.estado === 'parcial' ? ` (${moneda(m.cubierto ?? 0)})` : ''}
                            </span>
                          )}
                        </td>
                        <td className="col-num">{m.debe ? moneda(m.debe) : ''}</td>
                        <td className="col-num">{m.haber ? moneda(m.haber) : ''}</td>
                        <td className="col-num">{m.anulado ? '' : moneda(m.saldo)}</td>
                        <td>
                          {m.tipo === 'cobro' && !m.anulado && (
                            <button className="chico gris" onClick={() => anularCobro(m.id)}>
                              Anular
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {det.movimientos.length === 0 && (
                      <tr>
                        <td colSpan={7} className="vacio">
                          Sin movimientos. Se generan al vender a cuenta corriente desde Ventas.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {modal === 'nuevo' && (
        <CuentaModal onClose={() => setModal(null)} onGuardado={(id) => alGuardar('Cuenta creada', id)} />
      )}
      {modal === 'editar' && det && (
        <CuentaModal
          cuenta={det.cuenta}
          onClose={() => setModal(null)}
          onGuardado={() => alGuardar('Cambios guardados')}
        />
      )}
      {modal === 'cobro' && det && (
        <CobroModal
          cuentaId={det.cuenta.id}
          nombre={det.cuenta.nombre}
          saldo={saldo}
          onClose={() => setModal(null)}
          onGuardado={() => alGuardar('Cobro registrado')}
        />
      )}
    </div>
  )
}

function CuentaModal({
  cuenta,
  onClose,
  onGuardado
}: {
  cuenta?: { id: number; nombre: string; telefono: string | null; direccion: string | null; nota: string | null }
  onClose: () => void
  onGuardado: (id: number) => void
}) {
  const [f, setF] = useState({
    nombre: cuenta?.nombre ?? '',
    telefono: cuenta?.telefono ?? '',
    direccion: cuenta?.direccion ?? '',
    nota: cuenta?.nota ?? ''
  })
  const [error, setError] = useState('')

  async function guardar(e: FormEvent) {
    e.preventDefault()
    try {
      if (cuenta) {
        await window.api.editarCuenta({ id: cuenta.id, ...f })
        onGuardado(cuenta.id)
      } else {
        const id: number = await window.api.crearCuenta(f)
        onGuardado(id)
      }
    } catch (err) {
      setError(msgError(err))
    }
  }

  return (
    <Modal titulo={cuenta ? `Editar: ${cuenta.nombre}` : 'Nueva cuenta corriente'} onClose={onClose}>
      <form onSubmit={guardar}>
        <Campo label="Nombre y apellido (o razón social)">
          <input required autoFocus value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        </Campo>
        <div className="grid2">
          <Campo label="Teléfono">
            <input value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} />
          </Campo>
          <Campo label="Dirección">
            <input value={f.direccion} onChange={(e) => setF({ ...f, direccion: e.target.value })} />
          </Campo>
        </div>
        <Campo label="Nota (opcional)" ayuda="Ej: paga los viernes, criadero, límite de deuda acordado">
          <input value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} />
        </Campo>
        {error && <div className="error">{error}</div>}
        <div className="pie-modal">
          <button type="button" className="gris" onClick={onClose}>
            Cancelar
          </button>
          <button>{cuenta ? 'Guardar cambios' : 'Crear cuenta'}</button>
        </div>
      </form>
    </Modal>
  )
}

function CobroModal({
  cuentaId,
  nombre,
  saldo,
  onClose,
  onGuardado
}: {
  cuentaId: number
  nombre: string
  saldo: number
  onClose: () => void
  onGuardado: () => void
}) {
  const [monto, setMonto] = useState(saldo > 0 ? String(saldo / 100).replace('.', ',') : '')
  const [medio, setMedio] = useState('efectivo')
  const [nota, setNota] = useState('')
  const [error, setError] = useState('')

  async function guardar(e: FormEvent) {
    e.preventDefault()
    const centavos = aCentavos(monto)
    if (centavos <= 0) return setError('Ingresá un monto mayor a 0')
    if (
      centavos > Math.max(saldo, 0) &&
      !window.confirm(
        `El cobro (${moneda(centavos)}) es mayor que la deuda (${moneda(Math.max(saldo, 0))}). Queda saldo a favor del cliente. ¿Continuar?`
      )
    ) {
      return
    }
    try {
      await window.api.crearCobro({ cuentaId, monto: centavos, medio, nota })
      onGuardado()
    } catch (err) {
      setError(msgError(err))
    }
  }

  return (
    <Modal titulo={`Registrar cobro: ${nombre}`} onClose={onClose}>
      <form onSubmit={guardar}>
        <p className="detalle">
          Deuda actual: <b>{moneda(Math.max(saldo, 0))}</b>
        </p>
        <div className="grid2">
          <Campo label="Monto cobrado" ayuda="Ya viene con la deuda completa; cambialo si paga una parte.">
            <input required autoFocus value={monto} onChange={(e) => setMonto(e.target.value)} />
          </Campo>
          <Campo label="Medio de pago">
            <select value={medio} onChange={(e) => setMedio(e.target.value)}>
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="tarjeta">Tarjeta</option>
            </select>
          </Campo>
        </div>
        <Campo label="Nota (opcional)">
          <input value={nota} onChange={(e) => setNota(e.target.value)} />
        </Campo>
        {error && <div className="error">{error}</div>}
        <div className="pie-modal">
          <button type="button" className="gris" onClick={onClose}>
            Cancelar
          </button>
          <button>Registrar cobro</button>
        </div>
      </form>
    </Modal>
  )
}