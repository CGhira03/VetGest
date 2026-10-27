export interface Producto {
  id: number
  nombre: string
  categoria: string
  unidad: string
  precio_costo: number
  precio_venta: number
  stock_minimo: number
  proveedor_id: number | null
  proveedor: string | null
  activo: number
  stock: number
}

export interface Proveedor {
  id: number
  nombre: string
  contacto: string | null
  cuit: string | null
  telefono: string | null
  email: string | null
  direccion: string | null
  condiciones: string | null
  notas: string | null
  activo: number
  productos: number
}

export interface Movimiento {
  id: number
  fecha: string
  tipo: 'entrada' | 'salida'
  cantidad: number
  origen: 'compra' | 'consulta' | 'ajuste'
  nota: string
  anula_a: number | null
  costo_unitario: number | null
  proveedor: string | null
  anulado: number
}

export interface DetalleProveedor {
  productos: {
    id: number
    nombre: string
    unidad: string
    stock_minimo: number
    precio_costo: number
    stock: number
  }[]
  compras: {
    id: number
    fecha: string
    producto: string
    cantidad: number
    costo_unitario: number | null
    nota: string
    anulado: number
  }[]
}

export type Estado = 'sin' | 'bajo' | 'ok'

export const estadoStock = (p: { stock: number; stock_minimo: number }): Estado =>
  p.stock <= 0 ? 'sin' : p.stock <= p.stock_minimo ? 'bajo' : 'ok'

export const ETIQUETA_ESTADO: Record<Estado, string> = {
  sin: 'Sin stock',
  bajo: 'Stock bajo',
  ok: 'OK'
}

export const moneda = (centavos: number): string =>
  (centavos / 100).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })

// Acepta "1500", "1500,50", "1.500" y "1.500,50"
export const aCentavos = (txt: string): number => {
  let t = txt.trim().replace(/[^\d.,]/g, '')
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '')
  else if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  return Math.round((parseFloat(t) || 0) * 100)
}

// Para volver a mostrar un importe guardado en centavos dentro de un campo de texto
export const aPesos = (centavos: number): string =>
  centavos % 100 === 0 ? String(centavos / 100) : (centavos / 100).toFixed(2).replace('.', ',')

export const msgError = (e: unknown): string =>
  e instanceof Error
    ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    : String(e)

export interface Paciente {
  id: number
  nombre: string
  especie: string
  raza: string
  propietario: string
  telefono: string
  ultima_consulta: string | null
}

export interface ConsultaItem {
  productoId: number
  nombre: string
  unidad: string
  cantidad: number
  indicacion: string | null
}

export interface AdjuntoMini {
  id: number
  nombre: string
  miniatura: string
}

export interface ImagenPaciente extends AdjuntoMini {
  fecha: string
  consulta_id: number | null
  fecha_consulta: string | null
  motivo: string | null
}

export interface Elegida {
  ruta: string
  nombre: string
  vista: string
}

export interface Consulta {
  id: number
  fecha: string
  motivo: string
  diagnostico: string | null
  tratamiento: string | null
  peso_kg: number | null
  temperatura: number | null
  modificada: string | null
  productos: ConsultaItem[]
  adjuntos: AdjuntoMini[]
}

export const fechaLarga = (iso: string): string =>
  new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })

export const fechaHora = (iso: string): string => new Date(iso).toLocaleString('es-AR')

export const kg = (n: number): string =>
  `${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })} kg`

export const plural = (n: number, singular: string, pl: string): string =>
  `${n} ${n === 1 ? singular : pl}`