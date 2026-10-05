import assert from 'node:assert/strict';
import {heightAt} from '../terrain.js';
import {createFlock} from '../flock.js';
for(let x=-1000;x<=1000;x+=20)for(let z=-1000;z<=1000;z+=20){assert(Number.isFinite(heightAt(x,z)));assert(Math.abs(heightAt(x+.01,z)-heightAt(x,z))<.02,'continuous hills');}
for(const count of [12,60,120]){let state=123;const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/2**32);const f=createFlock(count,heightAt,random);for(let k=0;k<3600;k++)f.step(1/60,k/60,k<240?[35,75,15]:null);for(let i=0;i<count;i++){const j=i*3;assert(f.p[j+1]>=heightAt(f.p[j],f.p[j+2])+7.99,'ground clearance');assert(Math.hypot(...f.v.slice(j,j+3))<=16.001,'speed bounded');}assert([...f.p,...f.v].every(Number.isFinite));const before=f.p.slice();f.step(NaN,0);assert.deepEqual(before,f.p);console.log(count+' flamingos: finite, bounded speed, terrain clearance, disturbance passed');}
