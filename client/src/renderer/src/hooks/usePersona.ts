import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { AiDocument, AiPersona } from '../../../shared/ai'

const KEY = ['ai-persona'] as const

export function usePersona() {
  const qc = useQueryClient()

  const query = useQuery<AiPersona>({
    queryKey: KEY,
    queryFn: async () => {
      const res = await window.quikmail.invoke('ai:persona:get')
      if (!res.ok) throw new Error(res.error.message)
      return res.data
    },
    staleTime: Infinity,
  })

  const saveMutation = useMutation({
    mutationFn: async (next: AiPersona) => {
      const res = await window.quikmail.invoke('ai:persona:set', next)
      if (!res.ok) throw new Error(res.error.message)
      return res.data
    },
    onSuccess: (data) => qc.setQueryData<AiPersona>(KEY, data),
  })

  const addDocMutation = useMutation({
    mutationFn: async (input: { name: string; text: string; source: 'paste' | 'upload'; path?: string; pdfBase64?: string }) => {
      const res = await window.quikmail.invoke('ai:doc:add', input)
      if (!res.ok) throw new Error(res.error.message)
      return res.data as AiDocument
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })

  const removeDocMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await window.quikmail.invoke('ai:doc:remove', id)
      if (!res.ok) throw new Error(res.error.message)
      return res.data
    },
    onSuccess: (data) => qc.setQueryData<AiPersona>(KEY, data),
  })

  return {
    persona: query.data ?? {},
    isLoading: query.isLoading,
    save: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    saveError: saveMutation.error instanceof Error ? saveMutation.error.message : null,
    addDoc: addDocMutation.mutateAsync,
    isAdding: addDocMutation.isPending,
    addError: addDocMutation.error instanceof Error ? addDocMutation.error.message : null,
    removeDoc: removeDocMutation.mutateAsync,
    isRemoving: removeDocMutation.isPending,
  }
}
