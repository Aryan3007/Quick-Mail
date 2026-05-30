import { useInfiniteQuery, useQuery } from '@tanstack/react-query'

import type { MailInboxPage } from '../../../shared/mail'
import type { MailFolder } from '../store/ui'

const PAGE_SIZE = 30

type InboxPageResult =
  | { ok: true; page: MailInboxPage }
  | { ok: false; code: string; message: string }

async function fetchInboxPage(pageToken?: string): Promise<InboxPageResult> {
  const args: { maxResults: number; pageToken?: string } = { maxResults: PAGE_SIZE }
  if (pageToken) args.pageToken = pageToken
  const res = await window.quikmail.invoke('mail:list:inbox', args)
  if (res.ok) return { ok: true, page: res.data }
  return { ok: false, code: res.error.code, message: res.error.message }
}

export function useInbox() {
  const query = useInfiniteQuery({
    queryKey: ['inbox'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchInboxPage(pageParam),
    getNextPageParam: (last) => (last.ok ? last.page.nextPageToken : undefined),
  })

  const pages = query.data?.pages ?? []
  const firstPage = pages[0]
  const apiError = firstPage && !firstPage.ok ? firstPage : null
  const threads = pages.flatMap((p) => (p.ok ? p.page.threads : []))

  return {
    threads,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error instanceof Error ? query.error.message : null,
    apiError,
    refetch: query.refetch,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  }
}

export function useThread(id: string | null) {
  return useQuery({
    queryKey: ['thread', id],
    enabled: id !== null,
    queryFn: async () => {
      if (!id) throw new Error('no_id')
      const res = await window.quikmail.invoke('mail:get', id)
      if (!res.ok) throw new Error(res.error.message)
      return res.data
    },
  })
}

async function fetchFolderPage(folder: MailFolder, pageToken?: string): Promise<InboxPageResult> {
  if (folder === 'inbox') return fetchInboxPage(pageToken)
  const args: { folder: MailFolder; maxResults: number; pageToken?: string } = { folder: folder as any, maxResults: PAGE_SIZE }
  if (pageToken) args.pageToken = pageToken
  const res = await window.quikmail.invoke('mail:list:folder', args as any)
  if (res.ok) return { ok: true, page: res.data }
  return { ok: false, code: (res as any).error.code, message: (res as any).error.message }
}

export function useFolder(folder: MailFolder) {
  const query = useInfiniteQuery({
    queryKey: ['folder', folder],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchFolderPage(folder, pageParam),
    getNextPageParam: (last) => (last.ok ? last.page.nextPageToken : undefined),
    enabled: folder !== 'inbox',
  })

  const pages = query.data?.pages ?? []
  const firstPage = pages[0]
  const apiError = firstPage && !firstPage.ok ? firstPage : null
  const threads = pages.flatMap((p) => (p.ok ? p.page.threads : []))

  return {
    threads,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error instanceof Error ? query.error.message : null,
    apiError,
    refetch: query.refetch,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  }
}
