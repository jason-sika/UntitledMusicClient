const DB_NAME = "umc-fs";
const STORE_NAME = "handles";
const HANDLE_KEY = "libraryFolder";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

let sessionHandle = null;

export const fsSupported = () => "showDirectoryPicker" in window;

async function tryIdbSet(key, value) {
  try {
    await idbSet(key, value);
    return true;
  } catch (err) {
    console.warn("IndexedDB persistence unavailable in this browser:", err);
    return false;
  }
}

async function tryIdbGet(key) {
  try {
    return await idbGet(key);
  } catch (err) {
    console.warn("IndexedDB read unavailable in this browser:", err);
    return null;
  }
}

export async function getSavedLibraryHandle() {
  if (sessionHandle) return sessionHandle;
  return tryIdbGet(HANDLE_KEY); // silently returns null if unsupported, no throw
}

export async function checkPermission(handle) {
  if (!handle) return "none";
  try {
    return await handle.queryPermission({ mode: "read" });
  } catch (err) {
    console.error("queryPermission failed:", err);
    return "error";
  }
}

export async function pickLibraryFolder() {
  const handle = await window.showDirectoryPicker({ mode: "read" });
  sessionHandle = handle;      // always works, this session
  await tryIdbSet(HANDLE_KEY, handle); // best-effort, ignored if it fails
  return handle;
}

export async function requestPermission(handle) {
  return handle.requestPermission({ mode: "read" });
}

export async function forgetLibraryFolder() {
  sessionHandle = null;
  try {
    await idbDelete(HANDLE_KEY);
  } catch (err) {
    console.warn("IndexedDB delete unavailable in this browser:", err);
  }
}
