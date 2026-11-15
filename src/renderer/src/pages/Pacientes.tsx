import { useEffect, useState } from 'react'
import ConsultaModal from '../components/ConsultaModal'
import EliminarModal from '../components/EliminarModal'
import PacienteModal from '../components/PacienteModal'
import { Miniatura, VisorImagen } from '../components/Imagenes'
import {
  edadTexto,
  fechaHora,
  fechaLarga,
  kg,
  msgError,
  plural,
  type Consulta,
  type Elegida,
  type ImagenPaciente,
  type Paciente,
  type Producto
} from '../utils'

type Modales = null | 'nuevoPaciente' | 'editarPaciente' | 'nuevaConsulta' | 'eliminarPaciente'

export default function Pacientes() {
  const [q, setQ] = useState('')
  const [pacientes, setPacientes] = useState<Paciente[]>([])
  const [sel, setSel] = useState<Paciente | null>(null)
  const [consultas, setConsultas] = useState<Consulta[]>([])
  const [imagenes, setImagenes] = useState<ImagenPaciente[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [tab, setTab] = useState<'historia' | 'imagenes'>('historia')
  const [filtro, setFiltro] = useState('')
  const [abiertas, setAbiertas] = useState<Set<number>>(new Set())
  const [modal, setModal] = useState<Modales>(null)
  const [editandoConsulta, setEditandoConsulta] = useState<Consulta | null>(null)
  const [visor, setVisor] = useState<{ id: number; nombre: string } | null>(null)
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState('')

  const listar = (texto = q) => window.api.listarPacientes(texto).then(setPacientes)

  useEffect(() => {
    window.api.listarPacientes(q).then(setPacientes)
  }, [q])

  useEffect(() => {
    window.api.listarProductos().then(setProductos)
  }, [])

  function mostrarAviso(texto: string) {
    setAviso(texto)
    setTimeout(() => setAviso(''), 4000)
  }

  async function cargarFicha(p: Paciente, abrirPrimera = false) {
    const [cs, ims] = await Promise.all([
      window.api.listarConsultas(p.id),
      window.api.imagenesPaciente(p.id)
    ])
    setConsultas(cs)
    setImagenes(ims)
    if (abrirPrimera) setAbiertas(new Set(cs.length > 0 ? [cs[0].id] : []))
  }

  async function elegir(p: Paciente) {
    setSel(p)
    setTab('historia')
    setFiltro('')
    setError('')
    await cargarFicha(p, true)
  }

  function alternar(id: number) {
    setAbiertas((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  async function alGuardarPaciente(id: number) {
    setModal(null)
    const lista: Paciente[] = await window.api.listarPacientes('')
    setQ('')
    setPacientes(lista)
    const p = lista.find((x) => x.id === id)
    if (p) await elegir(p)
    mostrarAviso('Paciente guardado')
  }

  async function alGuardarConsulta(mensaje: string, esNueva: boolean) {
    if (!sel) return
    setModal(null)
    setEditandoConsulta(null)
    await cargarFicha(sel, esNueva)
    setProductos(await window.api.listarProductos())
    listar()
    mostrarAviso(mensaje)
  }

  async function agregarImagenes() {
    if (!sel) return
    try {
      const elegidas: Elegida[] = await window.api.elegirImagenes()
      if (elegidas.length === 0) return
      await window.api.agregarImagenes({ pacienteId: sel.id, rutas: elegidas.map((e) => e.ruta) })
      await cargarFicha(sel)
      setError('')
      mostrarAviso(plural(elegidas.length, 'imagen agregada', 'imágenes agregadas'))
    } catch (err) {
      setError(msgError(err))
    }
  }

  async function eliminarImagen(a: ImagenPaciente) {
    if (
      !window.confirm(
        `¿Eliminar la imagen "${a.nombre}"?\n\nSe borra del historial y de la carpeta de la app. No se puede deshacer.`
      )
    ) {
      return
    }
    try {
      await window.api.eliminarImagen(a.id)
      if (sel) await cargarFicha(sel)
      mostrarAviso('Imagen eliminada')
    } catch (err) {
      setError(msgError(err))
    }
  }

  async function eliminarConsulta(c: Consulta) {
    if (!sel) return
    const detalle: string[] = []
    if (c.productos.length > 0) {
      detalle.push(`el stock de ${plural(c.productos.length, 'producto', 'productos')} vuelve a su lugar`)
    }
    if (c.adjuntos.length > 0) {
      detalle.push(`se ${c.adjuntos.length === 1 ? 'borra 1 imagen' : `borran ${c.adjuntos.length} imágenes`}`)
    }
    const cuerpo = detalle.length > 0 ? `Al eliminarla: ${detalle.join(' y ')}.\n\n` : ''
    if (
      !window.confirm(
        `¿Eliminar la consulta del ${fechaLarga(c.fecha)} (${c.motivo})?\n\n${cuerpo}No se puede deshacer.`
      )
    ) {
      return
    }
    try {
      await window.api.eliminarConsulta(c.id)
      setError('')
      await cargarFicha(sel)
      setProductos(await window.api.listarProductos())
      listar()
      mostrarAviso('Consulta eliminada')
    } catch (err) {
      setError(msgError(err))
    }
  }

  async function eliminarPaciente() {
    if (!sel) return
    await window.api.eliminarPaciente(sel.id)
    setModal(null)
    setSel(null)
    setConsultas([])
    setImagenes([])
    await listar()
    setProductos(await window.api.listarProductos())
    mostrarAviso('Paciente eliminado')
  }

  const t = filtro.trim().toLowerCase()
  const visibles = !t
    ? consultas
    : consultas.filter((c) =>
        [c.motivo, c.diagnostico, c.tratamiento, ...c.productos.map((p) => p.nombre)].some((x) =>
          (x ?? '').toLowerCase().includes(t)
        )
      )
  const conPeso = consultas.find((c) => c.peso_kg != null)

  return (
    <div className="pacientes">
      <aside>
        <div className="cabecera">
          <h2>Pacientes</h2>
          <button className="chico" onClick={() => setModal('nuevoPaciente')}>
            + Nuevo
          </button>
        </div>
        <input
          placeholder="Buscar paciente o dueño..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <ul className="lista">
          {pacientes.map((p) => (
            <li key={p.id} className={sel?.id === p.id ? 'activo' : ''} onClick={() => elegir(p)}>
              <strong>{p.nombre}</strong>{' '}
              <small>
                {p.especie}
                {p.raza ? ` · ${p.raza}` : ''}
              </small>
              <small className="sub">
                {p.propietario}
                {p.ultima_consulta
                  ? ` · última visita ${new Date(p.ultima_consulta).toLocaleDateString('es-AR')}`
                  : ''}
              </small>
            </li>
          ))}
          {pacientes.length === 0 && (
            <li className="vacio">{q ? 'Sin resultados' : 'Todavía no hay pacientes. Usá "+ Nuevo".'}</li>
          )}
        </ul>
      </aside>

      <main>
        {aviso && <div className="aviso-ok">{aviso}</div>}
        {error && <div className="error">{error}</div>}

        {!sel ? (
          <p className="vacio">Elegí un paciente para ver su historia clínica.</p>
        ) : (
          <>
            <div className="ficha-pac">
              <div className="cabecera">
                <h1>{sel.nombre}</h1>
                <div className="acciones">
                  <button onClick={() => setModal('nuevaConsulta')}>+ Nueva consulta</button>
                  <button className="gris" onClick={() => setModal('editarPaciente')}>
                    Editar paciente y dueño
                  </button>
                  <button className="peligro" onClick={() => setModal('eliminarPaciente')}>
                    Eliminar paciente
                  </button>
                </div>
              </div>

              <div className="ficha-datos">
                <div><span>Dueño</span><b>{sel.propietario}</b></div>
                <div><span>Teléfono</span><b>{sel.telefono || '—'}</b></div>
                <div><span>Dirección</span><b>{sel.direccion || '—'}</b></div>
                <div>
                  <span>Especie y raza</span>
                  <b>{sel.especie}{sel.raza ? ` · ${sel.raza}` : ''}</b>
                </div>
                <div><span>Sexo</span><b>{sel.sexo || '—'}</b></div>
                <div><span>Edad</span><b>{edadTexto(sel.nacimiento)}</b></div>
                <div><span>Alimentación</span><b>{sel.alimentacion || '—'}</b></div>
              </div>

              <div className="stats">
                <div className="stat">
                  <span>Consultas</span>
                  <b>{consultas.length}</b>
                </div>
                <div className="stat">
                  <span>Última visita</span>
                  <b>{consultas[0] ? fechaLarga(consultas[0].fecha) : '—'}</b>
                </div>
                <div className="stat">
                  <span>Último peso registrado</span>
                  <b>{conPeso?.peso_kg != null ? kg(conPeso.peso_kg) : '—'}</b>
                </div>
                <div className="stat">
                  <span>Imágenes</span>
                  <b>{imagenes.length}</b>
                </div>
              </div>
            </div>

            <div className="tabs-int">
              <button className={tab === 'historia' ? 'tab-int activo' : 'tab-int'} onClick={() => setTab('historia')}>
                Historia clínica ({consultas.length})
              </button>
              <button className={tab === 'imagenes' ? 'tab-int activo' : 'tab-int'} onClick={() => setTab('imagenes')}>
                Imágenes ({imagenes.length})
              </button>
            </div>

            {tab === 'historia' && (
              <>
                {consultas.length > 0 && (
                  <input
                    placeholder="Buscar en la historia (motivo, diagnóstico, tratamiento, medicamento)..."
                    value={filtro}
                    onChange={(e) => setFiltro(e.target.value)}
                  />
                )}

                {visibles.map((c) => {
                  const abierta = abiertas.has(c.id)
                  const sinDetalle =
                    !c.diagnostico && !c.tratamiento && c.productos.length === 0 && c.adjuntos.length === 0
                  return (
                    <div className="cons-card" key={c.id}>
                      <div className="cons-cab" onClick={() => alternar(c.id)}>
                        <div>
                          <span className="cons-fecha">
                            {fechaLarga(c.fecha)}
                            {c.modificada && ` · editada el ${fechaHora(c.modificada)}`}
                          </span>
                          <div className="cons-motivo">{c.motivo}</div>
                          <div className="chips">
                            {c.peso_kg != null && <span className="chip-dato">{kg(c.peso_kg)}</span>}
                            {c.temperatura != null && (
                              <span className="chip-dato">{c.temperatura.toLocaleString('es-AR')} °C</span>
                            )}
                            {c.productos.length > 0 && (
                              <span className="chip-dato">
                                {plural(c.productos.length, 'medicamento', 'medicamentos')}
                              </span>
                            )}
                            {c.adjuntos.length > 0 && (
                              <span className="chip-dato">{plural(c.adjuntos.length, 'imagen', 'imágenes')}</span>
                            )}
                          </div>
                        </div>
                        <div className="acciones">
                          <button
                            className="chico gris"
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditandoConsulta(c)
                            }}
                          >
                            Editar
                          </button>
                          <button
                            className="chico peligro"
                            onClick={(e) => {
                              e.stopPropagation()
                              eliminarConsulta(c)
                            }}
                          >
                            Eliminar
                          </button>
                          <span>{abierta ? '▾' : '▸'}</span>
                        </div>
                      </div>

                      {abierta && (
                        <div className="cons-cuerpo">
                          {sinDetalle && <p className="vacio">Sin más datos cargados en esta consulta.</p>}
                          {c.diagnostico && (
                            <>
                              <h3>Diagnóstico</h3>
                              <p className="texto-libre">{c.diagnostico}</p>
                            </>
                          )}
                          {c.tratamiento && (
                            <>
                              <h3>Tratamiento e indicaciones</h3>
                              <p className="texto-libre">{c.tratamiento}</p>
                            </>
                          )}
                          {c.productos.length > 0 && (
                            <>
                              <h3>Medicamentos y productos usados</h3>
                              <table className="tabla sinclick">
                                <thead>
                                  <tr>
                                    <th>Producto</th>
                                    <th>Cantidad</th>
                                    <th>Indicación / dosis</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {c.productos.map((p) => (
                                    <tr key={p.productoId}>
                                      <td>{p.nombre}</td>
                                      <td>
                                        {p.cantidad} {p.unidad}
                                      </td>
                                      <td>{p.indicacion || '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </>
                          )}
                          {c.adjuntos.length > 0 && (
                            <>
                              <h3>Imágenes</h3>
                              <div className="thumbs">
                                {c.adjuntos.map((a) => (
                                  <Miniatura
                                    key={a.id}
                                    src={a.miniatura}
                                    titulo={a.nombre}
                                    onVer={() => setVisor({ id: a.id, nombre: a.nombre })}
                                  />
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
                {consultas.length === 0 && (
                  <p className="vacio">Todavía no hay consultas. Usá "+ Nueva consulta".</p>
                )}
                {consultas.length > 0 && visibles.length === 0 && (
                  <p className="vacio">Ninguna consulta coincide con la búsqueda.</p>
                )}
              </>
            )}

            {tab === 'imagenes' && (
              <>
                <div className="cabecera">
                  <small className="ayuda">
                    Acá están todas las imágenes del paciente, las de las consultas y las que agregues
                    sueltas (estudios, fotos, radiografías).
                  </small>
                  <button onClick={agregarImagenes}>+ Agregar imágenes</button>
                </div>
                <div className="thumbs">
                  {imagenes.map((a) => (
                    <Miniatura
                      key={a.id}
                      src={a.miniatura}
                      titulo={a.nombre}
                      pie={
                        a.consulta_id
                          ? `${new Date(a.fecha_consulta ?? a.fecha).toLocaleDateString('es-AR')} · ${a.motivo ?? ''}`
                          : `${new Date(a.fecha).toLocaleDateString('es-AR')} · sin consulta`
                      }
                      onVer={() => setVisor({ id: a.id, nombre: a.nombre })}
                      onQuitar={() => eliminarImagen(a)}
                      textoQuitar="Eliminar"
                    />
                  ))}
                </div>
                {imagenes.length === 0 && <p className="vacio">Este paciente todavía no tiene imágenes.</p>}
              </>
            )}
          </>
        )}
      </main>

      {modal === 'nuevoPaciente' && (
        <PacienteModal onClose={() => setModal(null)} onGuardado={alGuardarPaciente} />
      )}
      {modal === 'editarPaciente' && sel && (
        <PacienteModal paciente={sel} onClose={() => setModal(null)} onGuardado={alGuardarPaciente} />
      )}
      {(modal === 'nuevaConsulta' || editandoConsulta) && sel && (
        <ConsultaModal
          pacienteId={sel.id}
          consulta={editandoConsulta ?? undefined}
          productos={productos}
          onClose={() => {
            setModal(null)
            setEditandoConsulta(null)
          }}
          onGuardado={alGuardarConsulta}
        />
      )}
      {modal === 'eliminarPaciente' && sel && (
        <EliminarModal
          titulo={`Eliminar a ${sel.nombre}`}
          palabra={sel.nombre}
          onClose={() => setModal(null)}
          onConfirmar={eliminarPaciente}
        >
          <p>
            Vas a eliminar a <b>{sel.nombre}</b> y todo su historial:
          </p>
          <ul>
            <li>
              {plural(consultas.length, 'consulta', 'consultas')} (el stock de los medicamentos usados
              vuelve a su lugar)
            </li>
            <li>{plural(imagenes.length, 'imagen', 'imágenes')}</li>
            <li>El dueño ({sel.propietario}) se conserva si tiene otras mascotas</li>
          </ul>
          <p>
            <b>No se puede deshacer.</b>
          </p>
        </EliminarModal>
      )}
      {visor && <VisorImagen id={visor.id} nombre={visor.nombre} onClose={() => setVisor(null)} />}
    </div>
  )
}