import { mkdir, open, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

export function fileDriver(directory) {
  const filename = slot => {
    if (slot !== 'archive' && slot !== 'backup') throw new Error('INVALID_SLOT');
    return join(directory, `${slot}.json`);
  };
  return {
    async read(slot) {
      try { return await readFile(filename(slot), 'utf8'); }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    },
    async write(slot, contents) {
      const target = filename(slot), temporary = `${target}.tmp`;
      await mkdir(directory, { recursive: true });
      const file = await open(temporary, 'w');
      try { await file.writeFile(contents, 'utf8'); await file.sync(); }
      finally { await file.close(); }
      await rename(temporary, target);
    },
  };
}
