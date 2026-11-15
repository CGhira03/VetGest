import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron'
import { createHash } from 'crypto'
import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'fs'
import { extname, join } from 'path'
import { DatabaseSync } from 'node:sqlite'
import { cerrarDb, getDb, initDb, rutaDb } from './db'

const EXT_OK = new Set(['.jpg', '.jpeg', '.png'])
const base = (): string => app.getPath('userData')
const dirAdjuntos = (): string => join(base(), 'adjuntos')
const archLicencia = (): string => join(base(), 'licencia.vetlic')
const rutaConfig = (): string => join(base(), 'config.json')

// Solo se aceptan carpetas que el usuario eligió en el diálogo
const permitidas = new Set<string>()

const sha256 = (ruta: string): string => createHash('sha256').update(readFileSync(ruta)).digest('hex')

// En las copias solo entran imágenes JPG/PNG (y carpetas); nunca enlaces simbólicos ni otros archivos
function copiable(origen: string): boolean {
  try {
    const st = lstatSync(origen)
    if (st.isSymbolicLink()) return false
    if (st.isDirectory()) return true
    return EXT_OK.has(extname(origen).toLowerCase())
  } catch {
    return false
  }
}

function contarImagenes(dir: string): number {
  if (!existsSync(dir)) return 0
  return (readdirSync(dir, { recursive: true }) as string[]).filter((f) =>
    EXT_OK.has(extname(f).toLowerCase())
  ).length
}

function integridadOk(ruta: string): boolean {
  let bd: DatabaseSync | null = null
  try {
    bd = new DatabaseSync(ruta, { readOnly: true })
    const r = bd.prepare('PRAGMA integrity_check').get() as unknown as { integrity_check: string }
    const tabla = bd.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'paciente'").get()
    return r.integrity_check === 'ok' && !!tabla
  } catch {
    return false
  } finally {
    bd?.close()
  }
}

function leerConfig(): { ultimaCopia?: string } {
  try {
    return JSON.parse(readFileSync(rutaConfig(), 'utf8'))
  } catch {
    return {}
  }
}

