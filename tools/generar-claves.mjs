import { generateKeyPairSync } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const salida = process.argv[2]
if (!salida) {
  console.error('Uso: node tools/generar-claves.mjs <ruta-de-la-clave-privada.pem>')
  console.error('Guardala FUERA del proyecto, por ejemplo C:\\vetgest-claves\\clave-privada.pem')
  process.exit(1)
}
if (existsSync(salida)) {
  console.error(`Ya existe ${salida}. No se sobrescribe: una clave nueva dejaría sin validez las licencias ya emitidas.`)
  process.exit(1)
}
mkdirSync(dirname(salida), { recursive: true })
const { publicKey, privateKey } = generateKeyPairSync('ed25519')
writeFileSync(salida, privateKey.export({ type: 'pkcs8', format: 'pem' }))
console.log(`Clave privada guardada en: ${salida}`)
console.log('Guardala también en un pendrive o gestor de contraseñas. No la subas a git ni la compartas.\n')
console.log('Clave pública (pegala en src/main/licencia.ts):\n')
console.log(publicKey.export({ type: 'spki', format: 'pem' }))