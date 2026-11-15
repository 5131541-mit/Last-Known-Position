import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

const $ = (selector) => document.querySelector(selector);
const roverCanvas = $('#real-rover');
roverCanvas.style.display = 'none';
window.realRoverReady = false;

// Source-backed archive client. The view can still display its static shell if the API is offline.
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let liveArtifacts = [];
let chosenId = null;

function renderArchiveList() {
  const query = $('#search').value.trim().toLowerCase();
  const selectedWorld = document.querySelector('.filter.active')?.dataset.filter || 'all';
  const visible = liveArtifacts.filter((item) =>
    (selectedWorld === 'all' || item.world === selectedWorld) &&
    `${item.name} ${item.mission} ${item.location_label}`.toLowerCase().includes(query));
  window.archiveRecords = liveArtifacts;
  window.dispatchEvent(new CustomEvent('archive:records', {detail: liveArtifacts}));
  window.dispatchEvent(new CustomEvent('archive:filters', {detail: {query, world: selectedWorld}}));
  $('#record-count').textContent = `${visible.length} / ${liveArtifacts.length} RECORDS`;
  window.renderCatalogue?.();
}
window.renderList = renderArchiveList;

function showSources(item) {
  window.activeArchiveItem = item;
  window.dispatchEvent(new CustomEvent('archive:select', {detail:item}));
  const roverKind = $('#rover-kind');
  if (roverKind && item?.name) {
    const name = item.name.toLowerCase();
    if (name.includes('perseverance')) roverKind.value = 'perseverance';
    else if (name.includes('curiosity')) roverKind.value = 'curiosity';
    else if (name.includes('spirit') || name.includes('opportunity')) roverKind.value = 'mer';
    roverKind.dispatchEvent(new Event('change'));
  }
  const list = $('#source-list');
  if (!list) return;
  list.innerHTML = item?.sources?.length ? item.sources.map((source) =>
    `<a class="source-item" href="${escapeHTML(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(source.title)}<small>${escapeHTML(source.note)}</small></a>`
  ).join('') : '<span class="source-empty">No source attached yet. Add one before treating this record as verified.</span>';
  $('#mission-id').textContent = item?.id || '—';
  $('#artifact-title').textContent = item?.name || 'No records yet';
  $('#artifact-copy').textContent = item?.body || 'Add an artifact record to begin the archive.';
  $('#artifact-sub').textContent = item ? `${item.mission} · ${item.location_label}` : '';
  $('#confidence').textContent = item?.status?.toUpperCase() || 'UNVERIFIED';
  $('#parts-heading').textContent = item?.model_url ? 'Mechanical systems · select to inspect' : '3D model';
  $('#part-list').style.display = item?.model_url ? 'grid' : 'none';
  $('.part-info').style.display = item?.model_url ? 'block' : 'none';
  const edit = $('#edit-record');
  const archive = $('#archive-record');
  edit.disabled = !item;
  archive.disabled = !item;
}

window.selectArtifact = function (index) {
  const item = liveArtifacts[index];
  if (!item) return;
  chosenId = item.id;
  showSources(item);
  window.dispatchEvent(new CustomEvent('archive:user-select',{detail:item}));
  renderArchiveList();
  window.setArchiveView?.(item.model_url ? 'rover' : 'detail');
};

async function api(path, options = {}) {
  const response = await fetch(path, {headers:{'Content-Type':'application/json'}, ...options});
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}

async function refreshArchive(selectId = chosenId) {
  const items = await api('/api/artifacts');
  liveArtifacts.splice(0, liveArtifacts.length, ...items);
  artifacts.splice(0, artifacts.length, ...items);
  renderArchiveList();
  const foundIndex = liveArtifacts.findIndex((item) => item.id === selectId);
  const index = foundIndex >= 0 ? foundIndex : 0;
  if (liveArtifacts.length) {
    chosenId = liveArtifacts[index].id;
    window.setArchiveView?.('solar'); // Keep archive refreshes on the overview.
    showSources(liveArtifacts[index]);
  } else {
    chosenId = null;
    $('#artifact-title').textContent = 'No records yet';
    $('#artifact-copy').textContent = 'Add an artifact record to begin the archive.';
    showSources(null);
  }
  const metrics = await api('/api/metrics');
  $('#count-total').textContent = String(metrics.total).padStart(2, '0');
  $('#metric-pinned').textContent = String(metrics.pinned).padStart(2, '0');
  $('#metric-missing').textContent = String(metrics.missing).padStart(2, '0');
  $('#app-status').textContent = `SQLITE ARCHIVE ONLINE · ${metrics.moon} MOON RECORDS · ${metrics.mars} MARS RECORDS · ${metrics.missing} UNKNOWN LOCATIONS PRESERVED`;
}

