export const WORLD_DATABASE = 'minecraftjs-terrace-worlds'
const STORE = 'checkpoints'

export function openCheckpointStore(databaseName, indexedDB = globalThis.indexedDB) {
  return new Promise((resolve, reject) => {
    if (!indexedDB) throw new Error('Local world storage is unavailable in this browser')
    const request = indexedDB.open(databaseName, 1)
    let blocked = false
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'id' })
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
  function transact(mode, useStore) {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, mode)
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
        useStore(transaction.objectStore(STORE), complete, abort)
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
    save,
    close() {
      database.close()
    },
  }
}
