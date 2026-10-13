/* Marcas para guía - almacenamiento local (IndexedDB). Nada se sube a ningún servidor. */
(function (global) {
  'use strict';

  const DB_NAME = 'marcas-guia';
  const DB_VERSION = 1;
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('guides')) db.createObjectStore('guides', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('marks')) db.createObjectStore('marks', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('frames')) db.createObjectStore('frames');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  function tx(store, mode, fn) {
    return open().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      let result;
      const r = fn(t);
      if (r && 'onsuccess' in r) r.onsuccess = () => { result = r.result; };
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }

  const DB = {
    listGuides() { return tx('guides', 'readonly', (t) => t.objectStore('guides').getAll()); },
    putGuide(g) { g.updatedAt = Date.now(); return tx('guides', 'readwrite', (t) => t.objectStore('guides').put(g)); },
    deleteGuide(id) { return tx('guides', 'readwrite', (t) => t.objectStore('guides').delete(id)); },
    getMark(id) { return tx('marks', 'readonly', (t) => t.objectStore('marks').get(id)); },
    putMark(m) { return tx('marks', 'readwrite', (t) => t.objectStore('marks').put(m)); },
    deleteMark(id) {
      return open().then((db) => new Promise((resolve, reject) => {
        const t = db.transaction(['marks', 'frames'], 'readwrite');
        t.objectStore('marks').delete(id);
        t.objectStore('frames').delete(id);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      }));
    },
    putFrame(id, blob) { return tx('frames', 'readwrite', (t) => t.objectStore('frames').put(blob, id)); },
    getFrame(id) { return tx('frames', 'readonly', (t) => t.objectStore('frames').get(id)); },
    async getMarks(ids) {
      const out = {};
      await Promise.all(ids.map(async (id) => { const m = await DB.getMark(id); if (m) out[id] = m; }));
      return out;
    },
    async persist() {
      try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { /* nada */ }
    }
  };

  global.DB = DB;
})(typeof window !== 'undefined' ? window : globalThis);
