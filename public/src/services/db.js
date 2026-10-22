// IndexedDB wrapper for offline storage

const DB_NAME = 'life-skill-offline';
const DB_VERSION = 1;

const PENDING_STORES = ['pendingDistributions', 'pendingCollections', 'pendingTransfers', 'pendingAreas'];

let dbInstance = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      PENDING_STORES.forEach((name) => {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'clientId' });
        }
      });
      if (!db.objectStoreNames.contains('cachedData')) {
        db.createObjectStore('cachedData', { keyPath: 'key' });
      }
    };

    request.onsuccess = (e) => {
      dbInstance = e.target.result;
      dbInstance.onclose = () => { dbInstance = null; };
      resolve(dbInstance);
    };

    request.onerror = (e) => {
      reject(new Error('Failed to open database: ' + e.target.error));
    };
  });
}

const db = {
  async initDB() {
    await openDB();
  },

  async addPending(store, data) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(store, 'readwrite');
      const os = tx.objectStore(store);
      const item = {
        ...data,
        clientId: data.clientId || crypto.randomUUID(),
        syncStatus: data.syncStatus || 'waiting_sync', // 'saved_locally', 'waiting_sync', 'synced', 'conflict_flagged'
        createdAt: data.createdAt || new Date().toISOString(),
        lastAttemptAt: null,
        retryCount: 0
      };
      const req = os.put(item);
      req.onsuccess = () => resolve(item);
      req.onerror = (e) => reject(new Error('Failed to save: ' + e.target.error));
    });
  },

  async updatePendingStatus(store, clientId, status, extra = {}) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(store, 'readwrite');
      const os = tx.objectStore(store);
      const getReq = os.get(clientId);
      getReq.onsuccess = () => {
        if (!getReq.result) return resolve(null);
        const updated = {
          ...getReq.result,
          syncStatus: status,
          lastAttemptAt: new Date().toISOString(),
          retryCount: (getReq.result.retryCount || 0) + 1,
          ...extra
        };
        const putReq = os.put(updated);
        putReq.onsuccess = () => resolve(updated);
        putReq.onerror = (e) => reject(new Error('Failed to update: ' + e.target.error));
      };
      getReq.onerror = (e) => reject(new Error('Failed to fetch item: ' + e.target.error));
    });
  },

  async getPending(store) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(store, 'readonly');
      const os = tx.objectStore(store);
      const req = os.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(new Error('Failed to read: ' + e.target.error));
    });
  },

  async removePending(store, clientId) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(store, 'readwrite');
      const os = tx.objectStore(store);
      const req = os.delete(clientId);
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(new Error('Failed to remove: ' + e.target.error));
    });
  },

  async getPendingCount() {
    const database = await openDB();
    let total = 0;
    for (const store of PENDING_STORES) {
      const count = await new Promise((resolve, reject) => {
        const tx = database.transaction(store, 'readonly');
        const req = tx.objectStore(store).count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(0);
      });
      total += count;
    }
    return total;
  },

  async cacheData(key, data) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('cachedData', 'readwrite');
      const os = tx.objectStore('cachedData');
      const req = os.put({ key, data, cachedAt: new Date().toISOString() });
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(new Error('Failed to cache: ' + e.target.error));
    });
  },

  async getCachedData(key) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('cachedData', 'readonly');
      const req = tx.objectStore('cachedData').get(key);
      req.onsuccess = () => resolve(req.result ? req.result.data : null);
      req.onerror = () => resolve(null);
    });
  },

  async clearAll() {
    const database = await openDB();
    const allStores = [...PENDING_STORES, 'cachedData'];
    for (const store of allStores) {
      await new Promise((resolve, reject) => {
        const tx = database.transaction(store, 'readwrite');
        const req = tx.objectStore(store).clear();
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      });
    }
  }
};

export default db;
