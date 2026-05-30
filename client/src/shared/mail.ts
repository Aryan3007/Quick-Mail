export type MailThread = {
  id: string
  threadId: string
  from: string
  fromEmail: string
  subject: string
  preview: string
  receivedAt: string
  unread: boolean
  starred: boolean
  labels: string[]
  category?: string | null
  categoryColor?: string | null
}

export type MailInboxPage = {
  threads: MailThread[]
  nextPageToken?: string
}
