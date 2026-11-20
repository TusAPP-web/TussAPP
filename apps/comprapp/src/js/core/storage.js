const DATABASE_NAME = "comprapp-local";
const DATABASE_VERSION = 1;

const STORE_DEFINITIONS = {
  preferences: { keyPath: "key" },
  shoppingLists: { keyPath: "id" },
  favorites: { keyPath: "productId" },
  catalogCache: { keyPath: "id" },
  syncQueue: {
    keyPath: "id",
    indexes: [
      ["status", "status", { unique: false }],
      ["createdAt", "createdAt", { unique: false }]
    ]
  }
};

let databasePromise;

function openDatabase() {
  if (!("indexedDB" in window)) {
    return Promise.reject(new Error("Este navegador no ofrece almacenamiento IndexedDB."));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      for (const [storeName, definition] of Object.entries(STORE_DEFINITIONS)) {
        if (database.objectStoreNames.contains(storeName)) continue;
        const store = database.createObjectStore(storeName, { keyPath: definition.keyPath });
        for (const [indexName, keyPath, options] of definition.indexes || []) {
          store.createIndex(indexName, keyPath, options);
        }
      }
    };

    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = undefined;
      };
      resolve(database);
    };

    request.onerror = () => {
      databasePromise = undefined;
      reject(request.error || new Error("No se pudo abrir la base local de ComprAPP."));
    };

    request.onblocked = () => {
      console.warn("La actualización de la base local está bloqueada por otra pestaña de ComprAPP.");
    };
  });

  return databasePromise;
}

function assertStore(storeName) {
  if (!Object.hasOwn(STORE_DEFINITIONS, storeName)) {
    throw new Error("Almacén local no reconocido: " + storeName);
  }
}

async function runRequest(storeName, mode, createRequest) {
  assertStore(storeName);
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const request = createRequest(transaction.objectStore(storeName));
    let result;

    request.onsuccess = () => {
      result = request.result;
    };
    request.onerror = () => reject(request.error || new Error("Falló una operación de almacenamiento local."));
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error || new Error("Falló la transacción local."));
    transaction.onabort = () => reject(transaction.error || new Error("Se canceló la transacción local."));
  });
}

export function getRecord(storeName, key) {
  return runRequest(storeName, "readonly", (store) => store.get(key));
}

export function getAllRecords(storeName) {
  return runRequest(storeName, "readonly", (store) => store.getAll());
}

export function saveRecord(storeName, record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return Promise.reject(new TypeError("El registro debe ser un objeto."));
  }
  return runRequest(storeName, "readwrite", (store) => store.put(record));
}

export function deleteRecord(storeName, key) {
  return runRequest(storeName, "readwrite", (store) => store.delete(key));
}

export function clearStore(storeName) {
  return runRequest(storeName, "readwrite", (store) => store.clear());
}

export async function checkLocalStorage() {
  try {
    const database = await openDatabase();
    return {
      available: true,
      database: database.name,
      version: database.version,
      stores: Array.from(database.objectStoreNames)
    };
  } catch (error) {
    return { available: false, error: error.message };
  }
}
