/**
 * Typed IndexedDB wrapper for Murabba
 * Manages 'KufiLetters' database with stores for letters, metadata, and saved drawings.
 */

export const DB_NAME = 'KufiLetters';
export const DB_VERSION = 3;

export type StoreName = 'letters' | 'meta' | 'saves';

/**
 * Opens or initializes the KufiLetters IndexedDB database.
 * Sets up the object stores ('letters', 'meta', 'saves') if they do not exist.
 *
 * @param dbName - Name of the IndexedDB database (defaults to 'KufiLetters')
 * @param version - Version of the IndexedDB database schema (defaults to 3)
 * @returns Promise resolving to the opened IDBDatabase instance
 */
export function openDatabase(
  dbName: string = DB_NAME,
  version: number = DB_VERSION
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this environment.'));
      return;
    }

    const request = indexedDB.open(dbName, version);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const target = event.target as IDBOpenDBRequest;
      const db = target.result;

      if (!db.objectStoreNames.contains('letters')) {
        db.createObjectStore('letters', { keyPath: 'ch' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'k' });
      }
      if (!db.objectStoreNames.contains('saves')) {
        db.createObjectStore('saves', { keyPath: 'id' });
      }
    };

    request.onsuccess = (event: Event) => {
      const target = event.target as IDBOpenDBRequest;
      resolve(target.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to open IndexedDB database.'));
    };

    request.onblocked = () => {
      console.warn('IndexedDB database upgrade blocked: please close other tabs of Murabba.');
    };
  });
}

/**
 * Retrieves all records from the specified object store.
 *
 * @param db - Open IDBDatabase instance
 * @param storeName - Name of the object store to query
 * @returns Promise resolving to an array of all items in the store
 */
export function getAll<T>(db: IDBDatabase, storeName: StoreName | string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve((request.result as T[]) || []);
      };

      request.onerror = () => {
        reject(request.error || new Error(`Failed to getAll from store "${storeName}".`));
      };
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Retrieves a single record by key from the specified object store.
 *
 * @param db - Open IDBDatabase instance
 * @param storeName - Name of the object store
 * @param key - Key of the record to retrieve
 * @returns Promise resolving to the record if found, or null otherwise
 */
export function get<T>(
  db: IDBDatabase,
  storeName: StoreName | string,
  key: IDBValidKey
): Promise<T | null> {
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result !== undefined ? (result as T) : null);
      };

      request.onerror = () => {
        reject(request.error || new Error(`Failed to get key "${String(key)}" from store "${storeName}".`));
      };
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Inserts or updates a record in the specified object store.
 *
 * @param db - Open IDBDatabase instance
 * @param storeName - Name of the object store
 * @param data - The data object to store
 * @returns Promise resolving when transaction completes successfully
 */
export function put<T>(db: IDBDatabase, storeName: StoreName | string, data: T): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      store.put(data);

      transaction.oncomplete = () => {
        resolve();
      };

      transaction.onerror = () => {
        reject(transaction.error || new Error(`Failed to put data into store "${storeName}".`));
      };

      transaction.onabort = () => {
        reject(transaction.error || new Error(`Transaction aborted on store "${storeName}".`));
      };
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Deletes a record by key from the specified object store.
 *
 * @param db - Open IDBDatabase instance
 * @param storeName - Name of the object store
 * @param key - Key of the record to delete
 * @returns Promise resolving when transaction completes successfully
 */
export function deleteKey(
  db: IDBDatabase,
  storeName: StoreName | string,
  key: IDBValidKey
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      store.delete(key);

      transaction.oncomplete = () => {
        resolve();
      };

      transaction.onerror = () => {
        reject(transaction.error || new Error(`Failed to delete key "${String(key)}" from store "${storeName}".`));
      };

      transaction.onabort = () => {
        reject(transaction.error || new Error(`Transaction aborted on store "${storeName}".`));
      };
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Clears all records from the specified object store.
 *
 * @param db - Open IDBDatabase instance
 * @param storeName - Name of the object store to clear
 * @returns Promise resolving when transaction completes successfully
 */
export function clearStore(db: IDBDatabase, storeName: StoreName | string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      store.clear();

      transaction.oncomplete = () => {
        resolve();
      };

      transaction.onerror = () => {
        reject(transaction.error || new Error(`Failed to clear store "${storeName}".`));
      };

      transaction.onabort = () => {
        reject(transaction.error || new Error(`Transaction aborted on store "${storeName}".`));
      };
    } catch (err) {
      reject(err);
    }
  });
}
