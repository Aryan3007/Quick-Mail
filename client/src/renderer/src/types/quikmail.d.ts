import type {
  IpcChannel,
  IpcChannels,
  IpcEvent,
  IpcEvents,
} from '../../../shared/ipc'

declare global {
  interface Window {
    quikmail: {
      invoke<C extends IpcChannel>(
        channel: C,
        ...args: Parameters<IpcChannels[C]>
      ): Promise<ReturnType<IpcChannels[C]>>
      on<E extends IpcEvent>(event: E, listener: (payload: IpcEvents[E]) => void): () => void
    }
  }
}

export {}
