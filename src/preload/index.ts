import { contextBridge, ipcRenderer } from 'electron'

const api = {
  estadoLicencia: () => ipcRenderer.invoke('licencia:estado'),
  activarLicencia: () => ipcRenderer.invoke('licencia:activar'),
  aceptarTerminos: () => ipcRenderer.invoke('terminos:aceptar'),
  estadoCopias: () => ipcRenderer.invoke('copias:estado'),
  exportarCopia: () => ipcRenderer.invoke('copias:exportar'),
  elegirRestauracion: () => ipcRenderer.invoke('copias:elegir-restauracion'),
  restaurarCopia: (ruta: string) => ipcRenderer.invoke('copias:restaurar', ruta),

  exportarTabla: (d: unknown) => ipcRenderer.invoke('exportar:tabla', d),

  listarPropietarios: () => ipcRenderer.invoke('propietarios:listar'),
  listarPacientes: (q: string) => ipcRenderer.invoke('pacientes:listar', q),
  crearPaciente: (d: unknown) => ipcRenderer.invoke('pacientes:crear', d),
  editarPaciente: (d: unknown) => ipcRenderer.invoke('pacientes:editar', d),
  eliminarPaciente: (id: number) => ipcRenderer.invoke('pacientes:eliminar', id),

  listarConsultas: (id: number) => ipcRenderer.invoke('consultas:listar', id),
  crearConsulta: (d: unknown) => ipcRenderer.invoke('consultas:crear', d),
  editarConsulta: (d: unknown) => ipcRenderer.invoke('consultas:editar', d),
  eliminarConsulta: (id: number) => ipcRenderer.invoke('consultas:eliminar', id),

  elegirImagenes: () => ipcRenderer.invoke('archivos:elegir'),
  imagenesPaciente: (id: number) => ipcRenderer.invoke('adjuntos:paciente', id),
  agregarImagenes: (d: unknown) => ipcRenderer.invoke('adjuntos:agregar', d),
  verImagen: (id: number) => ipcRenderer.invoke('adjuntos:ver', id),
  eliminarImagen: (id: number) => ipcRenderer.invoke('adjuntos:eliminar', id),

  listarCuentas: (q = '', soloDeuda = false) => ipcRenderer.invoke('cuentas:listar', q, soloDeuda),
  detalleCuenta: (id: number) => ipcRenderer.invoke('cuentas:detalle', id),
  crearCuenta: (d: unknown) => ipcRenderer.invoke('cuentas:crear', d),
  editarCuenta: (d: unknown) => ipcRenderer.invoke('cuentas:editar', d),
  eliminarCuenta: (id: number) => ipcRenderer.invoke('cuentas:eliminar', id),
  crearCobro: (d: unknown) => ipcRenderer.invoke('cobros:crear', d),
  anularCobro: (id: number) => ipcRenderer.invoke('cobros:anular', id),

  listarVentas: (f: unknown) => ipcRenderer.invoke('ventas:listar', f),
  totalesVentas: (f: unknown) => ipcRenderer.invoke('ventas:totales', f),
  detalleVenta: (id: number) => ipcRenderer.invoke('ventas:detalle', id),
  crearVenta: (d: unknown) => ipcRenderer.invoke('ventas:crear', d),
  anularVenta: (id: number) => ipcRenderer.invoke('ventas:anular', id),
  listarMovimientosCaja: (f: unknown) => ipcRenderer.invoke('movimientos:listar', f),

  listarProveedores: (incluirArchivados = false) =>
    ipcRenderer.invoke('proveedores:listar', incluirArchivados),
  detalleProveedor: (id: number) => ipcRenderer.invoke('proveedores:detalle', id),
  crearProveedor: (d: unknown) => ipcRenderer.invoke('proveedores:crear', d),
  editarProveedor: (d: unknown) => ipcRenderer.invoke('proveedores:editar', d),
  archivarProveedor: (d: { id: number; activo: boolean }) =>
    ipcRenderer.invoke('proveedores:archivar', d),
  eliminarProveedor: (id: number) => ipcRenderer.invoke('proveedores:eliminar', id),

  listarProductos: (incluirArchivados = false) =>
    ipcRenderer.invoke('productos:listar', incluirArchivados),
  crearProducto: (d: unknown) => ipcRenderer.invoke('productos:crear', d),
  editarProducto: (d: unknown) => ipcRenderer.invoke('productos:editar', d),
  archivarProducto: (d: { id: number; activo: boolean }) =>
    ipcRenderer.invoke('productos:archivar', d),
  eliminarProducto: (id: number) => ipcRenderer.invoke('productos:eliminar', id),

  registrarMovimiento: (d: unknown) => ipcRenderer.invoke('stock:movimiento', d),
  conteoStock: (d: unknown) => ipcRenderer.invoke('stock:conteo', d),
  anularMovimiento: (id: number) => ipcRenderer.invoke('stock:anular', id),
  listarMovimientos: (id: number) => ipcRenderer.invoke('stock:movimientos', id),
  libroStock: (f: unknown) => ipcRenderer.invoke('stock:libro', f)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api