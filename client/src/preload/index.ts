import { contextBridge, ipcRenderer } from 'electron'

import {
  IPC_CHANNELS,
  IPC_EVENTS,
  type IpcChannel,
  type IpcChannels,
  type IpcEvent,
  type IpcEvents,
  type IpcResult,
} from '../shared/ipc'

type InvokeReturn<C extends IpcChannel> = ReturnType<IpcChannels[C]>
type InvokeArgs<C extends IpcChannel> = Parameters<IpcChannels[C]>

const api = {
  invoke: <C extends IpcChannel>(channel: C, ...args: InvokeArgs<C>): Promise<InvokeReturn<C>> => {
    if (!IPC_CHANNELS.includes(channel)) {
      return Promise.resolve({
        ok: false,
        error: { code: 'unknown_channel', message: `Unknown IPC channel: ${channel}` },
      } as IpcResult<never> as InvokeReturn<C>)
    }
    return ipcRenderer.invoke(channel, ...args) as Promise<InvokeReturn<C>>
  },
  on: <E extends IpcEvent>(event: E, listener: (payload: IpcEvents[E]) => void): (() => void) => {
    if (!IPC_EVENTS.includes(event)) {
      console.warn(`Unknown IPC event: ${event}`)
      return () => {}
    }
    const handler = (_e: unknown, payload: IpcEvents[E]) => listener(payload)
    ipcRenderer.on(event, handler)
    return () => ipcRenderer.removeListener(event, handler)
  },
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('quikmail', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore exposing on window for non-isolated dev only
  window.quikmail = api
}

export type QuikmailApi = typeof api
