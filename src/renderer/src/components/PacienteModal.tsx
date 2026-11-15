import { useEffect, useState, type FormEvent } from 'react'
import { Campo, Modal } from './ui'
import { edadDesdeNacimiento, msgError, type Propietario, type Paciente } from '../utils'

export default function PacienteModal({
  paciente,
  onClose,
  onGuardado
}: {
  paciente?: Paciente
  onClose: () => void
  onGuardado: (id: number) => void
}) {
  const inicial = edadDesdeNacimiento(paciente?.nacimiento ?? null)
  const [f, setF] = useState({
    propietario: paciente?.propietario ?? '',
    telefono: paciente?.telefono ?? '',
    direccion: paciente?.direccion ?? '',
    nombre: paciente?.nombre ?? '',
    especie: paciente?.especie ?? '',
    raza: paciente?.raza ?? '',
    sexo: paciente?.sexo ?? '',
    anios: inicial.anios,
    meses: inicial.meses,
    alimentacion: paciente?.alimentacion ?? ''
  })
  const [clientes, setClientes] = useState<Propietario[]>([])
  const [existente, setExistente] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!paciente) window.api.listarPropietarios().then(setClientes)
  }, [paciente])

  function elegirDueno(id: string) {
    setExistente(id)
    const c = clientes.find((x) => String(x.id) === id)
    setF({
      ...f,
      propietario: c?.nombre ?? '',
      telefono: c?.telefono ?? '',
      direccion: c?.direccion ?? ''
    })
  }

  async function guardar(e: FormEvent) {
    e.preventDefault()
    const datos = {
      propietarioId: existente ? Number(existente) : null,
      propietario: f.propietario,
      telefono: f.telefono,
      direccion: f.direccion,
      nombre: f.nombre,
      especie: f.especie.trim().replace(/^./, (c) => c.toUpperCase()),      raza: f.raza,
      sexo: f.sexo,
      edadAnios: f.anios,
      edadMeses: f.meses,
      alimentacion: f.alimentacion
    }
    try {
      if (paciente) {
        const edadCambio = f.anios !== inicial.anios || f.meses !== inicial.meses
        await window.api.editarPaciente({ id: paciente.id, ...datos, edadCambio })
        onGuardado(paciente.id)
      } else {
        const id: number = await window.api.crearPaciente(datos)
        onGuardado(id)
      }
    } catch (err) {
      setError(msgError(err))
    }
  }

  const bloqueado = !paciente && existente !== ''

  return (
    <Modal titulo={paciente ? 'Editar paciente y dueño' : 'Nuevo paciente'} onClose={onClose}>
      <form onSubmit={guardar}>
        <div className="sec-titulo">Dueño</div>
        {!paciente && (
          <Campo label="¿Es un dueño que ya está cargado?" ayuda="Si ya tiene otra mascota, elegilo para no duplicarlo">
            <select value={existente} onChange={(e) => elegirDueno(e.target.value)}>
              <option value="">No, es un dueño nuevo</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                  {c.telefono ? ` · ${c.telefono}` : ''}
                </option>
              ))}
            </select>
          </Campo>
        )}
        <div className="grid2">
          <Campo label="Nombre y apellido">
            <input required readOnly={bloqueado} autoFocus={!!paciente} value={f.propietario}
              onChange={(e) => setF({ ...f, propietario: e.target.value })} />
          </Campo>
          <Campo label="Teléfono">
            <input readOnly={bloqueado} value={f.telefono}
              onChange={(e) => setF({ ...f, telefono: e.target.value })} />
          </Campo>
        </div>
        <Campo label="Dirección">
          <input readOnly={bloqueado} value={f.direccion}
            onChange={(e) => setF({ ...f, direccion: e.target.value })} />
        </Campo>
        {paciente && (
          <small className="ayuda">
            Si el dueño tiene más mascotas, los cambios en sus datos se aplican a todas.
          </small>
        )}

        <div className="sec-titulo">Mascota</div>
        <div className="grid2">
          <Campo label="Nombre de la mascota">
            <input required value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
          </Campo>
          <Campo label="Especie" ayuda="Escribila a mano. Ej: Perro, Gato, Conejo">
            <input required value={f.especie} onChange={(e) => setF({ ...f, especie: e.target.value })} />
          </Campo>
        </div>
        <div className="grid2">
          <Campo label="Raza">
            <input value={f.raza} onChange={(e) => setF({ ...f, raza: e.target.value })} />
          </Campo>
          <Campo label="Sexo">
            <select value={f.sexo} onChange={(e) => setF({ ...f, sexo: e.target.value })}>
              <option value="">Sin especificar</option>
              <option>Macho</option>
              <option>Hembra</option>
            </select>
          </Campo>
        </div>
        <div className="grid3">
          <Campo label="Edad: años">
            <input type="number" min="0" value={f.anios}
              onChange={(e) => setF({ ...f, anios: e.target.value })} />
          </Campo>
          <Campo label="Edad: meses">
            <input type="number" min="0" value={f.meses}
              onChange={(e) => setF({ ...f, meses: e.target.value })} />
          </Campo>
          <Campo label="Alimentación">
            <select value={f.alimentacion} onChange={(e) => setF({ ...f, alimentacion: e.target.value })}>
              <option value="">Sin especificar</option>
              <option>Balanceado</option>
              <option>Elaborado por el dueño</option>
            </select>
          </Campo>
        </div>
        <small className="ayuda">
          La edad es aproximada: el sistema la mantiene actualizada con el paso del tiempo.
        </small>

        {error && <div className="error">{error}</div>}
        <div className="pie-modal">
          <button type="button" className="gris" onClick={onClose}>
            Cancelar
          </button>
          <button>{paciente ? 'Guardar cambios' : 'Crear paciente'}</button>
        </div>
      </form>
    </Modal>
  )
}