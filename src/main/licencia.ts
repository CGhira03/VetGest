import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron'
import { createHash, createPublicKey, verify } from 'crypto'
import { execFile } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

// Reemplazá todo este bloque por la clave pública que imprimió tools/generar-claves.mjs
const CLAVE_PUBLICA = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAW9glg73lK4Ln2yVTKREFjziUqvLX57DmDwTSRNA82bY=
-----END PUBLIC KEY-----`

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

type Resultado = { ok: true; licenciatario: string; emitida: string } | { ok: false; motivo: string }

// En desarrollo no se exige licencia, salvo que VETGEST_FORZAR_LICENCIA=1. La app instalada siempre la exige.
const exigir = (): boolean => app.isPackaged || process.env.VETGEST_FORZAR_LICENCIA === '1'

const rutaLicencia = (): string => join(app.getPath('userData'), 'licencia.vetlic')

let idCache: string | null = null

function leerMachineGuid(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'reg',
      ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
      { windowsHide: true },
      (err, stdout) => {
        if (err) return reject(err)
        const m = /MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]{8,})/.exec(stdout)
        if (!m) return reject(new Error('No se encontró el identificador de la computadora'))
        resolve(m[1].toLowerCase())
      }
    )
  })
}

export async function idMaquina(): Promise<string> {
  if (idCache) return idCache
  const guid = await leerMachineGuid()
  const hex = createHash('sha256').update('vetgest|' + guid).digest('hex').slice(0, 20).toUpperCase()
  idCache = (hex.match(/.{4}/g) ?? []).join('-')
  return idCache
}

function verificar(contenido: string, id: string): Resultado {
  let obj: { payload?: string; firma?: string }
  try {
    obj = JSON.parse(contenido)
  } catch {
    return { ok: false, motivo: 'El archivo no tiene el formato de una licencia' }
  }
  if (!obj.payload || !obj.firma) {
    return { ok: false, motivo: 'El archivo no tiene el formato de una licencia' }
  }
  try {
    const payload = Buffer.from(obj.payload, 'base64')
    const firma = Buffer.from(obj.firma, 'base64')
    if (!verify(null, payload, createPublicKey(CLAVE_PUBLICA), firma)) {
      return { ok: false, motivo: 'La firma de la licencia no es válida (archivo alterado o de otro emisor)' }
    }
    const datos = JSON.parse(payload.toString('utf8')) as {
      app?: string
      licenciatario?: string
      idMaquina?: string
      emitida?: string
    }
    if (datos.app !== 'VetGest' || !datos.licenciatario) {
      return { ok: false, motivo: 'La licencia no corresponde a esta aplicación' }
    }
    if (String(datos.idMaquina).toUpperCase() !== id) {
      return { ok: false, motivo: 'Esta licencia corresponde a otra computadora' }
    }
    return { ok: true, licenciatario: datos.licenciatario, emitida: String(datos.emitida ?? '') }
  } catch {
    return { ok: false, motivo: 'No se pudo verificar la licencia (¿falta configurar la clave pública?)' }
  }
}

export async function evaluar(): Promise<EstadoLicencia> {
  const base = { version: app.getVersion(), carpetaDatos: app.getPath('userData') }
  let id = 'NO-DISPONIBLE'
  try {
    id = await idMaquina()
  } catch {
    if (exigir()) {
      return {
        ...base,
        idMaquina: id,
        activada: false,
        modo: 'invalida',
        motivo: 'No se pudo leer el identificador de la computadora'
      }
    }
  }
  if (!exigir()) {
    return { ...base, idMaquina: id, activada: true, modo: 'dev', licenciatario: 'Modo desarrollo (sin licencia)' }
  }
  const ruta = rutaLicencia()
  if (!existsSync(ruta)) return { ...base, idMaquina: id, activada: false, modo: 'pendiente' }
  const r = verificar(readFileSync(ruta, 'utf8'), id)
  if (!r.ok) return { ...base, idMaquina: id, activada: false, modo: 'invalida', motivo: r.motivo }
  return { ...base, idMaquina: id, activada: true, modo: 'licencia', licenciatario: r.licenciatario, emitida: r.emitida }
}

export function registerLicencia(alActivar: () => void): void {
  ipcMain.handle('licencia:estado', () => evaluar())

  ipcMain.handle('licencia:activar', async () => {
    const opciones: OpenDialogOptions = {
      title: 'Elegir archivo de licencia',
      properties: ['openFile'],
      filters: [{ name: 'Licencia VetGest (*.vetlic)', extensions: ['vetlic'] }]
    }
    const win = BrowserWindow.getFocusedWindow()
    const r = win ? await dialog.showOpenDialog(win, opciones) : await dialog.showOpenDialog(opciones)
    if (r.canceled || r.filePaths.length === 0) return null

    const contenido = readFileSync(r.filePaths[0], 'utf8')
    const v = verificar(contenido, await idMaquina())
    if (!v.ok) throw new Error(v.motivo)

    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(rutaLicencia(), contenido, 'utf8')
    alActivar()
    return evaluar()
  })
}