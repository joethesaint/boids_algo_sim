(() => {
  const $ = id => document.getElementById(id);
  const coarse = matchMedia('(pointer:coarse)').matches;
  const reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;
  const renderer = new THREE.WebGLRenderer({canvas:$('world'),antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,coarse ? 1.35 : 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#79bce1'); scene.fog = new THREE.FogExp2('#b9d9e2',.0019);
  const camera = new THREE.PerspectiveCamera(48,1,.2,2500); camera.position.set(95,46,145);
  const controls = new THREE.OrbitControls(camera,$('world')); controls.enableDamping=true; controls.dampingFactor=.055; controls.minDistance=24; controls.maxDistance=650; controls.maxPolarAngle=Math.PI*.49; controls.target.set(0,22,-55);
  scene.add(new THREE.HemisphereLight('#dff4ff','#5d7584',1.7));
  const sun = new THREE.DirectionalLight('#fff1cf',2.65); sun.position.set(-180,260,90); scene.add(sun);
  const haze = new THREE.Mesh(new THREE.PlaneGeometry(1900,500),new THREE.MeshBasicMaterial({color:'#e9eadf',transparent:true,opacity:.18,depthWrite:false})); haze.rotation.x=-Math.PI/2; haze.position.y=-6; scene.add(haze);
  const geo = new THREE.IcosahedronGeometry(1,2), base = new THREE.SphereGeometry(1,18,12);
  const mats=[new THREE.MeshLambertMaterial({color:'#fff9e8',transparent:true,opacity:.88,depthWrite:false}),new THREE.MeshLambertMaterial({color:'#d8e5e5',transparent:true,opacity:.72,depthWrite:false}),new THREE.MeshLambertMaterial({color:'#f7f4e9',transparent:true,opacity:.82,depthWrite:false})];
  let clouds=[], density=28, paused=reduced, t=0;
  const rand=n=>{const x=Math.sin(n*9283.113)*43758.5453;return x-Math.floor(x)};
  function addCloud(seed,far=false){
    const group=new THREE.Group(), x=(rand(seed)-.5)*(far?1400:820), z=-80-rand(seed+2)*(far?1300:720), y=far?35+rand(seed+3)*150:20+rand(seed+3)*130;
    const scale=far?9+rand(seed+4)*12:7+rand(seed+4)*16, lumps=far?10:17+Math.floor(rand(seed+5)*13);
    for(let i=0;i<lumps;i++){
      const a=rand(seed*17+i), b=rand(seed*31+i), mesh=new THREE.Mesh(i<lumps*.26?base:geo,mats[i%3]);
      const spread=(i<4?1:2.5)*scale; mesh.position.set((a-.5)*spread*3,(b-.24)*scale*.75,(rand(seed*47+i)-.5)*spread*1.65);
      mesh.scale.set(scale*(.42+a*.6),scale*(.22+b*.38),scale*(.48+rand(seed*13+i)*.55)); group.add(mesh);
    }
    group.position.set(x,y,z); group.userData={seed,drift:(rand(seed+8)-.5)*1.1,phase:rand(seed+9)*Math.PI*2}; scene.add(group); clouds.push(group);
  }
  function rebuild(){clouds.forEach(c=>scene.remove(c)); clouds=[]; for(let i=0;i<density;i++)addCloud(i+1); for(let i=0;i<16;i++)addCloud(100+i,true); $('density-value').textContent=`${density} formations`;}
  function home(){camera.position.set(95,46,145);controls.target.set(0,22,-55);controls.update()}
  rebuild(); home();
  function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()} addEventListener('resize',resize); resize();
  function menu(open){$('panel').hidden=!open;$('menu').setAttribute('aria-expanded',String(open));} $('menu').onclick=()=>menu($('panel').hidden);$('close').onclick=()=>menu(false);$('home').onclick=home;
  $('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'Resume drift':'Pause drift'};
  $('density').oninput=e=>{density=Number(e.target.value);rebuild()};
  function tick(ms){requestAnimationFrame(tick); const dt=Math.min(.05,(ms-t||ms)/1000);t=ms;if(!paused)clouds.forEach(c=>{c.position.x+=c.userData.drift*dt;c.position.y+=Math.sin(ms*.00023+c.userData.phase)*.002;c.rotation.y+=.00008});controls.update();renderer.render(scene,camera);$('readout').textContent=`${density} cloud formations · ${paused?'paused':'drifting'}`;}
  $('status').hidden=true; tick(0); window.__cloudreach={scene,camera,renderer,clouds:()=>clouds,ready:true};
})();
