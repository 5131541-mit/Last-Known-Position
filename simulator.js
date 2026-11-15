import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

// NASA/JPL planetary maps; lunar color and elevation from NASA's LRO CGI Moon Kit.
const MAPS = {
  Mercury:'/api/planet-texture/Mercury', Venus:'/api/planet-texture/Venus', Earth:'/api/planet-texture/Earth',
  Mars:'/api/planet-texture/Mars', Jupiter:'/api/planet-texture/Jupiter', Saturn:'/api/planet-texture/Saturn',
  Uranus:'/api/planet-texture/Uranus', Neptune:'/api/planet-texture/Neptune', Moon:'/api/planet-texture/Moon'
};
// Cross-origin fallback from the Solar System Scope texture library; these
// equirectangular maps are based on NASA imagery and elevation data.
const SCOPE_MAPS = {
  Sun:'https://www.solarsystemscope.com/textures/download/2k_sun.jpg',
  Mercury:'https://www.solarsystemscope.com/textures/download/2k_mercury.jpg',
  Venus:'https://www.solarsystemscope.com/textures/download/2k_venus_surface.jpg',
  Earth:'https://www.solarsystemscope.com/textures/download/2k_earth_daymap.jpg',
  Moon:'https://www.solarsystemscope.com/textures/download/2k_moon.jpg',
  Mars:'https://www.solarsystemscope.com/textures/download/2k_mars.jpg',
  Jupiter:'https://www.solarsystemscope.com/textures/download/2k_jupiter.jpg',
  Saturn:'https://www.solarsystemscope.com/textures/download/2k_saturn.jpg',
  Uranus:'https://www.solarsystemscope.com/textures/download/2k_uranus.jpg',
  Neptune:'https://www.solarsystemscope.com/textures/download/2k_neptune.jpg'
};
const MOON_HEIGHT = 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_3_8bit.jpg';
const loader = new THREE.TextureLoader();
loader.setCrossOrigin('anonymous');
const maps = new Map();
const materialRegistry = new Map();
let surfaceTexturesEnabled = localStorage.getItem('lkp-surfaces') !== 'off';
const baseColors={Mercury:'#80776d',Venus:'#d2aa73',Earth:'#437ca5',Moon:'#aaa69d',Mars:'#b46349',Jupiter:'#c5a980',Saturn:'#c8b999',Uranus:'#75bdcf',Neptune:'#345fc3'};
function textureFor(name) {
  if (maps.has(name)) return maps.get(name);
  const fallback = new THREE.Texture(); maps.set(name, fallback);
  const useTexture = texture => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    maps.set(name, texture);
    for(const material of materialRegistry.get(name)||[]){material.map=surfaceTexturesEnabled?texture:null;material.color.set(surfaceTexturesEnabled?'#ffffff':(baseColors[name]||'#9aa8b0'));material.needsUpdate=true;}
  };
  loader.load(MAPS[name], useTexture, undefined, () => {
    if(SCOPE_MAPS[name])loader.load(SCOPE_MAPS[name],useTexture,undefined,()=>console.info(`${name} online map sources unavailable; using an illuminated color sphere.`));
  });
  return fallback;
}
const moonHeight = new THREE.Texture();
loader.load(MOON_HEIGHT, texture => { moonHeight.copy(texture); moonHeight.needsUpdate = true; }, undefined,
  () => console.info('NASA lunar elevation map unavailable; Moon color map remains active.'));

