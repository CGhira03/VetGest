import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { initDb, registerIpc } from './db'
import { registerClinica } from './clinica'
import { registerLicencia, evaluar } from './licencia'
import { registerRespaldo } from './respaldo'
import { registerVentas } from './ventas'
import { registerExportar } from './exportar'
import { protegerIpc, protegerSesion, protegerVentanas } from './seguridad'

app.setPath('userData', join(app.getPath('appData'), 'vetgest'))

// Seguridad: se activa antes de registrar cualquier canal de comunicación
protegerIpc()
protegerVentanas()

let ventana: BrowserWindow | null = null
let iniciada = false

function iniciarModulos(): void {
  if (iniciada) return
  iniciada = true
  initDb()
  registerIpc()
  registerClinica()
  registerRespaldo()
  registerVentas()
  registerExportar()
}

function createWindow(): void {
  ventana = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: is.dev
    }
  })

  ventana.on('ready-to-show', () => ventana?.show())

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    ventana.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    ventana.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Una sola ventana de la aplicación a la vez: dos copias abiertas sobre la misma base pueden dañarla
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (ventana) {
      if (ventana.isMinimized()) ventana.restore()
      ventana.focus()
    }
  })

  app.whenReady().then(async () => {
    electronApp.setAppUserModelId('com.vetgest.app')
    protegerSesion()
    registerLicencia(iniciarModulos)
    try {
      if ((await evaluar()).activada) iniciarModulos()
    } catch (err) {
      console.error('No se pudo verificar la licencia', err)
    }

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    createWindow()

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})