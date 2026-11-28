// The lock is owned by the gameplay worker, not the requesting UI tab.
export async function acquireWorldOwnership(worldId, locks = globalThis.navigator?.locks) {
  if (typeof worldId !== 'string' || !worldId) throw new TypeError('A world ID is required');
  if (!locks || typeof locks.request !== 'function') throw new Error('This experimental world requires Web Locks in a secure browser context.');
  let releaseHold, announce;
  const acquired = new Promise((resolve, reject) => { announce = {resolve, reject}; });
  const hold = new Promise(resolve => { releaseHold = resolve; });
  let task;
  try {
    task = Promise.resolve(locks.request(`minecraftjs:world:${worldId}`, {mode:'exclusive', ifAvailable:true}, async lock => {
      if (!lock) { announce.reject(new Error('This world is already open in another tab or worker.')); return; }
      announce.resolve();
      await hold;
    }));
    task.catch(error => announce.reject(error));
    await acquired;
  } catch (error) {
    releaseHold();
    if (task) await task.catch(()=>{});
    throw error;
  }
  let closing;
  return {release() { return closing ??= (releaseHold(), task); }};
}
