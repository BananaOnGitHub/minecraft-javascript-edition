// A dedicated worker owns each session. The channel carries structured data,
// with optional ownership transfer for large binary payloads.
export async function openLocalSession(worker, options = {}) {
  const { initialization, onMessage, onStop, timeoutMs = 5000 } = options
  const { port1, port2 } = new MessageChannel()
  const events = new EventTarget()
  const pending = new Map()
  let nextId = 0
  let closing
  let stopped = false
  if (onMessage) events.addEventListener('message', onMessage)

  function stop(reason) {
    if (stopped) return
    stopped = true
    port1.close()
    worker.removeEventListener('error', onWorkerError)
    worker.terminate()
    for (const { reject } of pending.values()) reject(reason)
    pending.clear()
    onStop?.(reason)
  }

  function onWorkerError(event) {
    stop(event.error ?? new Error(event.message || 'Local worker failed'))
  }

  function request(kind, fields = {}, transfer = []) {
    if (stopped) return Promise.reject(new Error('Local session is closed'))
    const id = nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        stop(new Error(`Local session timed out during ${kind}`))
      }, timeoutMs)
      pending.set(id, {
        resolve(value) {
          clearTimeout(timer)
          resolve(value)
        },
        reject(error) {
          clearTimeout(timer)
          reject(error)
        },
      })
      try {
        port1.postMessage({ kind, id, ...fields }, transfer)
      } catch (error) {
        pending.get(id).reject(error)
        pending.delete(id)
      }
    })
  }

  port1.onmessage = ({ data }) => {
    if (data?.kind === 'event') {
      events.dispatchEvent(new MessageEvent('message', { data: data.value }))
      return
    }
    if (data?.kind !== 'result') return
    const operation = pending.get(data.id)
    if (!operation) return
    pending.delete(data.id)
    if (data.ok) operation.resolve(data.value)
    else operation.reject(new Error(data.error))
  }
  port1.onmessageerror = () => stop(new Error('Invalid local session reply'))
  worker.addEventListener('error', onWorkerError)

  try {
    worker.postMessage({ kind: 'local-session', port: port2 }, [port2])
    await request('open', { initialization })
  } catch (error) {
    port2.close()
    stop(error)
    throw error
  }

  return {
    events,
    send(value, transfer) {
      if (closing) return Promise.reject(new Error('Local session is closing'))
      return request('command', { value }, transfer)
    },
    close() {
      if (stopped && !closing) return Promise.resolve()
      closing ??= request('close').finally(() => stop(new Error('Local session is closed')))
      return closing
    },
  }
}

// Pass the dedicated worker global scope here. Only one session can attach.
// Commands run in arrival order, even when their handlers are asynchronous.
export function serveLocalSession(scope, createSession) {
  function connect({ data }) {
    if (data?.kind !== 'local-session' || !data.port) return
    scope.removeEventListener('message', connect)
    const port = data.port
    let queue = Promise.resolve()
    let session

    function emit(value, transfer = []) {
      port.postMessage({ kind: 'event', value }, transfer)
    }

    function reply(id, value, transfer = []) {
      port.postMessage({ kind: 'result', id, ok: true, value }, transfer)
    }

    async function handle({ kind, id, initialization, value }) {
      try {
        if (kind === 'open' && !session) {
          session = await createSession(initialization, emit)
          reply(id)
          return
        }
        if (kind === 'close') {
          await session?.close?.()
          reply(id)
          port.close()
          return
        }
        if (kind !== 'command' || !session) throw new Error('Invalid local session command')
        const result = await session.handle(value)
        reply(id, result?.value, result?.transfer)
      } catch (error) {
        port.postMessage({ kind: 'result', id, ok: false, error: error?.message ?? String(error) })
      }
    }

    port.onmessage = ({ data: message }) => {
      queue = queue.then(() => handle(message))
    }
  }

  scope.addEventListener('message', connect)
}
