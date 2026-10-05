import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createFakePenpot } from './fake-penpot.mjs';

export function fixture(options) {
 const f=createFakePenpot(options);
 vm.runInNewContext(readFileSync(new URL('../dist/plugin.js', import.meta.url),'utf8'),{penpot:f.api,Error,Uint8Array,console:{log(){},warn(){},error(){}}});
 f.message('load-page', null); f.messages.length = 0;
 return f;
}
