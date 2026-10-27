import { contextBridge, ipcRenderer } from 'electron'

const api = {
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
  listarMovimientos: (id: number) => ipcRenderer.invoke('stock:movimientos', id)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api