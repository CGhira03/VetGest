import { useEffect, useState } from 'react'
import BotonExportar from '../components/BotonExportar'
import { Campo, Modal } from '../components/ui'
import {
  aCentavos,
  aPesos,
  ETIQUETA_PAGO,
  fechaArchivo,
  fechaHora,
  moneda,
  msgError,
  plural,
  type CuentaCliente,
  type MovimientoCaja,
  type Pago,
  type PedidoExport,
  type Producto,
  type VentaDetalle,
  type VentaFila
} from '../utils'

type Periodo = 'hoy' | 'mes' | 'todo'
type TipoMov = 'dinero' | 'venta' | 'cobro' | 'compra' | 'stock' | 'todo'

const ETIQ_PERIODO: Record<Periodo, string> = { hoy: 'Hoy', mes: 'Este mes', todo: 'Todo el historial' }
const ETIQ_TIPO: Record<TipoMov, string> = {
  dinero: 'Dinero: ventas, cobros y compras',
  venta: 'Solo ventas',
  cobro: 'Solo cobros de cuenta corriente',
  compra: 'Solo compras de mercadería',
  stock: 'Solo movimientos de stock (consultas, bajas, ajustes)',
  todo: 'Todo'
}
const ETIQ_MOV: Record<MovimientoCaja['tipo'], string> = {
  venta: 'Venta',
  cobro: 'Cobro',
  compra: 'Compra',
  stock: 'Stock'
}

function rango(p: Periodo): { desde: string; hasta: string } {
  const n = new Date()
  if (p === 'hoy') {
    return {
      desde: new Date(n.getFullYear(), n.getMonth(), n.getDate()).toISOString(),
      hasta: new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1).toISOString()
    }
  }
  if (p === 'mes') {
    return {
      desde: new Date(n.getFullYear(), n.getMonth(), 1).toISOString(),
      hasta: new Date(n.getFullYear(), n.getMonth() + 1, 1).toISOString()
    }
  }
  return { desde: '', hasta: '' }
}

