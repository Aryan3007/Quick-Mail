import { readSecret, writeSecret } from '../secure-store'
import { writeAuditLog } from './audit'
import { authHeaders } from '../auth/device'
import { API_BASE_URL } from '../config'
import { getValidAccessToken } from '../auth/google'
import type { TriageCategory } from '../../shared/ai'
import { updateThreadInCache } from './index'

const RULES_SECRET = 'ai-triage-rules'
const CATEGORIES_SECRET = 'ai-triage-categories'
const THREAD_CATEGORIES_SECRET = 'ai-thread-categories'

const DEFAULT_CATEGORIES: TriageCategory[] = [
  {
    id: 'job-apps',
    name: 'Job Applications',
    prompt: 'Emails about job roles, recruiter reachouts, offer letters, status updates, or interview loops.',
    color: 'hsl(142, 60%, 45%)', // Elegant green
  },
  {
    id: 'billing',
    name: 'Billing',
    prompt: 'Invoices, receipts, subscription alerts, statements, or payment confirmations.',
    color: 'hsl(24, 95%, 53%)', // Elegant orange
  },
  {
    id: 'newsletters',
    name: 'Newsletters',
    prompt: 'Substack digests, Medium articles, developer updates, marketing blasts, or announcements.',
    color: 'hsl(263, 70%, 50%)', // Elegant purple
  },
  {
    id: 'personal',
    name: 'Personal',
    prompt: 'Direct messages from friends, family members, or one-on-one personal interactions.',
    color: 'hsl(45, 93%, 47%)', // Elegant yellow
  },
]

export function getTriageRules(): string {
  try {
    return readSecret<{ rules: string }>(RULES_SECRET)?.rules ?? ''
  } catch {
    return ''
  }
}

export function setTriageRules(rules: string): string {
  try {
    writeSecret(RULES_SECRET, { rules })
  } catch (err) {
    console.error('Failed to save triage rules:', err)
  }
  return rules
}

export function getTriageCategories(): TriageCategory[] {
  try {
    const saved = readSecret<TriageCategory[]>(CATEGORIES_SECRET)
    if (saved && Array.isArray(saved) && saved.length > 0) {
      return saved
    }
    // Set and return defaults on first run
    writeSecret(CATEGORIES_SECRET, DEFAULT_CATEGORIES)
    return DEFAULT_CATEGORIES
  } catch (err) {
    console.error('Failed to get triage categories:', err)
    return DEFAULT_CATEGORIES
  }
}

export function setTriageCategories(categories: TriageCategory[]): TriageCategory[] {
  try {
    writeSecret(CATEGORIES_SECRET, categories)
  } catch (err) {
    console.error('Failed to set triage categories:', err)
  }
  return categories
}

export function getThreadCategories(): Record<string, string> {
  try {
    return readSecret<Record<string, string>>(THREAD_CATEGORIES_SECRET) ?? {}
  } catch {
    return {}
  }
}

export function setThreadCategories(mapping: Record<string, string>): Record<string, string> {
  try {
    writeSecret(THREAD_CATEGORIES_SECRET, mapping)
  } catch (err) {
    console.error('Failed to set thread categories:', err)
  }
  return mapping
}

export async function triageIncomingEmails(threads: any[]): Promise<void> {
  const categories = getTriageCategories()
  if (categories.length === 0 || threads.length === 0) return

  // Triage only the first 5 threads during routine bg sync to prevent rate limits
  const candidateThreads = threads.slice(0, 5)

  // Construct context of emails to triage
  const emailDescriptions = candidateThreads.map(
    (t) => `ThreadID: ${t.id} | From: ${t.from} | Subject: ${t.subject} | Snippet: ${t.preview}`,
  )

  const categoriesDescription = categories
    .map((c) => `- Category: "${c.name}"\n  Prompt Rule: ${c.prompt}`)
    .join('\n\n')

  const systemPrompt = `You are a professional email triage assistant.
We have configured a list of active category rules for sorting incoming emails:
[CATEGORIES]
${categoriesDescription}
[/CATEGORIES]

Your job is to analyze the following email threads and decide if they match any of the categories above.
For each email, decide:
1. "shouldArchive": true if the category definition or standard email rules suggest archiving, skipping inbox, archiving billing/newsletters, etc. Else false.
2. "applyLabel": the exact Name of the category matching the rule (must be one of: ${categories.map((c) => `"${c.name}"`).join(', ')}), or null if no categories apply.
3. "explanation": a concise 1-sentence description of what category rule was matched and why.

You MUST respond with a valid JSON array of objects, containing precisely these keys. Do not include markdown code block syntax (like \`\`\`json) or any conversational text.
Example format:
[
  {
    "threadId": "msg_123",
    "shouldArchive": false,
    "applyLabel": "Job Applications",
    "explanation": "Categorized as Job Applications because it is a recruiter reachout about a Frontend Developer role."
  }
]`

  try {
    const res = await fetch(`${API_BASE_URL}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(await authHeaders()),
      },
      body: JSON.stringify({
        system: systemPrompt,
        messages: [{ role: 'user', content: `Analyze these threads:\n${emailDescriptions.join('\n')}` }],
        stream: true,
      }),
    })

    if (!res.ok) return

    const reader = res.body?.getReader()
    if (!reader) return

    const decoder = new TextDecoder()
    let accumulatedText = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      accumulatedText += decoder.decode(value, { stream: true })
    }

    // Parse the Server-Sent Events structure to extract the text
    const lines = accumulatedText.split('\n')
    let jsonText = ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('data:')) {
        try {
          const parsed = JSON.parse(trimmed.slice(5).trim())
          if (parsed.type === 'text_delta' && parsed.text) {
            jsonText += parsed.text
          }
        } catch {
          // ignore
        }
      }
    }

    // Clean any accidental markdown code blocks
    const cleanedJson = jsonText.replace(/```json/g, '').replace(/```/g, '').trim()
    const actions = JSON.parse(cleanedJson) as Array<{
      threadId: string
      shouldArchive: boolean
      applyLabel: string | null
      explanation: string
    }>

    if (!Array.isArray(actions)) return

    const threadCategories = getThreadCategories()

    // Execute the actions
    for (const action of actions) {
      const thread = candidateThreads.find((x) => x.id === action.threadId)
      if (!thread) continue

      // Map dynamic labels to category IDs
      const matchedCategory = categories.find((c) => c.name === action.applyLabel)
      if (matchedCategory) {
        threadCategories[action.threadId] = matchedCategory.id
        // Also update local cache so it updates instantly!
        updateThreadInCache(action.threadId, {
          category: matchedCategory.name,
          categoryColor: matchedCategory.color,
        })
      }

      // Log triage actions to AI Audit Log!
      writeAuditLog({
        actionType: 'Triage',
        threadSubject: thread.subject,
        description: action.explanation,
      })

      // If archiving: execute remove label 'INBOX' via Gmail API
      if (action.shouldArchive) {
        try {
          const accessToken = await getValidAccessToken()
          await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${action.threadId}/modify`, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${accessToken}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              removeLabelIds: ['INBOX'],
            }),
          })
          console.log(`[Triage] Successfully archived thread: ${action.threadId}`)
        } catch (err) {
          console.error(`[Triage] Failed to archive email:`, err)
        }
      }
    }

    setThreadCategories(threadCategories)
  } catch (err) {
    console.error('Triage process failed:', err)
  }
}

export async function triageIncomingEmailsRetroactive(threads: any[]): Promise<void> {
  // Retroactive triage classifies up to 15 threads to populate the UI immediately
  await triageIncomingEmails(threads.slice(0, 15))
}
