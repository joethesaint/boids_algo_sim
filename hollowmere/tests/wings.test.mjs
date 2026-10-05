import * as e from 'three';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const source=await readFile(new URL('../index.html',import.meta.url),'utf8');
const adapter=(await readFile(new URL('../wings-adapter.js',import.meta.url),'utf8')).replace('https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js',import.meta.resolve('three'));
const {wingsGeometry,perchLayout}=await import('data:text/javascript;base64,'+Buffer.from(adapter).toString('base64'));
import assert from 'node:assert/strict';
globalThis.window={};globalThis.document={addEventListener(){}};
const h=()=>({mat:new e.MeshBasicMaterial()}), HB_VERT='',HB_FRAG='';

const start=source.indexOf('function hollowBoids');
const end=source.indexOf('\n}',start)+2;
const hollowBoids=new Function('e','wingsGeometry','perchLayout','h','HB_VERT','HB_FRAG',source.slice(start,end)+';return hollowBoids;')(e,wingsGeometry,perchLayout,h,HB_VERT,HB_FRAG);
for(const mobile of [false,true]) {
 globalThis.matchMedia=()=>({matches:mobile});
 const api=hollowBoids(()=>0,new e.Scene());
 assert.equal(api.stats.birds,mobile?110:280);
 const slots=perchLayout(()=>0,api.stats.birds).anchors;
 assert.equal(slots.length,api.stats.birds);
 assert.equal(new Set(slots.map(a=>a.join(','))).size,slots.length);
 for(let i=0;i<300;i++) api.update(1/60,i/60,null);
 api.setPerching(true);
 for(let i=0;i<2400;i++) api.update(1/30,i/30,null);
 assert.equal(api.stats.perched,api.stats.birds);
 assert.equal(api.mesh.geometry.instanceCount,1);
 assert.equal(api.perchMesh.geometry.instanceCount,api.stats.birds);
 for(const mesh of [api.mesh,api.perchMesh]) for(const key of ['aPosB','aVelS','aMisc']) assert.ok([...mesh.geometry.getAttribute(key).array].every(Number.isFinite));
 api.setEnabled(false);const before=api.perchMesh.geometry.getAttribute('aPosB').array.slice();api.update(1,99,null);assert.deepEqual(before,api.perchMesh.geometry.getAttribute('aPosB').array);assert.equal(api.perchMesh.visible,false);
 api.setEnabled(true);api.setPerching(false);api.update(1/30,100,null);assert.ok(api.stats.perched>0,'staggered release');
 for(let i=0;i<180;i++)api.update(1/30,100+i/30,null);
 assert.equal(api.stats.perched,0);assert.equal(api.mesh.geometry.instanceCount,api.stats.birds+1);
 console.log(mobile?'mobile':'desktop','perching, unique slots, release, hide/pause, finite buffers passed');
}
const g=wingsGeometry(); assert.ok([...g.getAttribute('aWing').array].includes(0));assert.ok([...g.getAttribute('aWing').array].includes(-1));assert.ok([...g.getAttribute('aWing').array].includes(1));
console.log('Wings mesh topology and explicit wing masks passed');