function sello(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

async function elegirCarpeta(titulo: string): Promise<string | null> {
  const opciones: OpenDialogOptions = { title: titulo, properties: ['openDirectory', 'createDirectory'] }
  const win = BrowserWindow.getFocusedWindow()
  const r = win ? await dialog.showOpenDialog(win, opciones) : await dialog.showOpenDialog(opciones)
  return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
}

function validarCopia(ruta: string): { fecha: string; version: string; verificada: boolean } {
  const meta = join(ruta, 'copia.json')
  const bd = join(ruta, 'vetgest.db')
  if (!existsSync(meta) || !existsSync(bd)) {
    throw new Error('Esa carpeta no es una copia de seguridad de VeteMascota. Elegí la carpeta "VeteMascota-copia-..." completa')
  }
  let datos: { app?: string; fecha?: string; version?: string; sha256?: string; imagenes?: number }
  try {
    datos = JSON.parse(readFileSync(meta, 'utf8'))
  } catch {
    throw new Error('La copia está dañada: no se puede leer copia.json')
  }
  if (datos.app !== 'VetGest') throw new Error('Esa carpeta no es una copia de seguridad de VeteMascota')

  const verificada = typeof datos.sha256 === 'string'
  if (verificada && sha256(bd) !== datos.sha256) {
    throw new Error('La copia está dañada o fue modificada: su código de verificación no coincide. No se restaura.')
  }
  if (!integridadOk(bd)) {
    throw new Error('La base de datos de la copia está dañada o no tiene el formato esperado')
  }
  if (typeof datos.imagenes === 'number' && contarImagenes(join(ruta, 'adjuntos')) !== datos.imagenes) {
    throw new Error('La copia está incompleta: la cantidad de imágenes no coincide. No se restaura.')
  }
  return { fecha: String(datos.fecha ?? ''), version: String(datos.version ?? ''), verificada }
}

export function registerRespaldo(): void {
  ipcMain.handle('copias:estado', () => ({ ultimaCopia: leerConfig().ultimaCopia ?? null }))

  ipcMain.handle('copias:exportar', async () => {
    const padre = await elegirCarpeta('Elegí dónde guardar la copia de seguridad (mejor un pendrive o disco externo)')
    if (!padre) return null
    const destino = join(padre, `VeteMascota-copia-${sello()}`)
    if (existsSync(destino)) throw new Error('Ya existe una carpeta con ese nombre. Intentá de nuevo')
    mkdirSync(destino, { recursive: true })
    try {
      // VACUUM INTO genera una copia consistente de la base aunque la app esté abierta
      const copiaDb = join(destino, 'vetgest.db')
      getDb().exec(`VACUUM INTO '${copiaDb.replace(/'/g, "''")}'`)
      if (!integridadOk(copiaDb)) throw new Error('La copia no pasó la verificación de integridad. Volvé a intentarlo.')
      if (existsSync(dirAdjuntos())) {
        cpSync(dirAdjuntos(), join(destino, 'adjuntos'), { recursive: true, filter: copiable })
      }
      const imagenes = contarImagenes(join(destino, 'adjuntos'))
      if (imagenes !== contarImagenes(dirAdjuntos())) {
        throw new Error('No se pudieron copiar todas las imágenes. Volvé a intentarlo.')
      }
      if (existsSync(archLicencia())) copyFileSync(archLicencia(), join(destino, 'licencia.vetlic'))
      writeFileSync(
        join(destino, 'copia.json'),
        JSON.stringify(
          { app: 'VetGest', version: app.getVersion(), fecha: new Date().toISOString(), sha256: sha256(copiaDb), imagenes },
          null,
          2
        )
      )
      validarCopia(destino)
    } catch (err) {
      rmSync(destino, { recursive: true, force: true })
      throw err
    }
    writeFileSync(
      rutaConfig(),
      JSON.stringify({ ...leerConfig(), ultimaCopia: new Date().toISOString() }, null, 2),
      'utf8'
    )
    const mismaUnidad = destino.slice(0, 2).toUpperCase() === base().slice(0, 2).toUpperCase()
    return { ruta: destino, mismaUnidad, verificada: true }
  })

  ipcMain.handle('copias:elegir-restauracion', async () => {
    const ruta = await elegirCarpeta('Elegí la carpeta de la copia de seguridad (VeteMascota-copia-...)')
    if (!ruta) return null
    const meta = validarCopia(ruta)
    permitidas.add(ruta)
    return { ruta, ...meta }
  })

  ipcMain.handle('copias:restaurar', (_e, ruta: string) => {
    if (!permitidas.has(ruta)) throw new Error('Carpeta no autorizada. Volvé a elegir la copia')
    validarCopia(ruta)

    const bd = rutaDb()
    const adj = dirAdjuntos()
    const previo = join(base(), 'respaldo-previo')

    cerrarDb()
    try {
      // 1. Respaldo de lo que hay hoy (queda hasta la próxima restauración)
      rmSync(previo, { recursive: true, force: true })
      mkdirSync(previo, { recursive: true })
      if (existsSync(bd)) copyFileSync(bd, join(previo, 'vetgest.db'))
      if (existsSync(adj)) cpSync(adj, join(previo, 'adjuntos'), { recursive: true, filter: copiable })

      // 2. Se prepara lo nuevo al lado, sin tocar lo actual
      copyFileSync(join(ruta, 'vetgest.db'), bd + '.nuevo')
      rmSync(adj + '.nuevo', { recursive: true, force: true })
      if (existsSync(join(ruta, 'adjuntos'))) {
        cpSync(join(ruta, 'adjuntos'), adj + '.nuevo', { recursive: true, filter: copiable })
      }

      // 3. Recién ahora se reemplaza (la licencia actual no se toca)
      rmSync(bd + '-wal', { force: true })
      rmSync(bd + '-shm', { force: true })
      renameSync(bd + '.nuevo', bd)
      rmSync(adj, { recursive: true, force: true })
      if (existsSync(adj + '.nuevo')) renameSync(adj + '.nuevo', adj)
    } catch (err) {
      try {
        initDb()
      } catch {
        /* no se pudo reabrir la base */
      }
      throw err
    }
    app.relaunch()
    app.exit(0)
  })
}