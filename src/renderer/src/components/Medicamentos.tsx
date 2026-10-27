import { useState } from 'react'
import type { Producto } from '../utils'

export interface Usado {
  productoId: number
  nombre: string
  unidad: string
  cantidad: number
  indicacion: string
}

export default function Medicamentos({
  productos,
  usados,
  originales,
  onChange
}: {
  productos: Producto[]
  usados: Usado[]
  originales?: Record<number, number>
  onChange: (u: Usado[]) => void
}) {
  const [buscar, setBuscar] = useState('')
  const [cant, setCant] = useState('1')
  const [indic, setIndic] = useState('')
  const [aviso, setAviso] = useState('')

  // Al editar una consulta, lo que ya había descontado vuelve a estar disponible
  const disponible = (id: number): number =>
    (productos.find((p) => p.id === id)?.stock ?? 0) + (originales?.[id] ?? 0)

  function agregar() {
    const p = productos.find((x) => x.nombre.toLowerCase() === buscar.trim().toLowerCase())
    const n = parseInt(cant, 10)
    if (!p) return setAviso('Elegí un producto de la lista que aparece al escribir')
    if (!(n > 0)) return setAviso('La cantidad debe ser 1 o más')
    setAviso('')
    const ya = usados.find((u) => u.productoId === p.id)
    onChange(
      ya
        ? usados.map((u) =>
            u.productoId === p.id
              ? { ...u, cantidad: u.cantidad + n, indicacion: indic.trim() || u.indicacion }
              : u
          )
        : [
            ...usados,
            { productoId: p.id, nombre: p.nombre, unidad: p.unidad, cantidad: n, indicacion: indic.trim() }
          ]
    )
    setBuscar('')
    setCant('1')
    setIndic('')
  }

  const cambiar = (id: number, cambios: Partial<Usado>) =>
    onChange(usados.map((u) => (u.productoId === id ? { ...u, ...cambios } : u)))

  return (
    <div>
      <div className="fila-med">
        <div>
          <input
            list="lista-productos"
            placeholder="Escribí para buscar el producto..."
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
          />
          <datalist id="lista-productos">
            {productos.map((p) => (
              <option key={p.id} value={p.nombre}>
                {`stock: ${p.stock} ${p.unidad}`}
              </option>
            ))}
          </datalist>
        </div>
        <input type="number" min="1" title="Cantidad" value={cant} onChange={(e) => setCant(e.target.value)} />
        <input
          placeholder="Indicación (ej: 1 cada 12 hs por 7 días)"
          value={indic}
          onChange={(e) => setIndic(e.target.value)}
        />
        <button type="button" onClick={agregar}>
          Agregar
        </button>
      </div>
      {aviso && <div className="txt-rojo">{aviso}</div>}

      {usados.length > 0 && (
        <table className="tabla sinclick items-tabla">
          <thead>
            <tr>
              <th>Producto</th>
              <th style={{ width: 90 }}>Cantidad</th>
              <th>Indicación / dosis</th>
              <th style={{ width: 90 }}>Disponible</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {usados.map((u) => {
              const disp = disponible(u.productoId)
              const falta = u.cantidad > disp
              return (
                <tr key={u.productoId}>
                  <td>
                    {u.nombre} <small className="sub">{u.unidad}</small>
                  </td>
                  <td>
                    <input
                      type="number"
                      min="1"
                      value={u.cantidad}
                      onChange={(e) => cambiar(u.productoId, { cantidad: parseInt(e.target.value, 10) || 0 })}
                    />
                  </td>
                  <td>
                    <input
                      value={u.indicacion}
                      placeholder="Opcional"
                      onChange={(e) => cambiar(u.productoId, { indicacion: e.target.value })}
                    />
                  </td>
                  <td className={falta ? 'txt-rojo' : ''}>
                    {disp}
                    {falta && <div>No alcanza</div>}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="chico gris"
                      onClick={() => onChange(usados.filter((x) => x.productoId !== u.productoId))}
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
    </div>
  )
}