export default function Ventas() {
  const [vista, setVista] = useState<'ventas' | 'movimientos'>('ventas')
  const [periodo, setPeriodo] = useState<Periodo>('hoy')
  const [q, setQ] = useState('')
  const [tipoMov, setTipoMov] = useState<TipoMov>('dinero')
  const [ventas, setVentas] = useState<VentaFila[]>([])
  const [movs, setMovs] = useState<MovimientoCaja[]>([])
  const [hoy, setHoy] = useState({ cantidad: 0, total: 0 })
  const [mes, setMes] = useState({ cantidad: 0, total: 0 })
  const [productos, setProductos] = useState<Producto[]>([])
  const [cuentas, setCuentas] = useState<CuentaCliente[]>([])
  const [nueva, setNueva] = useState(false)
  const [verId, setVerId] = useState<number | null>(null)
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState('')

  async function cargar() {
    try {
      setHoy(await window.api.totalesVentas(rango('hoy')))
      setMes(await window.api.totalesVentas(rango('mes')))
      if (vista === 'ventas') {
        setVentas(await window.api.listarVentas({ ...rango(periodo), q }))
      } else {
        setMovs(await window.api.listarMovimientosCaja({ ...rango(periodo), tipo: tipoMov }))
      }
      setError('')
    } catch (err) {
      setError(msgError(err))
    }
  }

  useEffect(() => {
    cargar()
  }, [vista, periodo, q, tipoMov])

  function mostrarAviso(texto: string) {
    setAviso(texto)
    setTimeout(() => setAviso(''), 4000)
  }

  async function abrirNueva() {
    setProductos(await window.api.listarProductos())
    setCuentas(await window.api.listarCuentas('', false))
    setNueva(true)
  }

  // ---- totales de la lista de ventas
  const totalLista = ventas.filter((v) => !v.anulada).reduce((s, v) => s + v.total, 0)

  // ---- totales del libro de movimientos (las anuladas no cuentan)
  const vig = movs.filter((m) => !m.anulado)
  const ingresos = vig.reduce((s, m) => s + m.ingreso, 0)
  const egresos = vig.reduce((s, m) => s + m.egreso, 0)
  const porMedio = vig
    .filter((m) => m.ingreso > 0)
    .reduce<Record<string, number>>((acc, m) => {
      acc[m.medio] = (acc[m.medio] ?? 0) + m.ingreso
      return acc
    }, {})

  function exportarVentas(): PedidoExport {
    return {
      archivo: `ventas-${fechaArchivo()}`,
      titulo: 'Ventas',
      subtitulo: `${ETIQ_PERIODO[periodo]} · generado el ${fechaHora(new Date().toISOString())}`,
      columnas: [
        { titulo: 'N°', tipo: 'entero' },
        { titulo: 'Fecha' },
        { titulo: 'Cliente' },
        { titulo: 'Detalle' },
        { titulo: 'Pago' },
        { titulo: 'Total', tipo: 'moneda' },
        { titulo: 'Estado' }
      ],
      filas: ventas.map((v) => [
        v.id,
        fechaHora(v.fecha),
        v.cliente ?? '',
        v.resumen ?? '',
        ETIQUETA_PAGO[v.pago],
        v.anulada ? null : v.total / 100,
        v.anulada ? 'Anulada' : 'Vigente'
      ]),
      notas: [`Total del período (sin anuladas): ${moneda(totalLista)}`]
    }
  }

  function exportarMovimientos(): PedidoExport {
    return {
      archivo: `movimientos-${fechaArchivo()}`,
      titulo: 'Movimientos de ingresos y egresos',
      subtitulo: `${ETIQ_PERIODO[periodo]} · ${ETIQ_TIPO[tipoMov]} · generado el ${fechaHora(new Date().toISOString())}`,
      columnas: [
        { titulo: 'Fecha' },
        { titulo: 'Tipo' },
        { titulo: 'Detalle' },
        { titulo: 'Medio' },
        { titulo: 'Ingreso', tipo: 'moneda' },
        { titulo: 'Egreso', tipo: 'moneda' },
        { titulo: 'A cuenta', tipo: 'moneda' }
      ],
      filas: movs.map((m) => [
        fechaHora(m.fecha),
        m.anulado ? `${ETIQ_MOV[m.tipo]} (anulado)` : ETIQ_MOV[m.tipo],
        m.detalle,
        m.medio,
        !m.anulado && m.ingreso ? m.ingreso / 100 : null,
        !m.anulado && m.egreso ? m.egreso / 100 : null,
        !m.anulado && m.aCuenta ? m.aCuenta / 100 : null
      ]),
      notas: [
        `Ingresos: ${moneda(ingresos)} · Egresos: ${moneda(egresos)} · Balance: ${moneda(ingresos - egresos)}`,
        ...Object.entries(porMedio).map(([medio, v]) => `Ingresos en ${medio}: ${moneda(v)}`)
      ]
    }
  }

  return (
    <div className="pagina">
      <div className="cabecera">
        <h1>Ventas</h1>
        <div className="cab-acciones">
          <BotonExportar
            armar={vista === 'ventas' ? exportarVentas : exportarMovimientos}
            onListo={mostrarAviso}
            onError={setError}
          />
          <button onClick={abrirNueva}>+ Nueva venta</button>
        </div>
      </div>

      <div className="resumen">
        <div className="tarjeta sinclic">
          <span>Ventas de hoy</span>
          <b>{moneda(hoy.total)}</b>
          <span>{plural(hoy.cantidad, 'venta', 'ventas')}</span>
        </div>
        <div className="tarjeta sinclic">
          <span>Ventas del mes</span>
          <b>{moneda(mes.total)}</b>
          <span>{plural(mes.cantidad, 'venta', 'ventas')}</span>
        </div>
      </div>

      {aviso && <div className="aviso-ok">{aviso}</div>}
      {error && <div className="error">{error}</div>}

      <div className="tabs-int">
        <button className={vista === 'ventas' ? 'tab-int activo' : 'tab-int'} onClick={() => setVista('ventas')}>
          Ventas
        </button>
        <button
          className={vista === 'movimientos' ? 'tab-int activo' : 'tab-int'}
          onClick={() => setVista('movimientos')}
        >
          Movimientos (ingresos y egresos)
        </button>
      </div>

      <div className="barra">
        <select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)}>
          <option value="hoy">Hoy</option>
          <option value="mes">Este mes</option>
          <option value="todo">Todo el historial</option>
        </select>
        {vista === 'ventas' ? (
          <input
            className="buscar"
            placeholder="Buscar por cliente o producto..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        ) : (
          <select value={tipoMov} onChange={(e) => setTipoMov(e.target.value as TipoMov)}>
            {(Object.keys(ETIQ_TIPO) as TipoMov[]).map((k) => (
              <option key={k} value={k}>
                {ETIQ_TIPO[k]}
              </option>
            ))}
          </select>
        )}
      </div>

      {vista === 'ventas' && (
        <>
          <table className="tabla">
            <thead>
              <tr>
                <th>N°</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Detalle</th>
                <th>Pago</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {ventas.map((v) => (
                <tr key={v.id} className={v.anulada ? 'anulado' : ''} onClick={() => setVerId(v.id)}>
                  <td>#{v.id}</td>
                  <td>{fechaHora(v.fecha)}</td>
                  <td>{v.cliente ?? '—'}</td>
                  <td className="celda-larga">{v.resumen}</td>
                  <td>
                    {ETIQUETA_PAGO[v.pago]} {v.anulada ? <span className="badge gris">Anulada</span> : null}
                  </td>
                  <td>{moneda(v.total)}</td>
                </tr>
              ))}
              {ventas.length === 0 && (
                <tr>
                  <td colSpan={6} className="vacio">
                    No hay ventas en este período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {ventas.length > 0 && (
            <p className="detalle">
              Total del período mostrado (sin contar anuladas): <b>{moneda(totalLista)}</b>
            </p>
          )}
        </>
      )}

      {vista === 'movimientos' && (
        <>
          <div className="resumen">
            <div className="tarjeta sinclic">
              <span>Ingresos</span>
              <b>{moneda(ingresos)}</b>
            </div>
            <div className="tarjeta sinclic">
              <span>Egresos</span>
              <b>{moneda(egresos)}</b>
            </div>
            <div className="tarjeta sinclic">
              <span>Balance</span>
              <b>{moneda(ingresos - egresos)}</b>
            </div>
          </div>
          {Object.keys(porMedio).length > 0 && (
            <div className="medios">
              {Object.entries(porMedio).map(([medio, v]) => (
                <span key={medio}>
                  {medio}: {moneda(v)}
                </span>
              ))}
            </div>
          )}
          <table className="tabla sinclick">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Detalle</th>
                <th>Medio</th>
                <th>Ingreso</th>
                <th>Egreso</th>
                <th>A cuenta</th>
              </tr>
            </thead>
            <tbody>
              {movs.map((m) => (
                <tr key={m.clave} className={m.anulado ? 'anulado' : ''}>
                  <td>{fechaHora(m.fecha)}</td>
                  <td>
                    <span className={`tag ${m.tipo}`}>{ETIQ_MOV[m.tipo]}</span>
                  </td>
                  <td className="celda-larga">{m.detalle}</td>
                  <td>{m.medio}</td>
                  <td className="col-num">{m.ingreso ? moneda(m.ingreso) : ''}</td>
                  <td className="col-num">{m.egreso ? moneda(m.egreso) : ''}</td>
                  <td className="col-num">{m.aCuenta ? moneda(m.aCuenta) : ''}</td>
                </tr>
              ))}
              {movs.length === 0 && (
                <tr>
                  <td colSpan={7} className="vacio">
                    No hay movimientos en este período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <small className="ayuda">
            Las ventas a cuenta corriente no son ingreso hasta que se cobran. Las compras suman egreso solo si
            al ingresar la mercadería cargaste el costo por unidad. Lo anulado se muestra tachado y no suma.
          </small>
        </>
      )}

      {nueva && (
        <NuevaVenta
          productos={productos}
          cuentas={cuentas}
          onClose={() => setNueva(false)}
          onGuardada={(id) => {
            setNueva(false)
            cargar()
            mostrarAviso(`Venta #${id} registrada`)
          }}
        />
      )}
      {verId !== null && (
        <DetalleVentaModal
          id={verId}
          onClose={() => setVerId(null)}
          onCambio={(m) => {
            setVerId(null)
            cargar()
            mostrarAviso(m)
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Nueva venta

interface Linea {
  key: number
  productoId: number | null
  descripcion: string
  unidad: string
  cantidad: number
  precioTxt: string
}

function NuevaVenta({
  productos,
  cuentas,
  onClose,
  onGuardada
}: {
  productos: Producto[]
  cuentas: CuentaCliente[]
  onClose: () => void
  onGuardada: (id: number) => void
}) {
  const [pago, setPago] = useState<Pago>('efectivo')
  const [cuentaId, setCuentaId] = useState('')
  const [clienteNombre, setClienteNombre] = useState('')
  const [nota, setNota] = useState('')
  const [lineas, setLineas] = useState<Linea[]>([])
  const [buscar, setBuscar] = useState('')
  const [cant, setCant] = useState('1')
  const [precio, setPrecio] = useState('')
  const [sig, setSig] = useState(1)
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const esCuenta = pago === 'cuenta_corriente'

  const buscarProducto = (txt: string): Producto | undefined =>
    productos.find((x) => x.nombre.toLowerCase() === txt.trim().toLowerCase())

  function cambiarBuscar(v: string) {
    setBuscar(v)
    const p = buscarProducto(v)
    if (p) setPrecio(aPesos(p.precio_venta))
  }

  function agregar() {
    const txt = buscar.trim()
    const n = parseInt(cant, 10)
    if (!txt) return setAviso('Escribí un producto o un concepto')
    if (!(n > 0)) return setAviso('La cantidad debe ser 1 o más')
    const p = buscarProducto(txt)
    if (!p && aCentavos(precio) <= 0) return setAviso('Ingresá el precio del concepto')
    setAviso('')
    setLineas([
      ...lineas,
      {
        key: sig,
        productoId: p?.id ?? null,
        descripcion: p?.nombre ?? txt,
        unidad: p?.unidad ?? '',
        cantidad: n,
        precioTxt: precio || (p ? aPesos(p.precio_venta) : '')
      }
    ])
    setSig(sig + 1)
    setBuscar('')
    setCant('1')
    setPrecio('')
  }

  const cambiar = (key: number, c: Partial<Linea>) =>
    setLineas(lineas.map((l) => (l.key === key ? { ...l, ...c } : l)))

  const pedido = (id: number): number =>
    lineas.filter((l) => l.productoId === id).reduce((s, l) => s + l.cantidad, 0)
  const disponible = (id: number): number => productos.find((p) => p.id === id)?.stock ?? 0

  const total = lineas.reduce((s, l) => s + l.cantidad * aCentavos(l.precioTxt), 0)
  const hayFalta = lineas.some((l) => l.productoId !== null && pedido(l.productoId) > disponible(l.productoId))
  const cantidadMala = lineas.some((l) => !(l.cantidad > 0))
  const faltaCuenta = esCuenta && !cuentaId
  const puede = lineas.length > 0 && !hayFalta && !cantidadMala && !faltaCuenta && !guardando

  async function guardar() {
    setGuardando(true)
    try {
      const id: number = await window.api.crearVenta({
        pago,
        cuentaId: esCuenta && cuentaId ? Number(cuentaId) : null,
        clienteNombre: esCuenta ? '' : clienteNombre,
        nota,
        items: lineas.map((l) => ({
          productoId: l.productoId,
          descripcion: l.descripcion,
          cantidad: l.cantidad,
          precioUnitario: aCentavos(l.precioTxt)
        }))
      })
      onGuardada(id)
    } catch (err) {
      setError(msgError(err))
      setGuardando(false)
    }
  }

  return (
    <Modal ancho titulo="Nueva venta" onClose={onClose}>
      <div className="sec-titulo">Forma de pago</div>
      <div className="grid2">
        <Campo label="Forma de pago">
          <select value={pago} onChange={(e) => setPago(e.target.value as Pago)}>
            {(Object.keys(ETIQUETA_PAGO) as Pago[]).map((k) => (
              <option key={k} value={k}>
                {ETIQUETA_PAGO[k]}
              </option>
            ))}
          </select>
        </Campo>
        {esCuenta ? (
          <Campo
            label="Cuenta del cliente"
            ayuda={
              cuentas.length === 0
                ? 'Todavía no hay cuentas. Creala primero en Clientes.'
                : 'La venta suma deuda a esta cuenta. Las cuentas se crean en Clientes.'
            }
          >
            <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
              <option value="">Elegir cuenta...</option>
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                  {c.saldo > 0 ? ` (debe ${moneda(c.saldo)})` : ''}
                </option>
              ))}
            </select>
          </Campo>
        ) : (
          <Campo label="Cliente o mascota (opcional)" ayuda="Texto libre para identificar la venta. Ej: Marta – Firulais">
            <input value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} />
          </Campo>
        )}
      </div>

      <div className="sec-titulo">Productos y conceptos</div>
      <div className="fila-venta">
        <div>
          <input
            list="lista-venta"
            placeholder="Producto del stock o concepto (ej: Consulta, Baño)"
            value={buscar}
            onChange={(e) => cambiarBuscar(e.target.value)}
          />
          <datalist id="lista-venta">
            {productos.map((p) => (
              <option key={p.id} value={p.nombre}>
                {`stock: ${p.stock} ${p.unidad} · ${moneda(p.precio_venta)}`}
              </option>
            ))}
          </datalist>
        </div>
        <input type="number" min="1" title="Cantidad" value={cant} onChange={(e) => setCant(e.target.value)} />
        <input placeholder="Precio unitario" value={precio} onChange={(e) => setPrecio(e.target.value)} />
        <button type="button" onClick={agregar}>
          Agregar
        </button>
      </div>
      <small className="ayuda">
        Si escribís el nombre de un producto del stock, se completa el precio y se descuenta stock. Cualquier
        otro texto se registra como un concepto sin stock.
      </small>
      {aviso && <div className="txt-rojo">{aviso}</div>}

      {lineas.length > 0 && (
        <table className="tabla sinclick items-tabla">
          <thead>
            <tr>
              <th>Descripción</th>
              <th style={{ width: 90 }}>Cantidad</th>
              <th style={{ width: 120 }}>Precio unit.</th>
              <th>Subtotal</th>
              <th style={{ width: 90 }}>Disponible</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l) => {
              const falta = l.productoId !== null && pedido(l.productoId) > disponible(l.productoId)
              return (
                <tr key={l.key}>
                  <td>
                    {l.descripcion}
                    {l.productoId === null && <small className="sub">Concepto (sin stock)</small>}
                  </td>
                  <td>
                    <input
                      type="number"
                      min="1"
                      value={l.cantidad}
                      onChange={(e) => cambiar(l.key, { cantidad: parseInt(e.target.value, 10) || 0 })}
                    />
                  </td>
                  <td>
                    <input value={l.precioTxt} onChange={(e) => cambiar(l.key, { precioTxt: e.target.value })} />
                  </td>
                  <td>{moneda(l.cantidad * aCentavos(l.precioTxt))}</td>
                  <td className={falta ? 'txt-rojo' : ''}>
                    {l.productoId === null ? '—' : disponible(l.productoId)}
                    {falta && <div>No alcanza</div>}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="chico gris"
                      onClick={() => setLineas(lineas.filter((x) => x.key !== l.key))}
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      <Campo label="Nota (opcional)">
        <input value={nota} onChange={(e) => setNota(e.target.value)} />
      </Campo>

      <div className="venta-total">
        Total: <b>{moneda(total)}</b>
      </div>

      {error && <div className="error">{error}</div>}
      <div className="pie-modal">
        <button type="button" className="gris" onClick={onClose}>
          Cancelar
        </button>
        <button type="button" disabled={!puede} onClick={guardar}>
          Registrar venta
        </button>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- Detalle

function DetalleVentaModal({
  id,
  onClose,
  onCambio
}: {
  id: number
  onClose: () => void
  onCambio: (mensaje: string) => void
}) {
  const [d, setD] = useState<VentaDetalle | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    window.api
      .detalleVenta(id)
      .then(setD)
      .catch((e: unknown) => setError(msgError(e)))
  }, [id])

  async function anular() {
    if (!d) return
    const aviso =
      d.venta.pago === 'cuenta_corriente'
        ? 'Se devuelve el stock y se descuenta de la deuda de la cuenta.'
        : 'Se devuelve el stock de los productos.'
    if (!window.confirm(`¿Anular la venta #${d.venta.id}?\n\n${aviso}\nQueda registrada como anulada.`)) return
    try {
      await window.api.anularVenta(d.venta.id)
      onCambio(`Venta #${d.venta.id} anulada`)
    } catch (err) {
      setError(msgError(err))
    }
  }

  return (
    <Modal titulo={`Venta #${id}`} onClose={onClose}>
      {error && <div className="error">{error}</div>}
      {d && (
        <>
          <p className="detalle">
            {fechaHora(d.venta.fecha)} · {d.venta.cliente ?? 'Sin cliente'} · {ETIQUETA_PAGO[d.venta.pago]}
            {d.venta.anulada ? ' · ANULADA' : ''}
            {d.venta.nota ? ` · ${d.venta.nota}` : ''}
          </p>
          <table className="tabla sinclick">
            <thead>
              <tr>
                <th>Descripción</th>
                <th>Cantidad</th>
                <th>Precio unit.</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {d.items.map((i) => (
                <tr key={i.id}>
                  <td>{i.descripcion}</td>
                  <td>{i.cantidad}</td>
                  <td>{moneda(i.precio_unitario)}</td>
                  <td>{moneda(i.cantidad * i.precio_unitario)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="venta-total">
            Total: <b>{moneda(d.venta.total)}</b>
          </div>
          <div className="pie-modal">
            <button className="gris" onClick={onClose}>
              Cerrar
            </button>
            {!d.venta.anulada && (
              <button className="peligro" onClick={anular}>
                Anular venta
              </button>
            )}
          </div>
        </>
      )}
    </Modal>
  )
}