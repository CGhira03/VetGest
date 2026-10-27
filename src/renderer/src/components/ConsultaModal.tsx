import { useState, type FormEvent } from 'react'
import { Campo, Modal } from './ui'
import Medicamentos, { type Usado } from './Medicamentos'
import { SelectorImagenes } from './Imagenes'
import { fechaLarga, msgError, type Consulta, type Elegida, type Producto } from '../utils'

export default function ConsultaModal({
  pacienteId,
  consulta,
  productos,
  onClose,
  onGuardado
}: {
  pacienteId: number
  consulta?: Consulta
  productos: Producto[]
  onClose: () => void
  onGuardado: (mensaje: string, esNueva: boolean) => void
}) {
  const [f, setF] = useState({
    motivo: consulta?.motivo ?? '',
    peso: consulta?.peso_kg != null ? String(consulta.peso_kg).replace('.', ',') : '',
    temp: consulta?.temperatura != null ? String(consulta.temperatura).replace('.', ',') : '',
    diagnostico: consulta?.diagnostico ?? '',
    tratamiento: consulta?.tratamiento ?? ''
  })
  const [usados, setUsados] = useState<Usado[]>(() =>
    (consulta?.productos ?? []).map((p) => ({
      productoId: p.productoId,
      nombre: p.nombre,
      unidad: p.unidad,
      cantidad: p.cantidad,
      indicacion: p.indicacion ?? ''
    }))
  )
  const originales: Record<number, number> = Object.fromEntries(
    (consulta?.productos ?? []).map((p) => [p.productoId, p.cantidad])
  )
  const [nuevas, setNuevas] = useState<Elegida[]>([])
  const [quitar, setQuitar] = useState<number[]>([])
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    setGuardando(true)
    const datos = {
      motivo: f.motivo,
      pesoKg: f.peso,
      temperatura: f.temp,
      diagnostico: f.diagnostico,
      tratamiento: f.tratamiento,
      productos: usados.map((u) => ({
        productoId: u.productoId,
        cantidad: u.cantidad,
        indicacion: u.indicacion
      })),
      imagenes: nuevas.map((n) => n.ruta)
    }
    try {
      if (consulta) {
        await window.api.editarConsulta({ id: consulta.id, ...datos, quitar })
        onGuardado('Consulta actualizada', false)
      } else {
        await window.api.crearConsulta({ pacienteId, ...datos })
        onGuardado('Consulta guardada', true)
      }
    } catch (err) {
      setError(msgError(err))
      setGuardando(false)
    }
  }

  return (
    <Modal
      ancho
      titulo={consulta ? `Editar consulta del ${fechaLarga(consulta.fecha)}` : 'Nueva consulta'}
      onClose={onClose}
    >
      <form onSubmit={guardar}>
        <div className="sec-titulo">Motivo y datos del día</div>
        <Campo label="Motivo de la consulta">
          <input required autoFocus value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} />
        </Campo>
        <div className="grid2">
          <Campo label="Peso (kg)" ayuda="Opcional. Ej: 12,5">
            <input value={f.peso} onChange={(e) => setF({ ...f, peso: e.target.value })} />
          </Campo>
          <Campo label="Temperatura (°C)" ayuda="Opcional. Ej: 38,5">
            <input value={f.temp} onChange={(e) => setF({ ...f, temp: e.target.value })} />
          </Campo>
        </div>

        <div className="sec-titulo">Diagnóstico y tratamiento</div>
        <Campo label="Diagnóstico">
          <textarea value={f.diagnostico} onChange={(e) => setF({ ...f, diagnostico: e.target.value })} />
        </Campo>
        <Campo label="Tratamiento e indicaciones al dueño">
          <textarea value={f.tratamiento} onChange={(e) => setF({ ...f, tratamiento: e.target.value })} />
        </Campo>

        <div className="sec-titulo">Medicamentos y productos usados</div>
        <Medicamentos
          productos={productos}
          usados={usados}
          originales={originales}
          onChange={setUsados}
        />
        <small className="ayuda">
          Lo que cargues acá descuenta stock. La indicación (dosis y frecuencia) queda escrita en la
          historia clínica.
          {consulta && ' Si cambiás o quitás productos, el stock se corrige solo por la diferencia.'}
        </small>

        <div className="sec-titulo">Imágenes</div>
        <SelectorImagenes
          existentes={consulta?.adjuntos ?? []}
          quitar={quitar}
          nuevas={nuevas}
          onNuevas={setNuevas}
          onQuitar={setQuitar}
        />

        {error && <div className="error">{error}</div>}
        <div className="pie-modal">
          <button type="button" className="gris" onClick={onClose}>
            Cancelar
          </button>
          <button disabled={guardando}>{consulta ? 'Guardar cambios' : 'Guardar consulta'}</button>
        </div>
      </form>
    </Modal>
  )
}