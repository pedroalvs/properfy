import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ExecutionState, AssetUploadState } from '../types';

interface QueuedAction {
  id: string;
  type: 'START' | 'FINISH';
  appointmentId: string;
  payload: unknown;
  idempotencyKey: string;
  createdAt: string;
  retryCount: number;
  lastError: string | null;
}

interface ProperfyPwaDB extends DBSchema {
  'execution-states': {
    key: string;
    value: ExecutionState;
  };
  'queued-actions': {
    key: string;
    value: QueuedAction;
  };
  'pending-assets': {
    key: string;
    value: AssetUploadState & { blob?: Blob };
  };
}

let dbPromise: Promise<IDBPDatabase<ProperfyPwaDB>> | null = null;

function getDB(): Promise<IDBPDatabase<ProperfyPwaDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ProperfyPwaDB>('properfy-pwa', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('execution-states')) {
          db.createObjectStore('execution-states');
        }
        if (!db.objectStoreNames.contains('queued-actions')) {
          db.createObjectStore('queued-actions');
        }
        if (!db.objectStoreNames.contains('pending-assets')) {
          db.createObjectStore('pending-assets');
        }
      },
    });
  }
  return dbPromise;
}

export async function saveExecutionState(appointmentId: string, state: ExecutionState): Promise<void> {
  const db = await getDB();
  await db.put('execution-states', state, appointmentId);
}

export async function getExecutionState(appointmentId: string): Promise<ExecutionState | undefined> {
  const db = await getDB();
  return db.get('execution-states', appointmentId);
}

export async function clearExecutionState(appointmentId: string): Promise<void> {
  const db = await getDB();
  await db.delete('execution-states', appointmentId);
}

export async function enqueueAction(action: QueuedAction): Promise<void> {
  const db = await getDB();
  await db.put('queued-actions', action, action.id);
}

export async function getAllQueuedActions(): Promise<QueuedAction[]> {
  const db = await getDB();
  return db.getAll('queued-actions');
}

export async function removeQueuedAction(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('queued-actions', id);
}

export async function updateQueuedAction(action: QueuedAction): Promise<void> {
  const db = await getDB();
  await db.put('queued-actions', action, action.id);
}

export async function savePendingAsset(asset: AssetUploadState & { blob?: Blob }): Promise<void> {
  const db = await getDB();
  await db.put('pending-assets', asset, asset.localId);
}

export async function getPendingAssets(): Promise<Array<AssetUploadState & { blob?: Blob }>> {
  const db = await getDB();
  return db.getAll('pending-assets');
}

export async function removePendingAsset(localId: string): Promise<void> {
  const db = await getDB();
  await db.delete('pending-assets', localId);
}

export type { QueuedAction };
