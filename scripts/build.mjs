import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import {APP_FILES} from './app-files.mjs';
const root = new URL('../', import.meta.url);
const destination = new URL('dist/', root);
await mkdir(destination, { recursive: true });
for (const file of APP_FILES) {
  await writeFile(new URL(file, destination), await readFile(new URL(file, root)));
}
await cp(new URL('src/', root), new URL('src/', destination), { recursive: true });
console.log('Built static application in dist/');
