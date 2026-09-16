import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Minimal file-backed JSON collection. A prototype-scale substitute for a
 * real database - good enough for a handful of user records, persisted via
 * a Docker volume. Writes are serialized through a promise chain so
 * concurrent requests never interleave a read-modify-write and clobber each
 * other's changes.
 */
export class JsonStore {
  constructor(filePath, defaultData) {
    this.filePath = filePath;
    this.defaultData = defaultData;
    this.queue = Promise.resolve();
  }

  async read() {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      if (err.code === 'ENOENT') {
        await this._writeAtomic(this.defaultData);
        return structuredClone(this.defaultData);
      }
      throw err;
    }
  }

  async _writeAtomic(data) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    await fs.rename(tmpPath, this.filePath);
  }

  /**
   * Serialized read-modify-write. `fn` receives the current data and returns
   * either the new data to persist, or `{ data, result }` when the caller
   * also needs a value back (e.g. the record it just created).
   */
  mutate(fn) {
    const run = async () => {
      const current = await this.read();
      const outcome = await fn(current);
      const hasResult = outcome && typeof outcome === 'object' && 'data' in outcome;
      const nextData = hasResult ? outcome.data : outcome;
      await this._writeAtomic(nextData);
      return hasResult ? outcome.result : undefined;
    };

    const result = this.queue.then(run, run);
    // Keep the chain alive even if this call rejects, so later mutations
    // still run in order instead of piling onto a dead promise.
    this.queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}