$('#search').addEventListener('input', renderArchiveList);
document.querySelectorAll('.filter').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.filter').forEach((entry) => entry.classList.remove('active'));
  button.classList.add('active'); renderArchiveList();
}));

const dialog = $('#artifact-dialog');
function openForm(item = null) {
  $('#artifact-form').reset();
  $('#form-error').textContent = '';
  $('#record-id').value = item?.id || '';
  $('#dialog-title').textContent = item ? 'Edit artifact record' : 'Add artifact';
  $('#form-name').value = item?.name || '';
  $('#form-mission').value = item?.mission || '';
  $('#form-body').value = item?.body || '';
  $('#form-world').value = item?.world || 'Moon';
  $('#form-status').value = item?.status || 'Estimated';
  $('#form-location').value = item?.location_label || '';
  $('#form-lat').value = item?.latitude ?? '';
  $('#form-lon').value = item?.longitude ?? '';
  dialog.showModal();
}
$('#add-record').addEventListener('click', () => openForm());
$('#new-record-tab').addEventListener('click', () => openForm());
$('#edit-record').addEventListener('click', () => openForm(liveArtifacts.find((item) => item.id === chosenId)));
$('#dialog-close').addEventListener('click', () => dialog.close());
$('#dialog-cancel').addEventListener('click', () => dialog.close());
$('#archive-record').addEventListener('click', async () => {
  if (!chosenId || !confirm('Archive this record? It will be hidden from the dashboard but retained in the SQLite database.')) return;
  try { await api(`/api/artifacts/${encodeURIComponent(chosenId)}`, {method:'DELETE'}); await refreshArchive(null); }
  catch (error) { $('#app-status').textContent = `ARCHIVE ERROR · ${error.message}`; }
});
$('#artifact-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  $('#form-error').textContent = '';
  const id = $('#record-id').value;
  const body = {
    name:$('#form-name').value.trim(), mission:$('#form-mission').value.trim(), body:$('#form-body').value.trim(),
    world:$('#form-world').value, status:$('#form-status').value, location_label:$('#form-location').value.trim(),
    latitude:$('#form-lat').value || null, longitude:$('#form-lon').value || null
  };
  try {
    const saved = await api(id ? `/api/artifacts/${encodeURIComponent(id)}` : '/api/artifacts', {method:id?'PATCH':'POST',body:JSON.stringify(body)});
    dialog.close(); await refreshArchive(saved.id);
  } catch (error) { $('#form-error').textContent = error.message; }
});

try { await refreshArchive(null); }
catch (error) {
  $('#app-status').textContent = `DATABASE OFFLINE · START THE APP WITH run.bat · ${error.message}`;
}

