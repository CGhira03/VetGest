import { useEffect, useState, type FormEvent } from 'react'
import { Campo, Modal } from '../components/ui'
import {
  estadoStock,
  ETIQUETA_ESTADO,
  moneda,
  msgError,
  type DetalleProveedor,
  type Producto,
  type Proveedor
} from '../utils'

export default function Proveedores() {
  const [lista, setLista] = useState<Proveedor[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [verArchivados, setVerArchivados] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [selId, setSelId] = useState<number | null>(null)
  const [detalle, setDetalle] = useState<DetalleProveedor | null>(null)
  const [editando, setEditando] = useState<Proveedor | 'nuevo' | null>(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  async function cargar() {
    setLista(await window.api.listarProveedores(verArchivados))
    setProductos(await window.api.listarProductos())
  }

  useEffect(() => {
    cargar()
  }, [verArchivados])

  useEffect(() => {
    if (selId === null) {
      setDetalle(null)
      return
    }
    window.api.detalleProveedor(selId).then(setDetalle)
  }, [selId, lista])

  function mostrarAviso(texto: string) {
    setAviso(texto)
    setTimeout(() => setAviso(''), 4000)
  }

  const sel = lista.find((p) => p.id === selId) ?? null
  const q = busqueda.toLowerCase()
  const visibles = lista.filter(
    (p) =>
      !q ||
      p.nombre.toLowerCase().includes(q) ||
      (p.contacto ?? '').toLowerCase().includes(q) ||
      (p.cuit ?? '').includes(q)
  )
  const paraReponer = (id: number) =>
    productos.filter((p) => p.proveedor_id === id && estadoStock(p) !== 'ok').length
  const totalComprado = (detalle?.compras ?? [])
    .filter((c) => !c.anulado)
    .reduce((s, c) => s + c.cantidad * (c.costo_unitario ?? 0), 0)

  async function archivar(p: Proveedor, activo: boolean) {
    if (
      !activo &&
      !window.confirm(
        `¿Archivar a ${p.nombre}?\n\nSus productos y su historial de compras se conservan, y podés restaurarlo cuando quieras.`
      )
    ) {
      return
    }
    try {
      await window.api.archivarProveedor({ id: p.id, activo })
      setError('')
      if (!activo && !verArchivados) setSelId(null)
      await cargar()
      mostrarAviso(activo ? 'Proveedor restaurado' : 'Proveedor archivado')
    } catch (err) {
      setError(msgError(err))
    }
  }

  async function eliminar(p: Proveedor) {
    const aviso =
      p.productos > 0 ? `\n\nSus ${p.productos} productos quedan sin proveedor asignado.` : ''
    if (
      !window.confirm(
        `¿Eliminar a ${p.nombre} definitivamente?${aviso}\n\nNo se puede deshacer. Si solo querés dejar de usarlo, archivalo.`
      )
    ) {
      return
    }
    try {
      await window.api.eliminarProveedor(p.id)
      setError('')
      setSelId(null)
      await cargar()
      mostrarAviso('Proveedor eliminado')
    } catch (err) {
      setError(msgError(err))
    }
  }
  async function alGuardar(id: number | null) {
    setEditando(null)
    if (id !== null) setSelId(id)
    await cargar()
    mostrarAviso(id !== null ? 'Proveedor creado' : 'Cambios guardados')
  }

  const dato = (v: string | null) => (v && v.trim() ? v : '—')

  return (
    <div className="pagina">
      <div className="cabecera">
        <h1>Proveedores</h1>
        <div className="cab-acciones">
          <label className="check">
            <input
              type="checkbox"
              checked={verArchivados}
              onChange={(e) => setVerArchivados(e.target.checked)}
            />
            Ver archivados
          </label>
          <button onClick={() => setEditando('nuevo')}>+ Nuevo proveedor</button>
        </div>
      </div>

      {aviso && <div className="aviso-ok">{aviso}</div>}
      {error && <div className="error">{error}</div>}

      <div className="prov-grid">
        <div>
          <input
            placeholder="Buscar por nombre, contacto o CUIT..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <ul className="lista alta">
            {visibles.map((p) => {
              const n = paraReponer(p.id)
              return (
                <li
                  key={p.id}
                  className={`${p.id === selId ? 'activo' : ''} ${p.activo ? '' : 'archivado'}`}
                  onClick={() => setSelId(p.id)}
                >
                  <strong>{p.nombre}</strong>{' '}
                  {!p.activo && <span className="badge gris">Archivado</span>}
                  <small className="sub">
                    {[p.contacto, p.telefono].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                  </small>
                  <small className="sub">
                    {p.productos} {p.productos === 1 ? 'producto' : 'productos'}
                    {n > 0 && <span className="estado bajo chip">{n} para reponer</span>}
                  </small>
                </li>
              )
            })}
            {visibles.length === 0 && (
              <li className="vacio">
                {lista.length === 0 ? 'Todavía no hay proveedores.' : 'Sin resultados.'}
              </li>
            )}
          </ul>
        </div>

        <div>
          {!sel ? (
            <p className="vacio">Elegí un proveedor para ver su ficha, sus productos y sus compras.</p>
          ) : (
            <>
              <div className="panel">
                <div className="cabecera">
                  <h2 className="titulo-panel">
                    {sel.nombre} {!sel.activo && <span className="badge gris">Archivado</span>}
                  </h2>
                  <div className="acciones">
                    <button onClick={() => setEditando(sel)}>Editar</button>
                    <button className="gris" onClick={() => archivar(sel, !sel.activo)}>
                      {sel.activo ? 'Archivar' : 'Restaurar'}
                    </button>
                    <button className="peligro" onClick={() => eliminar(sel)}>
                      Eliminar
                    </button>
                  </div>
                </div>
                <dl className="ficha">
                  <dt>Contacto</dt>
                  <dd>{dato(sel.contacto)}</dd>
                  <dt>Teléfono</dt>
                  <dd>{dato(sel.telefono)}</dd>
                  <dt>Email</dt>
                  <dd>{dato(sel.email)}</dd>
                  <dt>Dirección</dt>
                  <dd>{dato(sel.direccion)}</dd>
                  <dt>CUIT</dt>
                  <dd>{dato(sel.cuit)}</dd>
                  <dt>Condiciones de pago</dt>
                  <dd>{dato(sel.condiciones)}</dd>
                  <dt>Notas</dt>
                  <dd>{dato(sel.notas)}</dd>
                </dl>
              </div>

              <div className="panel">
                <h2 className="titulo-panel">Productos que provee</h2>
                <table className="tabla sinclick">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Stock</th>
                      <th>Estado</th>
                      <th>Costo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle?.productos.map((p) => {
                      const est = estadoStock(p)
                      return (
                        <tr key={p.id}>
                          <td>{p.nombre}</td>
                          <td>
                            {p.stock} {p.unidad}
                          </td>
                          <td>
                            <span className={`estado ${est}`}>{ETIQUETA_ESTADO[est]}</span>
                          </td>
                          <td>{moneda(p.precio_costo)}</td>
                        </tr>
                      )
                    })}
                    {detalle && detalle.productos.length === 0 && (
                      <tr>
                        <td colSpan={4} className="vacio">
                          Ningún producto asociado. Se asigna desde Stock → Editar datos del producto.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="panel">
                <h2 className="titulo-panel">
                  Compras registradas{' '}
                  {totalComprado > 0 && <small className="detalle">· Total: {moneda(totalComprado)}</small>}
                </h2>
                <table className="tabla sinclick">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Producto</th>
                      <th>Cantidad</th>
                      <th>Costo c/u</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle?.compras.map((c) => (
                      <tr key={c.id} className={c.anulado ? 'anulado' : ''}>
                        <td>{new Date(c.fecha).toLocaleDateString('es-AR')}</td>
                        <td>
                          {c.producto}
                          {c.nota && <small className="sub">{c.nota}</small>}
                        </td>
                        <td>{c.cantidad}</td>
                        <td>{c.costo_unitario ? moneda(c.costo_unitario) : '—'}</td>
                        <td>{c.costo_unitario ? moneda(c.cantidad * c.costo_unitario) : '—'}</td>
                      </tr>
                    ))}
                    {detalle && detalle.compras.length === 0 && (
                      <tr>
                        <td colSpan={5} className="vacio">
                          Sin compras registradas. Se cargan desde Stock → Ingresar mercadería,
                          eligiendo a este proveedor.
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

      {editando && (
        <ProveedorModal
          proveedor={editando === 'nuevo' ? undefined : editando}
          onClose={() => setEditando(null)}
          onGuardado={alGuardar}
        />
      )}
    </div>
  )
}

function ProveedorModal({
  proveedor,
  onClose,
  onGuardado
}: {
  proveedor?: Proveedor
  onClose: () => void
  onGuardado: (idNuevo: number | null) => void
}) {
  const [f, setF] = useState({
    nombre: proveedor?.nombre ?? '',
    contacto: proveedor?.contacto ?? '',
    cuit: proveedor?.cuit ?? '',
    telefono: proveedor?.telefono ?? '',
    email: proveedor?.email ?? '',
    direccion: proveedor?.direccion ?? '',
    condiciones: proveedor?.condiciones ?? '',
    notas: proveedor?.notas ?? ''
  })
  const [error, setError] = useState('')

  async function guardar(e: FormEvent) {
    e.preventDefault()
    try {
      if (proveedor) {
        await window.api.editarProveedor({ id: proveedor.id, ...f })
        onGuardado(null)
      } else {
        const id: number = await window.api.crearProveedor(f)
        onGuardado(id)
      }
    } catch (err) {
      setError(msgError(err))
    }
  }

  return (
    <Modal titulo={proveedor ? `Editar: ${proveedor.nombre}` : 'Nuevo proveedor'} onClose={onClose}>
      <form onSubmit={guardar}>
        <Campo label="Nombre o razón social">
          <input required autoFocus value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        </Campo>
        <div className="grid2">
          <Campo label="Persona de contacto" ayuda="Con quién hablás cuando hacés un pedido">
            <input value={f.contacto} onChange={(e) => setF({ ...f, contacto: e.target.value })} />
          </Campo>
          <Campo label="Teléfono / WhatsApp">
            <input value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} />
          </Campo>
        </div>
        <div className="grid2">
          <Campo label="Email">
            <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Campo>
          <Campo label="CUIT">
            <input value={f.cuit} onChange={(e) => setF({ ...f, cuit: e.target.value })} />
          </Campo>
        </div>
        <Campo label="Dirección">
          <input value={f.direccion} onChange={(e) => setF({ ...f, direccion: e.target.value })} />
        </Campo>
        <Campo label="Condiciones de pago" ayuda="Ej: contado, 30 días, cuenta corriente">
          <input value={f.condiciones} onChange={(e) => setF({ ...f, condiciones: e.target.value })} />
        </Campo>
        <Campo label="Notas" ayuda="Días de entrega, pedido mínimo, descuentos, etc.">
          <textarea value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} />
        </Campo>
        {error && <div className="error">{error}</div>}
        <div className="pie-modal">
          <button type="button" className="gris" onClick={onClose}>
            Cancelar
          </button>
          <button>{proveedor ? 'Guardar cambios' : 'Crear proveedor'}</button>
        </div>
      </form>
    </Modal>
  )
}