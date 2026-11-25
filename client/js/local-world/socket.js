import { openLocalSession } from './session.js';

function workerSource() {
  if (typeof __LOCAL_WORLD_WORKER_SOURCE__ === 'string') {
    const url = URL.createObjectURL(new Blob([__LOCAL_WORLD_WORKER_SOURCE__], { type: 'text/javascript' }));
    return { url, classic: true, release: () => URL.revokeObjectURL(url) };
  }
  return { url: new URL('./worker.js', import.meta.url) };
}

// Implement the play-state socket interface used by Connection's packet decoder.
export class LocalWorldSocket {
  constructor(platform, options) {
    this.platform = platform;
    this.options = options;
    this.listeners = new Map();
  }

  on(type, listener) {
    this.listeners.set(type, listener);
  }

  emit(type, value) {
    this.listeners.get(type)?.(value);
  }

  async start() {
    const source = workerSource();
    try {
      const worker = this.platform.createWorker(source.url, { classic: source.classic });
      if (!worker) throw new Error('This browser could not start a local world worker.');
      this.opening = openLocalSession(worker, {
        initialization: this.options,
        onMessage: ({ data }) => {
          if (this.closing || this.closed) return;
          if (data.type === 'packet') this.emit('binary', data.bytes);
          if (data.type === 'control') this.emit('text', JSON.stringify(data.message));
          if (data.type === 'metrics') this.metrics = data.metrics;
        },
        onStop: (error) => {
          if (this.session && !this.closing) this.fail(error);
        },
      });
      this.session = await this.opening;
    } finally {
      source.release?.();
    }
    if (!this.closing) await this.session.send({ type: 'start' });
  }

  sendBinary(packet) {
    if (!this.session || this.closing || this.closed) return;
    this.session.send({ type: 'packet', bytes: packet }).catch(error => this.fail(error));
  }

  fail(error) {
    if (this.closing || this.closed) return;
    this.emit('text', JSON.stringify({ type: 'error', message: error.message }));
    this.close().catch(() => {});
  }

  close() {
    this.closing ??= Promise.resolve(this.opening).catch(() => null)
      .then(session => session?.close())
      .finally(() => {
        this.closed = true;
        this.emit('close');
      });
    return this.closing;
  }
}
