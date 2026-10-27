import { useEffect, useState, type FormEvent } from 'react'
import { Campo, Modal } from '../components/ui'
import {
  aCentavos,
  aPesos,
  estadoStock,
  ETIQUETA_ESTADO,
  moneda,
  msgError,
  type Movimiento,
  type Producto,
  type Proveedor
} from '../utils'

type Accion = 'ingreso' | 'baja' | 'conteo'
type ModalAbierto = null | 'nuevo' | 'editar' | 'reposicion' | Accion
type Filtro = 'todos' | 'reponer' | 'sin' | 'ok'

function etiquetaMov(m: Movimiento): string {
  if (m.anula_a) return 'Anulación'
  if (m.origen === 'compra') return 'Ingreso por compra'
  if (m.origen === 'consulta') {
    return m.tipo === 'salida' ? 'Usado en consulta' : 'Devuelto (corrección de consulta)'
  }
  return m.tipo === 'entrada' ? 'Ajuste (suma)' : 'Baja / ajuste (resta)'
}

export default function Stock() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [verArchivados, setVerArchivados] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [categoria, setCategoria] = useState('todas')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [selId, setSelId] = useState<number | null>(null)
  const [movs, setMovs] = useState<Movimiento[]>([])
  const [modal, setModal] = useState<ModalAbierto>(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  async function cargar(sid: number | null = selId, archivados = verArchivados) {
    setProductos(await window.api.listarProductos(archivados))
    if (sid !== null) setMovs(await window.api.listarMovimientos(sid))
  }

  useEffect(() => {
    cargar(selId, verArchivados)
  }, [verArchivados])

  useEffect(() => {
    window.api.listarProveedores(true).then(setProveedores)
  }, [])

  function mostrarAviso(texto: string) {
    setAviso(texto)
    setTimeout(() => setAviso(''), 4000)
  }

  const sel = productos.find((p) => p.id === selId) ?? null
  const activos = productos.filter((p) => p.activo === 1)
  const nSin = activos.filter((p) => estadoStock(p) === 'sin').length
  const nReponer = activos.filter((p) => estadoStock(p) !== 'ok').length
  const valor = activos.reduce((s, p) => s + Math.max(p.stock, 0) * p.precio_costo, 0)
  const categorias = Array.from(new Set(productos.map((p) => p.categoria).filter(Boolean)))

  const visibles = productos.filter((p) => {
    const est = estadoStock(p)
    return (
      (!busqueda || p.nombre.toLowerCase().includes(busqueda.toLowerCase())) &&
      (categoria === 'todas' || p.categoria === categoria) &&
      (filtro === 'todos' ||
        (filtro === 'reponer' && est !== 'ok') ||
        (filtro === 'sin' && est === 'sin') ||
        (filtro === 'ok' && est === 'ok'))
    )
  })

  async function abrir(p: Producto, m: ModalAbierto = null) {
    setSelId(p.id)
    setError('')
    setMovs(await window.api.listarMovimientos(p.id))
    setModal(m)
  }

  async function anular(m: Movimiento) {
    const signo = m.tipo === 'entrada' ? '+' : '-'
    if (
      !window.confirm(
        `¿Anular este movimiento (${signo}${m.cantidad})?\n\nSe registra un movimiento inverso y los dos quedan en el historial.`
      )
    ) {
      return
    }
    try {
      await window.api.anularMovimiento(m.id)
      setError('')
      await cargar()
      mostrarAviso('Movimiento anulado')
    } catch (err) {
      setError(msgError(err))
    }
  }

  async function archivar(activo: boolean) {
    if (!sel) return
    try {
      await window.api.archivarProducto({ id: sel.id, activo })
      setError('')
      if (!activo && !verArchivados) setSelId(null)
      await cargar(activo || verArchivados ? sel.id : null)
      mostrarAviso(activo ? 'Producto restaurado' : 'Producto archivado')
    } catch (err) {
      setError(msgError(err))
    }
  }

  async function eliminar() {
    if (!sel) return
    if (
      !window.confirm(
        `¿Eliminar "${sel.nombre}" definitivamente?\n\nSe borra el producto y todo su historial de movimientos. No se puede deshacer.\n\nSi solo querés sacarlo de la lista y conservar el historial, usá Archivar.`
      )
    ) {
      return
    }
    try {
      await window.api.eliminarProducto(sel.id)
      setError('')
      setSelId(null)
      setMovs([])
      await cargar(null)
      mostrarAviso('Producto eliminado')
    } catch (err) {
      setError(msgError(err))
    }
  }
  async function alGuardar(mensaje: string) {
    setModal(null)
    setError('')
    await cargar()
    mostrarAviso(mensaje)
  }

  return (
    <div className="pagina">
      <div className="cabecera">
        <h1>Stock</h1>
        <div className="cab-acciones">
          <label className="check">
            <input
              type="checkbox"
              checked={verArchivados}
              onChange={(e) => setVerArchivados(e.target.checked)}
            />
            Ver archivados
          </label>
          <button onClick={() => setModal('nuevo')}>+ Nuevo producto</button>
        </div>
      </div>

      <div className="resumen">
        <div className="tarjeta" onClick={() => setFiltro('todos')}>
          <span>Productos activos</span>
          <b>{activos.length}</b>
        </div>
        <div
          className={nReponer > 0 ? 'tarjeta naranja' : 'tarjeta'}
          onClick={() => setFiltro('reponer')}
        >
          <span>Para reponer</span>
          <b>{nReponer}</b>
        </div>
        <div className={nSin > 0 ? 'tarjeta rojo' : 'tarjeta'} onClick={() => setFiltro('sin')}>
          <span>Sin stock</span>
          <b>{nSin}</b>
        </div>
        <div className="tarjeta sinclic">
          <span>Valor del inventario (a costo)</span>
          <b>{moneda(valor)}</b>
        </div>
      </div>

      {nReponer > 0 && (
        <div className="alerta fila-alerta">
          <span>
            {nReponer} {nReponer === 1 ? 'producto necesita' : 'productos necesitan'} reposición.
          </span>
          <button onClick={() => setModal('reposicion')}>Armar pedido por proveedor</button>
        </div>
      )}
      {aviso && <div className="aviso-ok">{aviso}</div>}
      {error && <div className="error">{error}</div>}

      <div className="barra">
        <input
          className="buscar"
          placeholder="Buscar producto..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)}>
          <option value="todos">Todos los estados</option>
          <option value="reponer">Para reponer (bajo o sin stock)</option>
          <option value="sin">Sin stock</option>
          <option value="ok">Stock OK</option>
        </select>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="todas">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className={sel ? 'stock-grid con-panel' : 'stock-grid'}>
        <div>
          <table className="tabla">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Stock</th>
                <th>Estado</th>
                <th title="Cuando el stock llega a este número o menos, se marca para reponer">
                  Mínimo
                </th>
                <th>Valor en stock</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) => {
                const est = estadoStock(p)
                return (
                  <tr
                    key={p.id}
                    className={`${p.id === selId ? 'activo' : ''} ${p.activo ? '' : 'archivado'}`}
                    onClick={() => abrir(p)}
                  >
                    <td>
                      {p.nombre} {!p.activo && <span className="badge gris">Archivado</span>}
                      <small className="sub">
                        {p.categoria}
                        {p.proveedor ? ` · ${p.proveedor}` : ''}
                      </small>
                    </td>
                    <td>
                      <span className="num-stock">{p.stock}</span> {p.unidad}
                    </td>
                    <td>
                      {p.activo === 1 && <span className={`estado ${est}`}>{ETIQUETA_ESTADO[est]}</span>}
                    </td>
                    <td>{p.stock_minimo}</td>
                    <td>{moneda(Math.max(p.stock, 0) * p.precio_costo)}</td>
                    <td className="celda-acciones">
                      {p.activo === 1 && (
                        <>
                          <button
                            className="chico"
                            onClick={(e) => {
                              e.stopPropagation()
                              abrir(p, 'ingreso')
                            }}
                          >
                            + Ingresar
                          </button>
                          <button
                            className="chico gris"
                            onClick={(e) => {
                              e.stopPropagation()
                              abrir(p, 'baja')
                            }}
                          >
                            Baja
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={6} className="vacio">
                    {productos.length === 0
                      ? 'Todavía no hay productos. Usá "+ Nuevo producto".'
                      : 'Ningún producto coincide con los filtros.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {sel && (
          <div className="panel">
            <h2 className="titulo-panel">{sel.nombre}</h2>
            <p className="detalle">
              {sel.categoria} · Proveedor: {sel.proveedor ?? 'sin proveedor'}
              <br />
              Costo {moneda(sel.precio_costo)} · Venta {moneda(sel.precio_venta)}
              <br />
              Se marca para reponer cuando queden {sel.stock_minimo} o menos
            </p>
            <div className="stock-grande">
              {sel.stock} <small>{sel.unidad} en stock</small>{' '}
              {sel.activo === 1 && (
                <span className={`estado ${estadoStock(sel)}`}>{ETIQUETA_ESTADO[estadoStock(sel)]}</span>
              )}
            </div>

            {sel.activo === 1 ? (
              <>
                <div className="acciones">
                  <button onClick={() => setModal('ingreso')}>Ingresar mercadería</button>
                  <button className="sec" onClick={() => setModal('baja')}>
                    Dar de baja
                  </button>
                  <button className="sec" onClick={() => setModal('conteo')}>
                    Corregir por conteo
                  </button>
                </div>
                <small className="ayuda">
                  Ingresar: llegó una compra. Baja: vencido, roto o perdido. Conteo: contaste y el
                  número no coincide.
                </small>
                <div className="acciones">
                  <button className="gris" onClick={() => setModal('editar')}>
                    Editar datos
                  </button>
                  <button className="gris" onClick={() => archivar(false)}>
                    Archivar
                  </button>
                  <button className="peligro" onClick={eliminar}>
                    Eliminar
                  </button>
                </div>
              </>
            ) : (
              <div className="acciones">
                <button onClick={() => archivar(true)}>Restaurar producto</button>
                <button className="peligro" onClick={eliminar}>
                  Eliminar
                </button>
              </div>
            )}

            <h2>Historial de movimientos</h2>
            <table className="tabla sinclick">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Movimiento</th>
                  <th>Detalle</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {movs.map((m) => (
                  <tr key={m.id} className={m.anulado ? 'anulado' : ''}>
                    <td>{new Date(m.fecha).toLocaleString('es-AR')}</td>
                    <td>
                      <b className={m.tipo}>
                        {m.tipo === 'entrada' ? '+' : '−'}
                        {m.cantidad}
                      </b>{' '}
                      {etiquetaMov(m)}
                    </td>
                    <td>
                      {[m.proveedor, m.costo_unitario ? `${moneda(m.costo_unitario)} c/u` : '', m.nota]
                        .filter(Boolean)
                        .join(' · ')}
                      {m.anulado ? ' (anulado)' : ''}
                    </td>
                    <td>
                      {!m.anulado && !m.anula_a && m.origen !== 'consulta' && (
                        <button className="chico gris" onClick={() => anular(m)}>
                          Anular
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {movs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="vacio">
                      Sin movimientos todavía.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal === 'nuevo' && (
        <ProductoModal
          proveedores={proveedores}
          onClose={() => setModal(null)}
          onGuardado={alGuardar}
        />
      )}
      {modal === 'editar' && sel && (
        <ProductoModal
          producto={sel}
          proveedores={proveedores}
          onClose={() => setModal(null)}
          onGuardado={alGuardar}
        />
      )}
      {(modal === 'ingreso' || modal === 'baja' || modal === 'conteo') && sel && (
        <AccionModal
          tipo={modal}
          producto={sel}
          proveedores={proveedores}
          onClose={() => setModal(null)}
          onGuardado={alGuardar}
        />
      )}
      {modal === 'reposicion' && (
        <ReposicionModal
          productos={productos}
          proveedores={proveedores}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Producto

function ProductoModal({
  producto,
  proveedores,
  onClose,
  onGuardado
}: {
  producto?: Producto
  proveedores: Proveedor[]
  onClose: () => void
  onGuardado: (mensaje: string) => void
}) {
  const [f, setF] = useState({
    nombre: producto?.nombre ?? '',
    categoria: producto?.categoria ?? 'Medicamento',
    unidad: producto?.unidad ?? 'unidad',
    proveedorId: producto?.proveedor_id ? String(producto.proveedor_id) : '',
    costo: producto ? aPesos(producto.precio_costo) : '',
    venta: producto ? aPesos(producto.precio_venta) : '',
    minimo: String(producto?.stock_minimo ?? 0),
    inicial: '0'
  })
  const [error, setError] = useState('')

  async function guardar(e: FormEvent) {
    e.preventDefault()
    const base = {
      nombre: f.nombre,
      categoria: f.categoria,
      unidad: f.unidad,
      proveedorId: f.proveedorId ? Number(f.proveedorId) : null,
      precioCosto: aCentavos(f.costo),
      precioVenta: aCentavos(f.venta),
      stockMinimo: parseInt(f.minimo, 10) || 0
    }
    try {
      if (producto) await window.api.editarProducto({ id: producto.id, ...base })
      else await window.api.crearProducto({ ...base, stockInicial: parseInt(f.inicial, 10) || 0 })
      onGuardado(producto ? 'Cambios guardados' : 'Producto creado')
    } catch (err) {
      setError(msgError(err))
    }
  }

  return (
    <Modal titulo={producto ? `Editar: ${producto.nombre}` : 'Nuevo producto'} onClose={onClose}>
      <form onSubmit={guardar}>
        <Campo label="Nombre del producto" ayuda="Ej: Vacuna triple felina, Alimento adulto 15 kg">
          <input required autoFocus value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        </Campo>

        <div className="grid2">
          <Campo label="Categoría">
            <select value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>
              <option>Medicamento</option>
              <option>Alimento</option>
              <option>Insumo</option>
              <option>Otro</option>
            </select>
          </Campo>
          <Campo label="Se cuenta en" ayuda="Elegí de la lista o escribí otra">
            <input list="unidades" value={f.unidad} onChange={(e) => setF({ ...f, unidad: e.target.value })} />
            <datalist id="unidades">
              {['unidad', 'caja', 'frasco', 'blister', 'comprimido', 'ampolla', 'bolsa', 'ml', 'kg'].map(
                (u) => (
                  <option key={u} value={u} />
                )
              )}
            </datalist>
          </Campo>
        </div>

        <Campo label="Proveedor">
          <select value={f.proveedorId} onChange={(e) => setF({ ...f, proveedorId: e.target.value })}>
            <option value="">Sin proveedor</option>
            {proveedores
              .filter((p) => p.activo === 1 || String(p.id) === f.proveedorId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                  {p.activo ? '' : ' (archivado)'}
                </option>
              ))}
          </select>
        </Campo>

        <div className="grid2">
          <Campo label="Precio de costo" ayuda="Lo que te cuesta a vos. Ej: 1500 o 1500,50">
            <input value={f.costo} onChange={(e) => setF({ ...f, costo: e.target.value })} />
          </Campo>
          <Campo label="Precio de venta" ayuda="Lo que cobrás al cliente">
            <input value={f.venta} onChange={(e) => setF({ ...f, venta: e.target.value })} />
          </Campo>
        </div>

        <div className="grid2">
          <Campo
            label="Stock mínimo"
            ayuda="Con esta cantidad o menos el producto aparece en 'Para reponer'"
          >
            <input type="number" min="0" value={f.minimo} onChange={(e) => setF({ ...f, minimo: e.target.value })} />
          </Campo>
          {!producto && (
            <Campo
              label="Cantidad que tenés hoy"
              ayuda="Lo que hay en el estante ahora. Después se modifica con ingresos, bajas o conteo"
            >
              <input type="number" min="0" value={f.inicial} onChange={(e) => setF({ ...f, inicial: e.target.value })} />
            </Campo>
          )}
        </div>

        {producto && (
          <small className="ayuda">
            La cantidad en stock no se cambia desde acá: usá "Ingresar mercadería", "Dar de baja" o
            "Corregir por conteo".
          </small>
        )}
        {error && <div className="error">{error}</div>}
        <div className="pie-modal">
          <button type="button" className="gris" onClick={onClose}>
            Cancelar
          </button>
          <button>{producto ? 'Guardar cambios' : 'Crear producto'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ---------------------------------------------------- Ingreso / baja / conteo

const TEXTOS: Record<Accion, { titulo: string; intro: string; pregunta: string; boton: string }> = {
  ingreso: {
    titulo: 'Ingresar mercadería',
    intro: 'Usalo cuando llega una compra y querés sumar unidades al stock.',
    pregunta: '¿Cuántas unidades llegaron?',
    boton: 'Registrar ingreso'
  },
  baja: {
    titulo: 'Dar de baja',
    intro:
      'Usalo para sacar del stock unidades que no se vendieron ni se usaron en una consulta: vencidas, rotas o perdidas.',
    pregunta: '¿Cuántas unidades salen del stock?',
    boton: 'Registrar baja'
  },
  conteo: {
    titulo: 'Corregir por conteo',
    intro:
      'Contá lo que hay físicamente y escribí ese número. El sistema calcula la diferencia y la registra como ajuste.',
    pregunta: '¿Cuántas unidades contaste?',
    boton: 'Corregir stock'
  }
}

function AccionModal({
  tipo,
  producto,
  proveedores,
  onClose,
  onGuardado
}: {
  tipo: Accion
  producto: Producto
  proveedores: Proveedor[]
  onClose: () => void
  onGuardado: (mensaje: string) => void
}) {
  const t = TEXTOS[tipo]
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('Vencido')
  const [nota, setNota] = useState('')
  const [proveedorId, setProveedorId] = useState(
    producto.proveedor_id ? String(producto.proveedor_id) : ''
  )
  const [costo, setCosto] = useState(producto.precio_costo > 0 ? aPesos(producto.precio_costo) : '')
  const [actualizarCosto, setActualizarCosto] = useState(true)
  const [error, setError] = useState('')

  const n = parseInt(cantidad, 10)
  const valido = Number.isInteger(n) && (tipo === 'conteo' ? n >= 0 : n > 0)
  const actual = producto.stock
  const nuevo = !valido ? null : tipo === 'ingreso' ? actual + n : tipo === 'baja' ? actual - n : n
  const dif = nuevo === null ? 0 : nuevo - actual
  const costoCent = aCentavos(costo)
  const cambiaCosto = tipo === 'ingreso' && costoCent > 0 && costoCent !== producto.precio_costo

  async function guardar(e: FormEvent) {
    e.preventDefault()
    try {
      if (tipo === 'conteo') {
        await window.api.conteoStock({ productoId: producto.id, cantidadReal: n, nota })
      } else {
        await window.api.registrarMovimiento({
          productoId: producto.id,
          tipo: tipo === 'ingreso' ? 'entrada' : 'salida',
          origen: tipo === 'ingreso' ? 'compra' : 'ajuste',
          cantidad: n,
          proveedorId: tipo === 'ingreso' && proveedorId ? Number(proveedorId) : null,
          costoUnitario: tipo === 'ingreso' && costoCent > 0 ? costoCent : null,
          actualizarCosto: cambiaCosto && actualizarCosto,
          nota: tipo === 'baja' ? [motivo, nota].filter(Boolean).join(' – ') : nota
        })
      }
      onGuardado(`${t.titulo}: ${producto.nombre} (${actual} → ${nuevo} ${producto.unidad})`)
    } catch (err) {
      setError(msgError(err))
    }
  }

  return (
    <Modal titulo={`${t.titulo}: ${producto.nombre}`} onClose={onClose}>
      <form onSubmit={guardar}>
        <div className="intro">{t.intro}</div>
        <p className="detalle">
          Stock actual en el sistema:{' '}
          <b>
            {actual} {producto.unidad}
          </b>
        </p>

        <Campo label={t.pregunta}>
          <input
            required
            autoFocus
            type="number"
            min={tipo === 'conteo' ? 0 : 1}
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
          />
        </Campo>

        {tipo === 'ingreso' && (
          <>
            <div className="grid2">
              <Campo label="Proveedor" ayuda="Queda registrado en su historial de compras">
                <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
                  <option value="">Sin proveedor</option>
                  {proveedores
                    .filter((p) => p.activo === 1 || String(p.id) === proveedorId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                </select>
              </Campo>
              <Campo label="Costo por unidad (opcional)" ayuda="Lo que pagaste por cada una">
                <input value={costo} onChange={(e) => setCosto(e.target.value)} />
              </Campo>
            </div>
            {cambiaCosto && (
              <label className="check bloque">
                <input
                  type="checkbox"
                  checked={actualizarCosto}
                  onChange={(e) => setActualizarCosto(e.target.checked)}
                />
                Actualizar el precio de costo del producto (hoy: {moneda(producto.precio_costo)})
              </label>
            )}
          </>
        )}

        {tipo === 'baja' && (
          <Campo label="Motivo">
            <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              <option>Vencido</option>
              <option>Roto o dañado</option>
              <option>Perdido</option>
              <option>Uso interno</option>
              <option>Otro</option>
            </select>
          </Campo>
        )}

        <Campo
          label="Detalle (opcional)"
          ayuda={tipo === 'ingreso' ? 'Ej: número de remito o factura' : 'Ej: lote, quién lo detectó'}
        >
          <input value={nota} onChange={(e) => setNota(e.target.value)} />
        </Campo>

        {nuevo !== null && (
          <div className={nuevo < 0 ? 'vista-previa mal' : 'vista-previa'}>
            {nuevo < 0
              ? `No alcanza: hay ${actual} y querés sacar ${n}`
              : tipo === 'conteo' && dif === 0
                ? 'El sistema ya coincide con lo que contaste'
                : `Stock: ${actual} → ${nuevo} ${producto.unidad}${tipo === 'conteo' ? ` (ajuste de ${dif > 0 ? '+' : ''}${dif})` : ''}`}
            {tipo === 'ingreso' && costoCent > 0 && nuevo >= 0 && (
              <div>Total de la compra: {moneda(n * costoCent)}</div>
            )}
          </div>
        )}

        {error && <div className="error">{error}</div>}
        <div className="pie-modal">
          <button type="button" className="gris" onClick={onClose}>
            Cancelar
          </button>
          <button disabled={nuevo === null || nuevo < 0}>{t.boton}</button>
        </div>
      </form>
    </Modal>
  )
}

// ------------------------------------------------------ Lista de reposición

function ReposicionModal({
  productos,
  proveedores,
  onClose
}: {
  productos: Producto[]
  proveedores: Proveedor[]
  onClose: () => void
}) {
  const lista = productos.filter((p) => p.activo === 1 && estadoStock(p) !== 'ok')
  const [cant, setCant] = useState<Record<number, string>>(() =>
    Object.fromEntries(lista.map((p) => [p.id, String(Math.max(p.stock_minimo * 2 - p.stock, 1))]))
  )
  const [copiado, setCopiado] = useState<number | null>(null)

  const grupos = new Map<number, Producto[]>()
  for (const p of lista) {
    const k = p.proveedor_id ?? 0
    grupos.set(k, [...(grupos.get(k) ?? []), p])
  }

  async function copiar(id: number, prov: Proveedor | undefined, items: Producto[]) {
    const lineas = items
      .map((p) => ({ p, n: parseInt(cant[p.id] ?? '', 10) }))
      .filter((x) => x.n > 0)
      .map((x) => `- ${x.n} ${x.p.unidad} de ${x.p.nombre}`)
    if (lineas.length === 0) return
    const txt = `Hola${prov ? ' ' + prov.nombre : ''}, quisiera hacer este pedido:\n${lineas.join('\n')}`
    try {
      await navigator.clipboard.writeText(txt)
      setCopiado(id)
    } catch {
      setCopiado(null)
    }
  }

  return (
    <Modal titulo="Pedido de reposición" onClose={onClose}>
      <div className="intro">
        Productos con stock bajo o agotado, agrupados por proveedor. La cantidad sugerida repone hasta
        el doble del mínimo; podés cambiarla. "Copiar pedido" deja el texto listo para pegar en
        WhatsApp o mail.
      </div>
      {lista.length === 0 && <p className="vacio">No hay nada para reponer.</p>}
      {Array.from(grupos.entries()).map(([id, items]) => {
        const prov = proveedores.find((x) => x.id === id)
        return (
          <div className="grupo-pedido" key={id}>
            <div className="cabecera">
              <div>
                <b>{prov ? prov.nombre : 'Sin proveedor asignado'}</b>
                {prov && (prov.telefono || prov.email) && (
                  <small className="sub">{[prov.telefono, prov.email].filter(Boolean).join(' · ')}</small>
                )}
              </div>
              <button className="chico" onClick={() => copiar(id, prov, items)}>
                {copiado === id ? 'Copiado ✓' : 'Copiar pedido'}
              </button>
            </div>
            <table className="tabla sinclick">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Stock</th>
                  <th>Mínimo</th>
                  <th>Pedir</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id}>
                    <td>{p.nombre}</td>
                    <td>
                      {p.stock} <span className={`estado ${estadoStock(p)}`}>{ETIQUETA_ESTADO[estadoStock(p)]}</span>
                    </td>
                    <td>{p.stock_minimo}</td>
                    <td>
                      <input
                        className="cant-pedido"
                        type="number"
                        min="0"
                        value={cant[p.id] ?? ''}
                        onChange={(e) => setCant({ ...cant, [p.id]: e.target.value })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
      <div className="pie-modal">
        <button className="gris" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </Modal>
  )
}