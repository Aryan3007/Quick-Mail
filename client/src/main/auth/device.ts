import { randomBytes } from 'node:crypto'
import { app } from 'electron'

import { API_BASE_URL } from '../config'
import { readSecret, writeSecret } from '../secure-store'

type DeviceRecord = {
  deviceId: string
  deviceToken: string
  expiresAt: number
}

const SECRET_NAME = 'device'

function generateDeviceId(): string {
  return `dev_${randomBytes(16).toString('hex')}`
}

let cached: DeviceRecord | null = null

export async function ensureDevice(): Promise<DeviceRecord> {
  if (cached && cached.expiresAt - 60 > Math.floor(Date.now() / 1000)) return cached

  const stored = readSecret<DeviceRecord>(SECRET_NAME)
  if (stored && stored.expiresAt - 60 > Math.floor(Date.now() / 1000)) {
    cached = stored
    return stored
  }

  const deviceId = stored?.deviceId ?? generateDeviceId()
  const res = await fetch(`${API_BASE_URL}/v1/devices/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ device_id: deviceId, platform: process.platform }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`device registration failed: ${res.status} ${text}`)
  }
  const json = (await res.json()) as { device_token: string; expires_at: number }
  const record: DeviceRecord = {
    deviceId,
    deviceToken: json.device_token,
    expiresAt: json.expires_at,
  }
  writeSecret(SECRET_NAME, record)
  cached = record
  return record
}

export async function authHeaders(): Promise<Record<string, string>> {
  const device = await ensureDevice()
  return {
    authorization: `Bearer ${device.deviceToken}`,
    'x-quikmail-version': app.getVersion(),
  }
}
