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
  origen: 'compra' | 'consulta' | 'ajuste' | 'venta'
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

// ---------- Pacientes y clínica ----------
export interface Paciente {
  id: number
  nombre: string
  especie: string
  raza: string | null
  sexo: string | null
  nacimiento: string | null
  alimentacion: string | null
  propietario_id: number
  propietario: string
  telefono: string | null
  direccion: string | null
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

// La edad se guarda como fecha de nacimiento aproximada y se calcula al mostrarla
function mesesDesde(nacimiento: string): number {
  const n = new Date(nacimiento + 'T12:00:00')
  const h = new Date()
  let m = (h.getFullYear() - n.getFullYear()) * 12 + (h.getMonth() - n.getMonth())
  if (h.getDate() < n.getDate()) m -= 1
  return Math.max(m, 0)
}

export const edadDesdeNacimiento = (nac: string | null): { anios: string; meses: string } => {
  if (!nac) return { anios: '', meses: '' }
  const total = mesesDesde(nac)
  return { anios: String(Math.floor(total / 12)), meses: String(total % 12) }
}

export const edadTexto = (nac: string | null): string => {
  if (!nac) return '—'
  const total = mesesDesde(nac)
  const a = Math.floor(total / 12)
  const m = total % 12
  const meses = `${m} ${m === 1 ? 'mes' : 'meses'}`
  if (a === 0) return total === 0 ? 'Menos de 1 mes' : meses
  return `${a} ${a === 1 ? 'año' : 'años'}${m > 0 ? ` y ${meses}` : ''}`
}

// ---------- Cuentas corrientes y ventas ----------
export type Pago = 'efectivo' | 'transferencia' | 'tarjeta' | 'cuenta_corriente'

export const ETIQUETA_PAGO: Record<Pago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  cuenta_corriente: 'Cuenta corriente'
}

export interface Propietario {
  id: number
  nombre: string
  telefono: string | null
  direccion: string | null
}

export interface CuentaCliente {
  id: number
  nombre: string
  telefono: string | null
  direccion: string | null
  nota: string | null
  saldo: number
  ultimo_cobro: string | null
}

export interface MovCuenta {
  clave: string
  tipo: 'venta' | 'cobro'
  id: number
  fecha: string
  detalle: string
  debe: number
  haber: number
  anulado: number
  saldo: number
  estado?: 'pagada' | 'parcial' | 'pendiente'
  cubierto?: number
}

export interface CuentaDetalle {
  cuenta: {
    id: number
    nombre: string
    telefono: string | null
    direccion: string | null
    nota: string | null
    saldo: number
  }
  resumen: {
    comprado: number
    cobrado: number
    saldo: number
    ultimoCobro: string | null
    masAntigua: string | null
  }
  movimientos: MovCuenta[]
}

export interface VentaFila {
  id: number
  fecha: string
  cuenta_id: number | null
  cliente: string | null
  pago: Pago
  total: number
  anulada: number
  nota: string | null
  resumen: string | null
}

export interface VentaDetalle {
  venta: {
    id: number
    fecha: string
    cliente: string | null
    pago: Pago
    total: number
    nota: string | null
    anulada: number
  }
  items: {
    id: number
    producto_id: number | null
    descripcion: string
    cantidad: number
    precio_unitario: number
  }[]
}

export interface MovimientoCaja {
  clave: string
  fecha: string
  tipo: 'venta' | 'cobro' | 'compra' | 'stock'
  detalle: string
  medio: string
  ingreso: number
  egreso: number
  aCuenta: number
  anulado: number
}

// ---------- Exportación ----------
export interface ColumnaExport {
  titulo: string
  tipo?: 'texto' | 'entero' | 'moneda'
  alinear?: 'left' | 'right' | 'center'
}

export interface PedidoExport {
  archivo: string
  titulo: string
  subtitulo?: string
  columnas: ColumnaExport[]
  filas: (string | number | null)[][]
  notas?: string[]
}

export const fechaArchivo = (): string => {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// ---------- Licencia y copias ----------
export interface EstadoLicencia {
  activada: boolean
  modo: 'dev' | 'licencia' | 'pendiente' | 'invalida'
  idMaquina: string
  licenciatario?: string
  emitida?: string
  motivo?: string
  version: string
  carpetaDatos: string
}

export const diasDesde = (iso: string): number =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)

export const PESTANAS = [
  'Inicio',
  'Pacientes',
  'Ventas',
  'Clientes',
  'Stock',
  'Proveedores',
  'Configuración'
] as const
export type Pestana = (typeof PESTANAS)[number]

export interface MovStockFila {
  id: number
  fecha: string
  tipo: 'entrada' | 'salida'
  cantidad: number
  origen: 'compra' | 'consulta' | 'ajuste' | 'venta'
  nota: string | null
  anula_a: number | null
  costo_unitario: number | null
  producto_id: number
  producto: string
  unidad: string | null
  proveedor: string | null
  anulado: number
}