function makeRenderer(mount, alpha = false) {
  const renderer = new THREE.WebGLRenderer({alpha, antialias:true, powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;
  mount.querySelector('canvas')?.remove();
  mount.insertBefore(renderer.domElement,mount.firstChild);
  return renderer;
}
function standardMaterial(name, roughness = .95) {
  const material=new THREE.MeshStandardMaterial({map:textureFor(name), color:baseColors[name]||'#9aa8b0', emissive:baseColors[name]||'#9aa8b0',emissiveIntensity:.018, roughness, metalness:0, bumpMap:name==='Moon'?moonHeight:null, bumpScale:name==='Moon'?.045:0});
  if(!materialRegistry.has(name))materialRegistry.set(name,[]);materialRegistry.get(name).push(material);return material;
}
function addStars(scene, count = 2600, spread = 170) {
  let seed = 39117;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const values = new Float32Array(count*3);
  for(let i=0;i<count;i++){
    const radius=45+rand()*spread, a=rand()*Math.PI*2, z=rand()*2-1, h=Math.sqrt(1-z*z);
    values[i*3]=radius*h*Math.cos(a); values[i*3+1]=radius*z; values[i*3+2]=radius*h*Math.sin(a);
  }
  const geometry=new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.BufferAttribute(values,3));
  scene.add(new THREE.Points(geometry,new THREE.PointsMaterial({color:0xc5deee,size:.09,sizeAttenuation:true,transparent:true,opacity:.72})));
}
function labelSprite(text) {
  const canvas=document.createElement('canvas'); canvas.width=512; canvas.height=128;
  const c=canvas.getContext('2d'); c.font='600 42px Manrope, Arial, sans-serif'; c.textAlign='center'; c.textBaseline='middle';
  c.fillStyle='#b8d0d8'; c.shadowColor='#59d7d055'; c.shadowBlur=12; c.fillText(text.toUpperCase(),256,64);
  const tex=new THREE.CanvasTexture(canvas); tex.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false})); sprite.scale.set(2.25,.56,1); return sprite;
}
const planetSpecs = [
  ['Mercury',2.55,.14,.018],['Venus',3.55,.25,.012],['Earth',4.8,.27,.009],['Mars',6.45,.21,.007],
  ['Jupiter',9.7,.88,.004],['Saturn',12.2,.72,.003],['Uranus',14.6,.43,.002],['Neptune',16.6,.42,.0015]
];
function orbitLine(scene, radius) {
  const points=[]; for(let i=0;i<=256;i++){const a=i/256*Math.PI*2;points.push(new THREE.Vector3(Math.cos(a)*radius,0,Math.sin(a)*radius));}
  const g=new THREE.BufferGeometry().setFromPoints(points);
  scene.add(new THREE.Line(g,new THREE.LineBasicMaterial({color:0x789daa,transparent:true,opacity:.15})));
}
function createSystemScene(mount) {
  const scene=new THREE.Scene(); scene.background=new THREE.Color('#02050b');
  const camera=new THREE.PerspectiveCamera(47,1,.05,500); camera.position.set(0,25,35);
  const renderer=makeRenderer(mount);renderer.xr.enabled=true;const vrButton=VRButton.createButton(renderer);vrButton.className='planet-vr-entry';mount.append(vrButton);const syncVr=()=>{const unsupported=/VR NOT SUPPORTED|WEBXR NOT AVAILABLE|VR NOT ALLOWED/i.test(vrButton.textContent);vrButton.hidden=unsupported;document.documentElement.classList.toggle('webxr-supported',!unsupported);if(unsupported)vrButton.style.setProperty('display','none','important');else vrButton.style.removeProperty('display');};const vrObserver=new MutationObserver(syncVr);vrObserver.observe(vrButton,{childList:true,characterData:true,subtree:true});syncVr();
  const controls=new OrbitControls(camera,renderer.domElement); controls.enableDamping=true; controls.dampingFactor=.055; controls.minDistance=2.4; controls.maxDistance=72; controls.autoRotate=true; controls.autoRotateSpeed=.14; controls.target.set(0,0,0);
  scene.add(new THREE.AmbientLight(0x9ebbd0,.075));scene.add(new THREE.HemisphereLight(0x6d8ca8,0x100b09,.12));
  // Orbital distances are compressed for the dashboard, so use a restrained
  // point-light strength to preserve map colors and the day/night boundary.
  const sunLight=new THREE.PointLight(0xffd7a0,82,110,1.45); scene.add(sunLight);
  const sunMaterial=new THREE.MeshBasicMaterial({color:0xffa343});
  loader.load(SCOPE_MAPS.Sun,texture=>{texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;sunMaterial.map=texture;sunMaterial.color.set('#ffffff');sunMaterial.needsUpdate=true;},undefined,()=>console.info('Solar photosphere texture unavailable; luminous sun fallback remains active.'));
  const sun=new THREE.Mesh(new THREE.SphereGeometry(.92,96,72),sunMaterial); scene.add(sun);
  const glow=new THREE.Mesh(new THREE.SphereGeometry(1.19,64,48),new THREE.MeshBasicMaterial({color:0xffa94c,transparent:true,opacity:.23,side:THREE.BackSide,depthWrite:false,blending:THREE.AdditiveBlending}));scene.add(glow);
  const corona=new THREE.Mesh(new THREE.SphereGeometry(1.52,64,48),new THREE.MeshBasicMaterial({color:0xff742e,transparent:true,opacity:.10,side:THREE.BackSide,depthWrite:false,blending:THREE.AdditiveBlending}));scene.add(corona);
  const outerGlow=new THREE.Mesh(new THREE.SphereGeometry(1.9,48,32),new THREE.MeshBasicMaterial({color:0xe95527,transparent:true,opacity:.035,side:THREE.BackSide,depthWrite:false,blending:THREE.AdditiveBlending}));scene.add(outerGlow);
  addStars(scene);
  const bodies={Sun:sun}; const planets=[];
  planetSpecs.forEach(([name,distance,radius,speed],i)=>{
    const visualRadius=radius*1.55;
    orbitLine(scene,distance);
    const pivot=new THREE.Group(); scene.add(pivot);
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(visualRadius,64,48),standardMaterial(name,name==='Earth'?.6:.93));
    mesh.position.x=distance; mesh.rotation.z=name==='Uranus'?Math.PI/2:.02*i; mesh.userData={name,radius:visualRadius}; pivot.add(mesh);
    if(['Earth','Venus','Mars'].includes(name)){const atmosphereColor={Earth:0x4c9bff,Venus:0xe7a45d,Mars:0xe77748}[name];const atmosphere=new THREE.Mesh(new THREE.SphereGeometry(visualRadius*1.045,48,36),new THREE.MeshBasicMaterial({color:atmosphereColor,transparent:true,opacity:.075,side:THREE.BackSide,blending:THREE.AdditiveBlending,depthWrite:false}));atmosphere.position.copy(mesh.position);pivot.add(atmosphere);}
    const label=labelSprite(name); label.position.set(distance,visualRadius+ .24,0); label.scale.set(1.8,.46,1); pivot.add(label);
    bodies[name]=mesh; planets.push({pivot,mesh,speed,phase:i*.71});
    if(name==='Saturn'){
      const ring=new THREE.Mesh(new THREE.RingGeometry(visualRadius*1.28,visualRadius*2.05,128),new THREE.MeshBasicMaterial({color:0xd2c1a4,side:THREE.DoubleSide,transparent:true,opacity:.72,depthWrite:false}));
      ring.rotation.x=Math.PI/2-.18; ring.position.x=distance; pivot.add(ring);
      const inner=new THREE.Mesh(new THREE.RingGeometry(visualRadius*1.09,visualRadius*1.27,128),new THREE.MeshBasicMaterial({color:0x7a6a5d,side:THREE.DoubleSide,transparent:true,opacity:.48,depthWrite:false}));inner.rotation.x=Math.PI/2-.18;inner.position.x=distance;pivot.add(inner);
    }
    if(name==='Earth'){
      const moonOrbit=new THREE.Group(); moonOrbit.position.set(distance,0,0); pivot.add(moonOrbit);
      const moon=new THREE.Mesh(new THREE.SphereGeometry(.075,28,20),standardMaterial('Moon')); moon.position.set(.57,0,0); moonOrbit.add(moon); bodies.Moon=moon; planets.push({pivot:moonOrbit,speed:.11,phase:.4,mesh:moon});
    }
  });
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(); let down=null;
  renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY};});
  renderer.domElement.addEventListener('pointerup',e=>{
    if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)return;
    const rect=renderer.domElement.getBoundingClientRect(); pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1); raycaster.setFromCamera(pointer,camera);
    const found=raycaster.intersectObjects(Object.values(bodies),false)[0]; if(found) focus(found.object.userData.name);
  });
  function resize(){const r=mount.getBoundingClientRect();if(!r.width||!r.height)return;renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();}
  function focus(name){
    const body=bodies[name]; if(!body)return;
    const target=body.getWorldPosition(new THREE.Vector3()); controls.target.copy(target);
    const radius=body.userData.radius||.075, direction=camera.position.clone().sub(target).normalize();
    camera.position.copy(target).add(direction.multiplyScalar(Math.max(radius*3.4,.34))); controls.update();
    const select=document.querySelector('#focus-world'); if(select)select.value=name;
  }
  new ResizeObserver(resize).observe(mount); resize();
  return {scene,camera,renderer,controls,bodies,planets,resize,focus,reset(){controls.target.set(0,0,0);camera.position.set(0,25,35);controls.autoRotate=true;controls.update();}};
}
function createWorldScene(mount,name) {
  const scene=new THREE.Scene(); scene.background=new THREE.Color('#01040a');
  const camera=new THREE.PerspectiveCamera(38,1,.01,100); camera.position.set(0,.12,4.15);
  const renderer=makeRenderer(mount);
  const controls=new OrbitControls(camera,renderer.domElement); controls.enableDamping=true; controls.dampingFactor=.055; controls.minDistance=1.18; controls.maxDistance=8; controls.enablePan=false; controls.autoRotate=true; controls.autoRotateSpeed=.22;
  scene.add(new THREE.AmbientLight(0x899bad,.055));scene.add(new THREE.HemisphereLight(0x6680a0,0x120c0a,.1));const key=new THREE.DirectionalLight(0xffe0be,3.8);key.position.set(-3,1.5,2.7);scene.add(key);const rim=new THREE.DirectionalLight(0x6b98c1,.45);rim.position.set(3,-1,-3);scene.add(rim);
  const geometry=new THREE.SphereGeometry(1,144,112);
  const globe=new THREE.Mesh(geometry,standardMaterial(name,name==='Mars'?.95:.99)); scene.add(globe);
  if(name==='Moon'){
    globe.material.bumpMap=moonHeight;globe.material.bumpScale=.036;globe.material.needsUpdate=true;
  }
  addStars(scene,700,70);
  function resize(){const r=mount.getBoundingClientRect();if(!r.width||!r.height)return;renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();}
  new ResizeObserver(resize).observe(mount);resize();
  return {scene,camera,renderer,controls,resize};
}
const solarMount=document.querySelector('#solar-3d');
const solarScene=createSystemScene(solarMount);document.querySelector('#focus-world').value='system';solarScene.reset();if(localStorage.getItem('lkp-auto-rotate')==='off')solarScene.controls.autoRotate=false;
function focusArchiveItem(item){if(item?.world==='Moon')solarScene.focus('Moon');else if(item?.world==='Mars'&&!item.model_url)solarScene.focus('Mars');}
window.addEventListener('archive:user-select',event=>focusArchiveItem(event.detail));
document.querySelector('#focus-world')?.addEventListener('change',e=>{if(e.target.value==='system')solarScene.reset();else solarScene.focus(e.target.value);});
document.querySelector('#zoom-in')?.addEventListener('click',()=>{solarScene.camera.position.lerp(solarScene.controls.target,.13);solarScene.camera.updateProjectionMatrix();});
document.querySelector('#zoom-out')?.addEventListener('click',()=>{const offset=solarScene.camera.position.clone().sub(solarScene.controls.target);solarScene.camera.position.copy(solarScene.controls.target).add(offset.multiplyScalar(1.14));});
document.querySelector('#center')?.addEventListener('click',()=>solarScene.reset());
document.querySelector('#compare-reset')?.addEventListener('click',()=>{worldScenes.forEach(item=>{item.controls.reset();item.controls.autoRotate=true;});});
const worldScenes=[];
worldScenes.push(createWorldScene(document.querySelector('#moon-world3d'),'Moon'));
worldScenes.push(createWorldScene(document.querySelector('#mars-world3d'),'Mars'));
window.solarSim={focus:name=>solarScene.focus(name),reset:()=>solarScene.reset(),setAutoRotate:value=>{solarScene.controls.autoRotate=Boolean(value);},setTextures:value=>{surfaceTexturesEnabled=Boolean(value);for(const [name,materials] of materialRegistry){const texture=maps.get(name);const activeMap=surfaceTexturesEnabled&&texture?.image?texture:null;for(const material of materials){material.map=activeMap;material.color.set(activeMap?'#ffffff':(baseColors[name]||'#9aa8b0'));material.needsUpdate=true;}}},zoom:factor=>{const offset=solarScene.camera.position.clone().sub(solarScene.controls.target);solarScene.camera.position.copy(solarScene.controls.target).add(offset.multiplyScalar(factor));}};
const roverSelect=document.querySelector('#rover-kind');
const roverFrame=document.querySelector('#nasa-mer-viewer');
function setRoverModel(id){
  const names={mer:'Mars Exploration Rover · Spirit / Opportunity',curiosity:'Mars Science Laboratory · Curiosity',perseverance:'Mars 2020 · Perseverance',ingenuity:'Mars helicopter · Ingenuity',odyssey:'Mars Odyssey · orbiter',mro:'Mars Reconnaissance Orbiter',maven:'MAVEN · orbiter'};
  const selectedName=(window.activeArchiveItem?.name||'').toLowerCase();
  const merMission=selectedName.includes('opportunity')?'opportunity':'spirit';
  const discovery={
    spirit:{title:'Spirit’s Triumphs on Mars',video:'ILqo8mwpDKw',url:'https://science.nasa.gov/resource/spirits-triumphs-on-mars/',caption:'NASA/JPL team members look back at Spirit’s six years exploring Mars.'},
    opportunity:{title:'Opportunity: NASA Rover Completes Mars Mission',video:'1Ll-VHYxWXU',url:'https://science.nasa.gov/resource/opportunity-nasa-rover-completes-mars-mission/',caption:'NASA/JPL mission footage and the discoveries from Opportunity’s 15-year journey.'},
    curiosity:{title:'Curiosity Has Landed',video:'N9hXqzkH7YA',url:'https://science.nasa.gov/resource/curiosity-has-landed/',caption:'NASA/JPL footage from Curiosity’s dramatic landing at Gale Crater.'},
    perseverance:{title:'Watch NASA’s Perseverance Rover Land',video:'GUqsH5y1j1M',url:'https://science.nasa.gov/resource/watch-nasas-perseverance-rover-land/',caption:'The rover’s cameras record entry, descent, parachute deployment, and touchdown.'},
    ingenuity:{title:'Ingenuity’s First Flight on Mars',video:'wMnOo2zcjXA',url:'https://science.nasa.gov/resource/first-video-of-nasas-ingenuity-mars-helicopter-in-flight/',caption:'Perseverance records the first powered, controlled flight on another planet.'},
    odyssey:{title:'Mars Odyssey: 22 Years in Orbit',video:'gm_g93wNj_8',url:'https://science.nasa.gov/mission/2001-mars-odyssey/',caption:'NASA/JPL looks back at the orbiter’s long-running Mars mission.'},
    mro:{title:'Mars Reconnaissance Orbiter mission media',video:null,url:'https://science.nasa.gov/resource/magnificent-mars-10-years-of-mars-reconnaissance-orbiter/',caption:'NASA mission film and imagery from a decade of Mars Reconnaissance Orbiter observations.'},
    maven:{title:'Ten Years at Mars with NASA’s MAVEN Mission',video:'JH4OxUc8kFs',url:'https://science.nasa.gov/resource/maven-mars-atmospheric-loss/',caption:'NASA Goddard follows MAVEN’s study of how Mars loses its atmosphere.'}
  };
  const media=discovery[id==='mer'?merMission:id]||discovery.spirit;
  const player=document.querySelector('#discovery-player');
  const caption=document.querySelector('#discovery-caption');
  const source=document.querySelector('#discovery-source');
  if(player){player.src=media.video?`https://www.youtube-nocookie.com/embed/${media.video}?rel=0`:'';player.style.display=media.video?'block':'none';player.title=media.title;}
  if(caption)caption.textContent=media.caption;
  if(source){source.href=media.url;source.textContent=`${media.title} · NASA source ↗`;}
  roverFrame.title=`NASA interactive 3D model: ${names[id]||'mission hardware'}`;
  const sourceLinks={mer:['https://science.nasa.gov/3d-resources/mars-exploration-rover-opportunity-mer-b/','https://science.nasa.gov/mission/mars-exploration-rovers-spirit-and-opportunity/'],curiosity:['https://science.nasa.gov/3d-resources/curiosity-rover-msl/','https://science.nasa.gov/mission/msl-curiosity/'],perseverance:['https://science.nasa.gov/3d-resources/mars-2020-perseverance-rover/','https://science.nasa.gov/resource/watch-nasas-perseverance-rover-land/'],ingenuity:['https://science.nasa.gov/3d-resources/ingenuity-mars-helicopter/','https://science.nasa.gov/mission/mars-2020-perseverance/ingenuity-mars-helicopter/'],odyssey:['https://science.nasa.gov/3d-resources/mars-odyssey/','https://science.nasa.gov/mission/2001-mars-odyssey/'],mro:['https://science.nasa.gov/3d-resources/mars-reconnaissance-orbiter-mro-c/','https://science.nasa.gov/mission/mars-reconnaissance-orbiter/'],maven:['https://science.nasa.gov/3d-resources/mars-atmosphere-and-volatile-evolution-maven-b/','https://science.nasa.gov/mission/maven/']};
  document.querySelector('#hardware-source')?.setAttribute('href',sourceLinks[id]?.[0]||'https://science.nasa.gov/3d-resources/');
  document.querySelector('#hardware-doc')?.setAttribute('href',sourceLinks[id]?.[1]||'https://science.nasa.gov/mars/');
  const embeddedViewer=id==='curiosity';
  roverFrame.src=embeddedViewer?'https://mars.nasa.gov/gltf_embed/24584/':'about:blank';
  if(embeddedViewer)document.querySelector('#enter-vr')?.style.setProperty('display','none','important');
  else document.querySelector('#enter-vr')?.style.removeProperty('display');
  if(!embeddedViewer)window.loadRoverModel?.(id);else{window.realRoverReady=false;document.querySelector('#scene-mode-label').textContent='NASA INTERACTIVE ROVER VIEWER';}
  if(window.archiveView==='rover'){
    window.setArchiveView?.('rover');
    document.querySelector('#scene-title').textContent=names[id]||'NASA MISSION HARDWARE · 3D MODEL';
    document.querySelector('#scene-mode-label').textContent=embeddedViewer?'NASA INTERACTIVE VIEWER · WEBXR UNAVAILABLE':'NASA 3D MODEL · VR READY';
  }
};window.setRoverModel=setRoverModel;roverSelect?.addEventListener('change',()=>setRoverModel(roverSelect.value));
setRoverModel(roverSelect?.value||'mer');
const clock=new THREE.Clock();
function animate(){const elapsed=clock.getElapsedTime();solarScene.planets.forEach(({pivot,mesh,speed,phase})=>{pivot.rotation.y=phase+elapsed*speed;if(mesh.userData.name)mesh.rotation.y=elapsed*.006;});const sun=solarScene.bodies.Sun;if(sun)sun.rotation.y=elapsed*.018;solarScene.controls.update();solarScene.renderer.render(solarScene.scene,solarScene.camera);worldScenes.forEach(world=>{world.controls.update();world.renderer.render(world.scene,world.camera);});}
solarScene.renderer.setAnimationLoop(animate);
