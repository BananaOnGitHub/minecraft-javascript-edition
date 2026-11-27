import { uniqueDirectory } from './world-metadata.js';

export const WORLD_DATABASE = 'minecraftjs-terrace-worlds'
const STORE = 'checkpoints'
const CHUNKS = 'world-chunks'
const POPULATION = 'world-population'

export function openCheckpointStore(databaseName, indexedDB = globalThis.indexedDB) {
  return new Promise((resolve, reject) => {
    if (!indexedDB) throw new Error('Local world storage is unavailable in this browser')
    const request = indexedDB.open(databaseName, 3)
    let blocked = false
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' })
      if (!request.result.objectStoreNames.contains(CHUNKS)) request.result.createObjectStore(CHUNKS, { keyPath: ['worldId', 'x', 'z'] })
      if (!request.result.objectStoreNames.contains(POPULATION)) request.result.createObjectStore(POPULATION, { keyPath: ['worldId', 'generatorId', 'stageId', 'x', 'z'] })
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => {
      blocked = true
      reject(new Error('Checkpoint database is blocked by another tab'))
    }
    request.onsuccess = () => {
      const database = request.result
      if (blocked) {
        database.close()
        return
      }
      database.onversionchange = () => database.close()
      resolve(checkpointStore(database))
    }
  })
}

function checkpointStore(database) {
  // Resolve writes only after IndexedDB commits the entire transaction.
  function transact(mode, useStore, storeName = STORE) {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, mode)
      let result
      let failure
      transaction.oncomplete = () => resolve(result)
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('Checkpoint transaction aborted'))
      const complete = (value) => { result = value }
      const abort = (error) => {
        failure = error
        transaction.abort()
      }
      try {
        useStore(transaction.objectStore(storeName), complete, abort)
      } catch (error) {
        abort(error)
      }
    })
  }

  function save(id, expectedRevision, state) {
    return transact('readwrite', (store, complete, abort) => {
      const read = store.get(id)
      read.onsuccess = () => {
        const record = read.result
        if (!record || record.revision !== expectedRevision) {
          abort(new Error('Checkpoint revision conflict'))
          return
        }
        try {
          const next = { ...record, state, revision: record.revision + 1, savedAt: Date.now() }
          store.put(next)
          complete({ id, revision: next.revision, savedAt: next.savedAt })
        } catch (error) {
          abort(error)
        }
      }
    })
  }

  return {
    createWorld(state) {
      return transact('readwrite', (store, complete) => {
        const names = new Set()
        const read = store.openCursor()
        read.onsuccess = () => {
          const cursor = read.result
          if (cursor) {
            names.add((cursor.value.state.directory ?? String(cursor.primaryKey)).toLowerCase())
            cursor.continue()
            return
          }
          state.directory = uniqueDirectory(state.directory, names)
          const record = { id: state.id, state, revision: 1, savedAt: Date.now() }
          store.add(record)
          complete(record)
        }
      })
    },
    create(id, state) {
      return transact('readwrite', (store, complete) => {
        const record = { id, state, revision: 1, savedAt: Date.now() }
        store.add(record)
        complete({ id, revision: record.revision, savedAt: record.savedAt })
      })
    },
    load(id) {
      return transact('readonly', (store, complete) => {
        const read = store.get(id)
        read.onsuccess = () => complete(read.result)
      })
    },
    list() {
      return transact('readonly', (store, complete) => {
        // A key cursor avoids loading saved state into memory.
        const read = store.openKeyCursor()
        const ids = []
        read.onsuccess = () => {
          const cursor = read.result
          if (!cursor) {
            complete(ids)
            return
          }
          ids.push(cursor.primaryKey)
          cursor.continue()
        }
      })
    },
    summaries() {
      return transact('readonly', (store, complete) => {
        const read = store.openCursor()
        const summaries = []
        read.onsuccess = () => {
          const cursor = read.result
          if (!cursor) { complete(summaries); return }
          const { id, state, savedAt } = cursor.value
          summaries.push({ id, displayName: state.displayName ?? id, directory: state.directory ?? id, savedAt })
          cursor.continue()
        }
      })
    },
    loadChunk(worldId, x, z) {
      return transact('readonly', (store, complete) => {
        const read = store.get([worldId, x, z])
        read.onsuccess = () => complete(read.result)
      }, CHUNKS)
    },
    saveChunk(record) {
      // The first committed base column is immutable for this world. Two tabs
      // may independently generate it before either transaction begins.
      return transact('readwrite', (store, complete) => {
        const read = store.get([record.worldId, record.x, record.z])
        read.onsuccess = () => {
          if (!read.result) store.add(record)
          complete(read.result ?? record)
        }
      }, CHUNKS)
    },
    loadPopulation(worldId, generatorId, stageId, x, z) {
      return transact('readonly', (store, complete) => {
        const read = store.get([worldId, generatorId, stageId, x, z])
        read.onsuccess = () => complete(read.result)
      }, POPULATION)
    },
    savePopulation(record) {
      // A complete source batch (including an empty batch) is the completion
      // marker. Its cross-column changes commit together and cannot be replayed
      // partially after a reload. Competing writers keep the first durable plan.
      return transact('readwrite', (store, complete) => {
        const read = store.get([record.worldId, record.generatorId, record.stageId, record.x, record.z])
        read.onsuccess = () => {
          if (!read.result) store.add(record)
          complete(read.result ?? record)
        }
      }, POPULATION)
    },
    commitStatefulPopulation(record, expectedRevision) {
      // The journal includes generation writes, lights, RNG/instance state and
      // source completion. Publish all of it in one compare-and-swap transaction.
      return transact('readwrite', (store, complete, abort) => {
        const read = store.get([record.worldId, record.generatorId, record.stageId, 0, 0])
        read.onsuccess = () => {
          if ((read.result?.revision ?? 0) !== expectedRevision) {
            abort(new Error('Stateful population revision conflict'))
            return
          }
          const next = { ...record, x: 0, z: 0, revision: expectedRevision + 1 }
          store.put(next)
          complete(next)
        }
      }, POPULATION)
    },
    save,
    close() {
      database.close()
    },
  }
}
