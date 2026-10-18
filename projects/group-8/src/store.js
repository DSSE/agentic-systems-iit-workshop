import { readFile, writeFile, rename, unlink, open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateData } from './domain.js';

export class StorageError extends Error {}
const queues = new Map();

export function createStore(filename) {
  const path = resolve(filename);
  async function load() {
    try { return validateData(JSON.parse(await readFile(path, 'utf8'))); }
    catch { throw new StorageError('Inventory could not be safely read. No changes were saved.'); }
  }

  async function transaction(operation) {
    // Serialize stores sharing a filename; the exclusive lock also rejects a second process.
    const previous = queues.get(path) ?? Promise.resolve();
    const pending = previous.catch(() => {}).then(async () => {
      let lock;
      const temporary = `${path}.${randomUUID()}.tmp`;
      try {
        lock = await open(`${path}.lock`, 'wx');
        const data = await load();
        const result = await operation(data);
        if (result.ok) {
          validateData(data);
          await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx' });
          await rename(temporary, path);
        }
        return result;
      } catch (error) {
        if (error instanceof StorageError) throw error;
        throw new StorageError('Inventory is busy or could not be safely saved. Please check and approve a fresh proposal.');
      } finally {
        await unlink(temporary).catch(() => {});
        if (lock) {
          await lock.close();
          await unlink(`${path}.lock`);
        }
      }
    });
    queues.set(path, pending);
    try { return await pending; }
    finally { if (queues.get(path) === pending) queues.delete(path); }
  }
  return { load, transaction };
}
