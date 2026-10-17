// IndexedDB 封裝(background、popup、history 共用)
const PVDB = (() => {
  let dbp;
  const open = () => (dbp ||= new Promise((resolve, reject) => {
    const r = indexedDB.open('promptvault', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('records', { keyPath: 'id' }).createIndex('ts', 'ts');
      d.createObjectStore('blobs', { keyPath: 'hash' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
  const op = (name, mode, fn) => open().then((d) => new Promise((resolve, reject) => {
    const rq = fn(d.transaction(name, mode).objectStore(name));
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  }));
  return {
    putRecord: (r) => op('records', 'readwrite', (s) => s.put(r)),
    putBlob: (b) => op('blobs', 'readwrite', (s) => s.put(b)),
    getBlob: (h) => op('blobs', 'readonly', (s) => s.get(h)),
    allRecords: () => op('records', 'readonly', (s) => s.getAll()),
    count: () => op('records', 'readonly', (s) => s.count()),
    async deleteRecord(id, hash) {
      await op('records', 'readwrite', (s) => s.delete(id));
      if (hash) {
        const rest = await this.allRecords();
        if (!rest.some((r) => r.hash === hash)) await op('blobs', 'readwrite', (s) => s.delete(hash));
      }
    },
    async clear() {
      await op('records', 'readwrite', (s) => s.clear());
      await op('blobs', 'readwrite', (s) => s.clear());
    }
  };
})();