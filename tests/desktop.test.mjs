import { afterEach, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileDriver } from '../apps/desktop/file-driver.mjs';
const folders = [];
afterEach(async () => { for (const folder of folders.splice(0)) await rm(folder, { recursive: true }); });
it('il driver desktop sostituisce file senza residui e rifiuta percorsi arbitrari', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'immobil-storage-')); folders.push(folder);
  const driver = fileDriver(folder);
  expect(await driver.read('archive')).toBeNull();
  await driver.write('archive', 'first'); await driver.write('archive', 'second');
  expect(await readFile(join(folder, 'archive.json'), 'utf8')).toBe('second');
  expect(await readdir(folder)).toEqual(['archive.json']);
  await expect(driver.read('../../elsewhere')).rejects.toThrow('INVALID_SLOT');
  await expect(driver.write('other', 'bad')).rejects.toThrow('INVALID_SLOT');
});
