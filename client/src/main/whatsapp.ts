import { Notification } from 'electron'
import { readPersona } from './ai'
import { sendGmailMessageDirect } from './mail/gmail'
import type { MailThread } from '../shared/mail'
import { API_BASE_URL } from './config'
import { authHeaders } from './auth/device'
import { writeAuditLog } from './ai/audit'

const SUPABASE_URL = 'https://yqgqswocypuhqgslbaxp.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxZ3Fzd29jeXB1aHFnc2xiYXhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE2ODIyMzg1MTcsImV4cCI6MTk5NzgyMjUxN30.2nS10v6X2b6z83S6h834S_4Z0N7t6L852z63w6y8'

// Start the Telegram approval listening loop
let approvalInterval: NodeJS.Timeout | null = null

export function initializeWhatsAppApprovalListener() {
  if (approvalInterval) clearInterval(approvalInterval)

  approvalInterval = setInterval(async () => {
    try {
      const persona = readPersona()
      const hasTelegram = persona.telegramEnabled && persona.telegramBotToken && persona.telegramChatId
      if (!hasTelegram) {
        return
      }

      // Fetch any drafts marked as 'approved' in Supabase, catching fetch drops (e.g. database paused/offline)
      const res = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_approvals?status=eq.approved&select=*`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        }
      }).catch(() => null)

      if (!res || !res.ok) return
      const approvedRows = await res.json() as any[]
      if (!Array.isArray(approvedRows) || approvedRows.length === 0) return

      for (const row of approvedRows) {
        const { id: draftId, to_email, subject, draft_reply, thread_id } = row

        // Update status in Supabase to 'sending' immediately to prevent double-send race conditions
        await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_approvals?id=eq.${draftId}`, {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ status: 'sent' })
        }).catch(() => null)

        try {
          // Send Gmail reply
          await sendGmailMessageDirect(
            to_email,
            subject,
            `<p>${draft_reply.replace(/\n/g, '<br>')}</p>`,
            thread_id || undefined
          )

          // Show Desktop Notification
          new Notification({
            title: '✉️ Telegram Reply Sent!',
            body: `Approved reply to "${subject}" was successfully sent via Gmail.`,
          }).show()

        } catch (err) {
          console.error(`Failed to send Telegram-approved email for draft ${draftId}:`, err)
          // Fallback status to error
          await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_approvals?id=eq.${draftId}`, {
            method: 'PATCH',
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: 'error' })
          }).catch(() => null)
        }
      }
    } catch (err) {
      // Swallowed to prevent console spam when paused
    }
  }, 7000)
}

// Evaluate if a newly downloaded email is critical and trigger RAG draft & Telegram push
export async function evaluateAndTriageNewEmail(thread: MailThread, body: string) {
  try {
    writeAuditLog({
      actionType: 'Triage',
      threadSubject: thread.subject,
      description: `Evaluating incoming email from ${thread.from} (${thread.fromEmail})...`
    })

    const persona = readPersona()
    const hasTelegram = persona.telegramEnabled && persona.telegramBotToken && persona.telegramChatId
    if (!hasTelegram) {
      writeAuditLog({
        actionType: 'Triage',
        threadSubject: thread.subject,
        description: 'Triage skipped: Telegram notification alerts are currently disabled or incomplete in Settings.'
      })
      return
    }

    writeAuditLog({
      actionType: 'Triage',
      threadSubject: thread.subject,
      description: 'Querying AI model for critical urgency evaluation and summary generation...'
    })

    // Call fast LLM classification
    const prompt = `You are a triage engine evaluating email importance.
Evaluate if the following incoming email represents an extremely important scheduling slot or critical inquiry (like interview slots, recruiter follow-ups, contract documents, urgent client billing).

EMAIL DETAILS:
From: ${thread.from} <${thread.fromEmail}>
Subject: ${thread.subject}
Preview: ${thread.preview}
Body:
${body.slice(0, 3000)}

Respond strictly in structured JSON matching this schema:
{
  "important": boolean,
  "reasoning": "1 short sentence explaining why it is or isn't important",
  "summary": "A concise, professional 2-3 sentence summary of the email highlighting key requests, dates, and action items."
}`

    const res = await fetch(`${API_BASE_URL}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(await authHeaders()),
      },
      body: JSON.stringify({
        system: "You are a precise JSON classification and writing assistant. Respond ONLY in valid JSON matching the exact schema requested.",
        messages: [{ role: 'user', content: prompt }],
        stream: true
      })
    })

    if (!res.ok) {
      const errText = await res.text()
      writeAuditLog({
        actionType: 'Triage',
        threadSubject: thread.subject,
        description: `Triage evaluation failed: LLM classification server returned error code ${res.status} (${errText})`
      })
      return
    }

    const reader = res.body?.getReader()
    if (!reader) {
      writeAuditLog({
        actionType: 'Triage',
        threadSubject: thread.subject,
        description: 'Triage evaluation failed: Empty stream response from AI model'
      })
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let accumulatedText = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      let currentEvent = ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        if (trimmed.startsWith('event:')) {
          currentEvent = trimmed.slice(6).trim()
        } else if (trimmed.startsWith('data:')) {
          const dataStr = trimmed.slice(5).trim()
          try {
            const parsed = JSON.parse(dataStr)
            if (currentEvent === 'text_delta' && parsed.text) {
              accumulatedText += parsed.text
            }
          } catch (err) {
            // Ignored
          }
        }
      }
    }

    // Parse response
    const content = accumulatedText.trim()
    const cleaned = content.substring(content.indexOf('{'), content.lastIndexOf('}') + 1)
    const result = JSON.parse(cleaned) as { important: boolean; reasoning: string; summary: string }

    if (!result.important) {
      writeAuditLog({
        actionType: 'Triage',
        threadSubject: thread.subject,
        description: `Triage complete: marked as not critical. Reason: ${result.reasoning}`
      })
      return
    }

    writeAuditLog({
      actionType: 'Triage',
      threadSubject: thread.subject,
      description: `Critical email detected! Reason: ${result.reasoning}. Successfully generated email summary for Telegram.`
    })

    // 2. Format Telegram Alert Message with summary instead of draft
    const alertMsg = `📢 *CRITICAL EMAIL DETECTED*
*From:* ${thread.from}
*Subject:* ${thread.subject}
*Why:* ${result.reasoning}

📝 *AI Email Summary:*
${result.summary}`

    // 3. Send Telegram Alert via official Telegram Bot API if enabled
    if (hasTelegram && persona.telegramBotToken && persona.telegramChatId) {
      const tgUrl = `https://api.telegram.org/bot${persona.telegramBotToken}/sendMessage`
      await fetch(tgUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: persona.telegramChatId,
          text: alertMsg,
          parse_mode: 'Markdown'
        })
      })
      .then(async (tgRes) => {
        if (tgRes.ok) {
          writeAuditLog({
            actionType: 'Triage',
            threadSubject: thread.subject,
            description: `Successfully dispatched Telegram alert notification concierge to Chat ID: ${persona.telegramChatId}`
          })
        } else {
          const tgErr = await tgRes.text()
          writeAuditLog({
            actionType: 'Triage',
            threadSubject: thread.subject,
            description: `Failed to dispatch Telegram bot alert! Telegram API error code ${tgRes.status}: ${tgErr}`
          })
        }
      })
      .catch(err => {
        console.error('Telegram dispatch error:', err)
        writeAuditLog({
          actionType: 'Triage',
          threadSubject: thread.subject,
          description: `Telegram Bot dispatch crashed due to a connection or network error: ${err.message || String(err)}`
        })
      })
    }

  } catch (err) {
    console.error('Failed to run Telegram triage for email:', err)
    writeAuditLog({
      actionType: 'Triage',
      threadSubject: thread.subject || 'Unknown Subject',
      description: `Triage pipeline crashed: ${err instanceof Error ? err.message : String(err)}`
    })
  }
}

export function loadTriagedIds(): Set<string> {
  const fs = require('node:fs')
  const path = require('node:path')
  const { app } = require('electron')
  const file = path.join(app.getPath('userData'), 'telegram_triaged.json')
  try {
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'))
      return new Set(data)
    }
  } catch (err) {
    console.error('Failed to load triaged IDs:', err)
  }
  return new Set()
}

export function saveTriagedId(id: string) {
  const fs = require('node:fs')
  const path = require('node:path')
  const { app } = require('electron')
  const file = path.join(app.getPath('userData'), 'telegram_triaged.json')
  try {
    const ids = loadTriagedIds()
    ids.add(id)
    fs.writeFileSync(file, JSON.stringify(Array.from(ids)), 'utf8')
  } catch (err) {
    console.error('Failed to save triaged ID:', err)
  }
}