// Load mission hardware directly from NASA's remote 3D resource library.
const HARDWARE = {
  mer: {name:'Spirit / Opportunity',kind:'NASA 3D ROVER',url:'/api/nasa-model/mer',source:'https://science.nasa.gov/3d-resources/mars-exploration-rover-opportunity-mer-b/',doc:'https://science.nasa.gov/mission/mars-exploration-rovers-spirit-and-opportunity/'},
  curiosity: {name:'Curiosity',kind:'NASA INTERACTIVE ROVER VIEWER',url:null,source:'https://science.nasa.gov/3d-resources/curiosity-rover-msl/',doc:'https://science.nasa.gov/mission/msl-curiosity/'},
  perseverance: {name:'Perseverance',kind:'NASA 3D ROVER',url:'/api/nasa-model/perseverance',source:'https://science.nasa.gov/3d-resources/mars-2020-perseverance-rover/',doc:'https://science.nasa.gov/resource/watch-nasas-perseverance-rover-land/'},
  ingenuity: {name:'Ingenuity',kind:'NASA 3D AERIAL VEHICLE',url:'/api/nasa-model/ingenuity',source:'https://science.nasa.gov/3d-resources/ingenuity-mars-helicopter/',doc:'https://science.nasa.gov/mission/mars-2020-perseverance/ingenuity-mars-helicopter/'},
  odyssey: {name:'Mars Odyssey',kind:'NASA 3D ORBITER',url:'/api/nasa-model/odyssey',source:'https://science.nasa.gov/3d-resources/mars-odyssey/',doc:'https://science.nasa.gov/mission/2001-mars-odyssey/'},
  mro: {name:'Mars Reconnaissance Orbiter',kind:'NASA 3D ORBITER',url:'/api/nasa-model/mro',source:'https://science.nasa.gov/3d-resources/mars-reconnaissance-orbiter-mro-c/',doc:'https://science.nasa.gov/mission/mars-reconnaissance-orbiter/'},
  maven: {name:'MAVEN',kind:'NASA 3D ORBITER',url:'/api/nasa-model/maven',source:'https://science.nasa.gov/3d-resources/mars-atmosphere-and-volatile-evolution-maven-b/',doc:'https://science.nasa.gov/mission/maven/'}
};
const scene = new THREE.Scene();
scene.background = null;
const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 1000);
camera.position.set(4.3, 2.8, 5.9);
const renderer = new THREE.WebGLRenderer({canvas:roverCanvas,alpha:true,antialias:true});
renderer.xr.enabled = true;
const vrButton = VRButton.createButton(renderer);
vrButton.id = 'enter-vr';
vrButton.className = 'vr-entry';
document.querySelector('.scene').append(vrButton);
const syncVrButton = () => { const unsupported=/VR NOT SUPPORTED|WEBXR NOT AVAILABLE|VR NOT ALLOWED/i.test(vrButton.textContent);vrButton.hidden=unsupported;document.documentElement.classList.toggle('webxr-supported',!unsupported);if(unsupported)vrButton.style.setProperty('display','none','important');else vrButton.style.removeProperty('display'); };
const vrButtonObserver = new MutationObserver(syncVrButton);
vrButtonObserver.observe(vrButton,{childList:true,characterData:true,subtree:true});syncVrButton();
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setSize(roverCanvas.clientWidth || 800, roverCanvas.clientHeight || 500, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
scene.add(new THREE.HemisphereLight(0xd5efff,0x342519,2.1));
const key = new THREE.DirectionalLight(0xffe2b2,3.1); key.position.set(4,7,5); scene.add(key);
const rim = new THREE.DirectionalLight(0x58d8dc,2.2); rim.position.set(-4,2,-5); scene.add(rim);
const controls = new OrbitControls(camera,renderer.domElement); controls.enableDamping=true; controls.dampingFactor=.065; controls.minDistance=1.3; controls.maxDistance=12;
const draco = new DRACOLoader();
draco.setDecoderPath('/node_modules/three/examples/jsm/libs/draco/');
const loader = new GLTFLoader();
loader.setDRACOLoader(draco);
let activeModel = null;
let loadToken = 0;
window.loadRoverModel = (kind='mer') => {
  const token = ++loadToken;
  const item = HARDWARE[kind] || HARDWARE.mer;
  const url = item.url;
  if(window.archiveView==='rover') $('#scene-mode-label').textContent = `${item.kind} · LOADING NASA 3D MODEL`;
  $('#hardware-source')?.setAttribute('href',item.source);
  $('#hardware-doc')?.setAttribute('href',item.doc);
  if (!url) {
    window.realRoverReady = false;
    if(activeModel){scene.remove(activeModel);activeModel=null;}
    if(window.archiveView==='rover') $('#scene-mode-label').textContent = `${item.kind} · NASA VIEWER`;
    return;
  }
  window.realRoverReady = false;
  if(activeModel){scene.remove(activeModel);activeModel=null;}
  loader.load(url, (gltf) => {
  if(token!==loadToken)return;
  const model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const modelScale = 2.8 / Math.max(size.x,size.y,size.z);
  model.scale.multiplyScalar(modelScale);
  model.position.sub(center.multiplyScalar(modelScale));
  scene.add(model);
  activeModel=model;
  controls.target.set(0,0,0); controls.update();
  window.realRoverReady=true;
  if(window.archiveView==='rover') $('#scene-mode-label').textContent = `${item.kind} · NASA 3D · VR READY`;
  if (window.archiveView === 'rover') window.setArchiveView?.('rover');
}, undefined, (error) => {
  if(token!==loadToken)return;
  console.warn('NASA hosted rover model could not be loaded; using the local interactive fallback.', error);
  $('#scene-mode-label').textContent=`${item.kind} UNAVAILABLE · PROCEDURAL FALLBACK`;
  if(window.archiveView==='rover'){
    roverCanvas.style.display='block';
    $('#real-rover').style.display='none';
    $('#scene-hint').textContent='PROCEDURAL PLACEHOLDER · MODEL SOURCE LINKED BELOW';
  }
});
};
window.loadRoverModel('mer');
function render3D(){
  const width=roverCanvas.clientWidth||1, height=roverCanvas.clientHeight||1;
  if(roverCanvas.width!==Math.round(width*renderer.getPixelRatio())||roverCanvas.height!==Math.round(height*renderer.getPixelRatio())){
    renderer.setSize(width,height,false); camera.aspect=width/height;camera.updateProjectionMatrix();
  }
  controls.update();renderer.render(scene,camera);
}
renderer.setAnimationLoop(render3D);
