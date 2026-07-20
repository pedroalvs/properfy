import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ExecutionState } from '../types';

type QueuedActionStatus = 'PENDING' | 'FAILED';

interface QueuedAction {
  id: string;
  type: 'START' | 'FINISH';
  appointmentId: string;
  payload: unknown;
  idempotencyKey: string;
  createdAt: string;
  retryCount: number;
  lastError: string | null;
  /** Additive field — records written before it existed are treated as PENDING. */
  status?: QueuedActionStatus;
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

export type { QueuedAction, QueuedActionStatus };
