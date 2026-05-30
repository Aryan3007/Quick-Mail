import { readSecret, writeSecret } from '../secure-store'

const SECRET_NAME = 'ai-audit-logs'

export type AuditLogEntry = {
  id: string
  timestamp: number
  actionType: 'Triage' | 'Pre-Draft' | 'Semantic Search' | 'Send' | 'Compose'
  threadSubject: string
  description: string
  groundingContext?: string
}

export function getAuditLogs(): AuditLogEntry[] {
  try {
    return readSecret<AuditLogEntry[]>(SECRET_NAME) ?? []
  } catch (err) {
    console.error('Failed to read audit logs:', err)
    return []
  }
}

export function writeAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): AuditLogEntry[] {
  const current = getAuditLogs()
  const newEntry: AuditLogEntry = {
    ...entry,
    id: `log_${Math.random().toString(36).slice(2, 9)}`,
    timestamp: Date.now(),
  }
  // Keep last 100 entries to prevent database bloat
  const updated = [newEntry, ...current].slice(0, 100)
  try {
    writeSecret(SECRET_NAME, updated)
  } catch (err) {
    console.error('Failed to write audit logs:', err)
  }
  return updated
}

export function clearAuditLogs(): void {
  try {
    writeSecret(SECRET_NAME, [])
  } catch (err) {
    console.error('Failed to clear audit logs:', err)
  }
}
