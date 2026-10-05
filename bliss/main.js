import * as THREE from './vendor/three.module.js';
import {OrbitControls} from './vendor/OrbitControls.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {heightAt} from './terrain.js';
import {createFlock} from './flock.js';
import {createGpuFlock} from './gpu-flock.js';
const $=id=>document.getElementById(id),mobile=matchMedia('(pointer:coarse)').matches,reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
let renderer;
try{renderer=new THREE.WebGLRenderer({canvas:$('world'),antialias:true,powerPreference:'high-performance'});}catch(e){$('loading').textContent='This browser cannot start WebGL. Try Chrome or another device.';throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1.5:2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;
const scene=new THREE.Scene();scene.background=new THREE.Color('#409cde');scene.fog=new THREE.FogExp2('#afd7ee',.00075);
const camera=new THREE.PerspectiveCamera(52,1,.2,4000),controls=new OrbitControls(camera,$('world'));
controls.enableDamping=true;controls.dampingFactor=.08;controls.minDistance=8;controls.maxDistance=620;controls.maxPolarAngle=Math.PI*.49;controls.enablePan=true;
scene.add(new THREE.HemisphereLight('#e6f5ff','#758998',1.4));const sun=new THREE.DirectionalLight('#fff6df',2.3);sun.position.set(-220,350,100);scene.add(sun);
const land=new THREE.PlaneGeometry(2600,2600,mobile?160:256,mobile?160:256);land.rotateX(-Math.PI/2);
const positions=land.getAttribute('position'),colors=[];
for(let i=0;i<positions.count;i++){const x=positions.getX(i),z=positions.getZ(i),h=heightAt(x,z);positions.setY(i,h);const color=new THREE.Color().setHSL(.285+Math.sin(x*.01+z*.005)*.012,.82,.19+.055*(h/90));colors.push(color.r,color.g,color.b);}
land.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));land.computeVertexNormals();
const grass=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1});
// World-space blade-scale modulation adds texture without downloading photo assets.
grass.onBeforeCompile=s=>{s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 groundPos;').replace('#include <begin_vertex>','#include <begin_vertex>\ngroundPos=position;');s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 groundPos;').replace('#include <color_fragment>',`#include <color_fragment>
float grain=fract(sin(dot(floor(groundPos.xz*3.0),vec2(127.1,311.7)))*43758.5453);
float stripe=sin(groundPos.x*.48+sin(groundPos.z*.36));
diffuseColor.rgb*=.91+.16*grain+.025*stripe;`);};
scene.add(new THREE.Mesh(land,grass));
const sky=new THREE.Mesh(new THREE.SphereGeometry(1800,24,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{},vertexShader:'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 direction;void main(){float t=max(normalize(direction).y,0.);vec3 color=mix(vec3(.16,.48,.82),vec3(.015,.12,.64),1.0-exp(-t*4.0));gl_FragColor=vec4(color,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'}));scene.add(sky);
// Actual 3D cumulus clusters, so orbiting produces parallax rather than a wallpaper layer.
const cloudMat=new THREE.ShaderMaterial({vertexShader:'varying vec3 n;void main(){n=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 n;void main(){float light=dot(normalize(n),normalize(vec3(-.4,1.,.4)))*.5+.5;gl_FragColor=vec4(mix(vec3(.39,.49,.62),vec3(.95,.98,1.),smoothstep(.1,.82,light)),1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'}),cloudGeom=new THREE.SphereGeometry(1,16,10);
const cloudData=[],cloudDummy=new THREE.Object3D(),cloudGroup=new THREE.InstancedMesh(cloudGeom,cloudMat,22*6);
cloudGroup.instanceMatrix.setUsage(THREE.DynamicDrawUsage);cloudGroup.frustumCulled=false;scene.add(cloudGroup);
for(let i=0;i<22;i++)for(let j=0;j<6;j++)cloudData.push({x:-1100+(i*179)%2200+(j-2.5)*25,y:230+(i%4)*32+Math.sin(j*1.8+i)*9,z:-850+(i*347)%1800+(j%3-1)*17,s:[29+j%3*10,15+j%3*8,24+j%3*8]});
function updateClouds(time){cloudData.forEach((p,i)=>{cloudDummy.position.set(((p.x+time*2+1300)%2600)-1300,p.y,p.z);cloudDummy.scale.set(...p.s);cloudDummy.updateMatrix();cloudGroup.setMatrixAt(i,cloudDummy.matrix);});cloudGroup.instanceMatrix.needsUpdate=true;}
updateClouds(0);

let flock,instance,model,interpolant,animationDuration=1,simTime=0,paused=reduced,follow=false,scatterUntil=0,last=0,accumulator=0,gpuFlock,useGpu=false;
const MAX=mobile?60:120,dummy=new THREE.Object3D(),forward=new THREE.Vector3(0,0,1),heading=new THREE.Vector3(),orientation=new THREE.Quaternion(),movement=new THREE.Vector3(),predator=new THREE.Vector3(10000,10000,0);
const keys=new Set();let held=0;const interactive=e=>e.target.closest('button,input,a,summary');
function home(){follow=false;$('follow').setAttribute('aria-pressed','false');controls.enabled=true;camera.position.set(95,85,115);controls.target.set(0,65,-100);controls.update();}
home();
const notify=text=>{$('message').textContent=text;setTimeout(()=>{if($('message').textContent===text)$('message').textContent='';},3500);};
function menu(open){$('settings').hidden=!open;$('menu').setAttribute('aria-expanded',String(open));if(open)$('close').focus();else $('menu').focus();}
$('menu').onclick=()=>menu($('settings').hidden);$('close').onclick=()=>menu(false);
$('home').onclick=home;
$('pause').setAttribute('aria-pressed',String(paused));$('pause').textContent=paused?'Resume':'Pause';
$('pause').onclick=()=>{paused=!paused;$('pause').setAttribute('aria-pressed',String(paused));$('pause').textContent=paused?'Resume':'Pause';};
$('follow').onclick=()=>{follow=!follow;controls.enabled=!follow;$('follow').setAttribute('aria-pressed',String(follow));};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if($('space').requestFullscreen)await $('space').requestFullscreen();else notify('Fullscreen is not available in this browser.');}catch{notify('Fullscreen was blocked by this browser.');}};
document.addEventListener('fullscreenchange',()=>{$('fullscreen').setAttribute('aria-label',document.fullscreenElement?'Exit fullscreen':'Enter fullscreen');resize();});
$('scatter').onclick=()=>{scatterUntil=simTime+4;notify('Flock scattered');};
$('count').max=String(MAX);$('count').value=String(MAX);$('count-label').textContent=MAX+' flamingos';
$('count').oninput=()=>{const count=Number($('count').value);if(useGpu){gpuFlock.setCount(count);flock.count=count;}else{flock=createFlock(count,heightAt);instance.count=count;}$('count-label').textContent=count+' '+$('species').value+'s';};
$('species').onchange=e=>{const url=new URL(location.href);url.searchParams.set('bird',e.target.value);location.href=url.href;};
for(const [id,sign] of [['forward',1],['backward',-1]]){const el=$(id);el.addEventListener('pointerdown',e=>{held=sign;el.setPointerCapture(e.pointerId);});for(const type of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(type,()=>held=0);}
window.addEventListener('keydown',e=>{if(e.code==='Escape'){menu(false);return;}if(interactive(e))return;if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ArrowUp','ArrowDown'].includes(e.code)){e.preventDefault();keys.add(e.code);}});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();held=0;});document.addEventListener('visibilitychange',()=>{last=0;accumulator=0;keys.clear();held=0;});
function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}window.addEventListener('resize',resize);resize();
function updateBirds(){for(let i=0;i<flock.count;i++){const j=i*3;dummy.position.set(flock.p[j],flock.p[j+1],flock.p[j+2]);heading.set(flock.v[j],flock.v[j+1],flock.v[j+2]).normalize();orientation.setFromUnitVectors(forward,heading);dummy.quaternion.copy(orientation);dummy.scale.setScalar(.022*(1+(i%5)*.04));dummy.updateMatrix();instance.setMatrixAt(i,dummy.matrix);const weights=interpolant.evaluate((simTime*(.82+(i%7)*.035)+i*.173)%animationDuration);for(let k=0;k<model.morphTargetInfluences.length;k++)model.morphTargetInfluences[k]=weights[k];instance.setMorphAt(i,model);}instance.instanceMatrix.needsUpdate=true;if(instance.morphTexture)instance.morphTexture.needsUpdate=true;}
function animate(now){requestAnimationFrame(animate);if(document.hidden){last=0;return;}const dt=last?Math.min((now-last)/1000,.1):0;last=now;
 if(!paused&&flock){if(useGpu){simTime+=dt;predator.set(10000,10000,0);gpuFlock.step(simTime,dt,predator);}else{accumulator+=dt;while(accumulator>=1/60){simTime+=1/60;flock.step(1/60,simTime,simTime<scatterUntil?[35,75,15]:null);accumulator-=1/60;}updateBirds();}updateClouds(simTime);}
 if(follow&&flock){const i=0,b=1-Math.exp(-dt*3);heading.set(flock.v[i],flock.v[i+1],flock.v[i+2]).normalize();movement.set(flock.p[i],flock.p[i+1],flock.p[i+2]);controls.target.lerp(movement,b);movement.addScaledVector(heading,-18);movement.y+=5;camera.position.lerp(movement,b);camera.lookAt(controls.target);}else{let travel=held+(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0),side=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0),rise=(keys.has('KeyE')?1:0)-(keys.has('KeyQ')?1:0);camera.getWorldDirection(heading);movement.copy(heading).multiplyScalar(travel*dt*45);movement.addScaledVector(new THREE.Vector3().crossVectors(heading,camera.up).normalize(),side*dt*45);movement.y+=rise*dt*35;camera.position.add(movement);controls.target.add(movement);camera.position.x=THREE.MathUtils.clamp(camera.position.x,-1000,1000);camera.position.z=THREE.MathUtils.clamp(camera.position.z,-1000,1000);camera.position.y=Math.max(camera.position.y,heightAt(camera.position.x,camera.position.z)+3);controls.update();}
 camera.position.y=Math.max(camera.position.y,heightAt(camera.position.x,camera.position.z)+3);sky.position.copy(camera.position);renderer.render(scene,camera);$('readout').textContent=(flock?flock.count+' flamingos':'Loading birds')+' · '+(paused?'paused':follow?'following':'free view');
}
for(const el of [$('count'),$('follow'),$('scatter')])el.disabled=true;
async function init(){try{const species=$('species').value;const url=species==='parrot'?new URL('./assets/Parrot.glb',import.meta.url).href:(window.__FLAMINGO_ASSET__||new URL('./assets/Flamingo.glb',import.meta.url).href);const gltf=await new GLTFLoader().loadAsync(url);gltf.scene.traverse(o=>{if(o.isMesh)model=o;});if(!model||!gltf.animations.length)throw Error('Bird animation missing');try{gpuFlock=createGpuFlock({renderer,scene,gltf,width:mobile?8:16,scale:species==='parrot'?.13:.022});useGpu=true;instance=gpuFlock.mesh;flock={count:gpuFlock.count};$('count').max=String(gpuFlock.count);$('count').step=String(mobile?8:16);$('count').value=String(gpuFlock.count);$('count-label').textContent=gpuFlock.count+' '+species+'s';$('follow').disabled=true;$('scatter').disabled=true;}catch(gpuError){console.warn('GPU flock unavailable; using CPU fallback.',gpuError);interpolant=gltf.animations[0].tracks[0].createInterpolant();animationDuration=gltf.animations[0].duration;instance=new THREE.InstancedMesh(model.geometry,model.material,MAX);instance.instanceMatrix.setUsage(THREE.DynamicDrawUsage);instance.frustumCulled=false;scene.add(instance);flock=createFlock(MAX,heightAt);updateBirds();}$('count').disabled=false;if(!useGpu){$('follow').disabled=false;$('scatter').disabled=false;}$('loading').hidden=true;window.__bliss={flock:()=>flock,scene,instance,camera,renderer,heightAt,ready:true,gpu:useGpu};}catch(e){$('loading').textContent='The bird model could not load. Reload to retry.';console.error(e);}}
const requestedBird=new URLSearchParams(location.search).get('bird');if(requestedBird==='parrot')$('species').value='parrot';
init();
requestAnimationFrame(animate);
