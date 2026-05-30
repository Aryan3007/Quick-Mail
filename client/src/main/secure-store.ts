import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Encrypts a JSON-serializable value with Electron's safeStorage (OS keychain on macOS,
 * libsecret/DPAPI elsewhere) and writes it to userData. Plaintext never hits disk.
 */
function storePath(name: string): string {
  const dir = join(app.getPath('userData'), 'secure')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, `${name}.bin`)
}

export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

export function writeSecret<T>(name: string, value: T): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS-level encryption is not available; refusing to write secrets in plaintext')
  }
  const encrypted = safeStorage.encryptString(JSON.stringify(value))
  writeFileSync(storePath(name), encrypted)
}

export function readSecret<T>(name: string): T | null {
  const path = storePath(name)
  if (!existsSync(path)) return null
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS-level encryption is not available; cannot decrypt stored secrets')
  }
  const buf = readFileSync(path)
  const plain = safeStorage.decryptString(buf)
  return JSON.parse(plain) as T
}

export function deleteSecret(name: string): void {
  const path = storePath(name)
  if (existsSync(path)) unlinkSync(path)
}
