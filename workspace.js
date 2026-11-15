(() => {
  const main = document.querySelector('.main');
  const catalogue = document.querySelector('#catalogue-view');
  const compare = document.querySelector('#compare-view');
  const utility = document.querySelector('#utility-view');
  const layout = document.querySelector('.layout');
  const scenePanel = document.querySelector('.scene-panel');
  const sceneHome = scenePanel.parentElement;
  const nextScene = scenePanel.nextElementSibling;
  const search = document.querySelector('#catalogue-search');
  const cards = document.querySelector('#catalogue-cards');
  const heading = document.querySelector('#catalogue-heading');
  const summary = document.querySelector('#catalogue-summary');
  const hardware = [
    ['mer','Spirit / Opportunity','NASA MER · twin Mars surface rovers'],
    ['curiosity','Curiosity','Mars Science Laboratory · Gale Crater'],
    ['perseverance','Perseverance','Mars 2020 · Jezero Crater'],
    ['ingenuity','Ingenuity','Mars helicopter · powered flight demonstrator'],
    ['odyssey','Mars Odyssey','Mars orbiter · relay and science mission'],
    ['mro','Mars Reconnaissance Orbiter','Mars orbiter · high resolution imaging'],
    ['maven','MAVEN','Mars orbiter · atmosphere and escape mission']
  ];
  let catalogueMode = 'all';
  let storyRate = Number(localStorage.getItem('lkp-story-rate') || 1);
  let surfacesOn = localStorage.getItem('lkp-surfaces') !== 'off';

  function openWorkspace(view) {
    const utilityView = ['evidence','stories','settings','profile'].includes(view);
    main.classList.remove('view-dashboard','view-catalogue','view-detail','view-compare','view-utility');
    main.classList.add(utilityView ? 'view-utility' : `view-${view}`);
    catalogue.hidden = view !== 'catalogue';
    compare.hidden = view !== 'compare';
    utility.hidden = !utilityView;
    document.querySelectorAll('.topnav .tab[data-view]').forEach(tab => tab.classList.toggle('active',tab.dataset.view===view));
    document.querySelectorAll('.navbtn').forEach(button => button.classList.toggle('active',button.dataset.workspaceView===view));
    if(view==='catalogue') {
      document.querySelector('#catalogue-scene-slot').append(scenePanel);
      renderCatalogue();
      const isRover = Boolean(window.activeArchiveItem?.world==='Mars' && window.activeArchiveItem?.model_url);
      window.setArchiveView?.(isRover?'rover':'solar');
    } else {
      sceneHome.insertBefore(scenePanel,nextScene);
      if(view==='dashboard') { layout.classList.remove('detail-mode'); window.setArchiveView?.('solar'); }
      else if(view==='detail') { layout.classList.add('detail-mode'); window.setArchiveView?.(window.activeArchiveItem?.world==='Mars'&&window.activeArchiveItem?.model_url?'rover':'detail'); }
      else if(view==='compare') { layout.classList.remove('detail-mode'); window.setArchiveView?.('solar'); }
      else renderUtility(view);
    }
    const title={dashboard:'Dashboard',catalogue:'Artifact catalogue',detail:'Moon & discovery',compare:'Moon & Mars exploration',evidence:'Evidence',stories:'Stories',settings:'Settings',profile:'Profile'}[view]||'Dashboard';
    document.querySelector('.head-title').textContent=title;
  }

  function escape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function renderCatalogue(){
    const records=window.archiveRecords||[]; const q=(search?.value||'').trim().toLowerCase();
    const modeInfo={recent:['Recent discoveries',records.slice(0,6)],all:['Artifact catalogue',records],rovers:['Research · rover records',records.filter(r=>/rover|helicopter/i.test(`${r.name} ${r.mission}`))],lunar:['Lunar missions',records.filter(r=>r.world==='Moon')],brief:['Brief history',records],hardware:['Mission hardware',[]]};
    const [title,filtered]=modeInfo[catalogueMode]||modeInfo.all; heading.textContent=title;
    summary.hidden=catalogueMode!=='brief';
    if(catalogueMode==='brief') summary.innerHTML='<strong>From first landing to planetary field science.</strong> The archive connects lunar surface hardware left by Apollo and robotic missions with Mars rovers that explored ancient environments. Records retain NASA-reported unknowns instead of inventing coordinates. Choose a record to inspect its source trail and place; choose a Mars rover to open its interactive 3D model.';
    let html='';
    if(catalogueMode==='hardware') {
      html=hardware.filter(row=>`${row[1]} ${row[2]}`.toLowerCase().includes(q)).map(([id,name,desc])=>`<article class="catalogue-card hardware-card" data-hardware="${id}" tabindex="0" role="button"><div class="catalogue-art">NASA 3D MODEL</div><h3>${escape(name)}</h3><p>${escape(desc)}</p><small>INTERACTIVE · DRAG TO ORBIT</small></article>`).join('');
    } else {
      html=filtered.filter(item=>`${item.name} ${item.mission} ${item.location_label}`.toLowerCase().includes(q)).map(item=>`<article class="catalogue-card ${item.id===window.activeArchiveItem?.id?'selected':''}" data-record="${escape(item.id)}" tabindex="0" role="button"><div class="catalogue-art">${escape(item.icon||'✦')}</div><h3>${escape(item.name)}</h3><p>${escape(item.mission)}</p><small>${escape(item.world).toUpperCase()} · ${escape(item.status).toUpperCase()}</small></article>`).join('');
    }
    cards.innerHTML=html||'<p class="source-empty" style="padding:14px">No records match this section. Clear the search or choose another archive section.</p>';
    cards.querySelectorAll('[data-record]').forEach(card=>{
      const select=()=>{const index=records.findIndex(r=>r.id===card.dataset.record);if(index<0)return;window.selectArtifact?.(index);document.querySelectorAll('.filter').forEach(b=>b.classList.toggle('active',b.dataset.filter===records[index].world));window.setArchiveView?.(records[index].world==='Mars'&&records[index].model_url?'rover':'solar');renderCatalogue();};
      card.addEventListener('click',select);card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}});
    });
    cards.querySelectorAll('[data-hardware]').forEach(card=>{
      const select=()=>{document.querySelectorAll('.catalogue-card').forEach(c=>c.classList.toggle('selected',c===card));const selectEl=document.querySelector('#rover-kind');selectEl.value=card.dataset.hardware;selectEl.dispatchEvent(new Event('change'));window.setArchiveView?.('rover');};
      card.addEventListener('click',select);card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}});
    });
  }
  window.renderCatalogue=renderCatalogue;

  function storyFor(item){
    if(!item)return 'Select a mission record to build its source-led story.';
    const location=item.location_label||'a location that remains unknown in the archive';
    const sources=(item.sources||[]).map(s=>s.title).filter(Boolean);
    return `${item.name} is part of ${item.mission}. Its archived position is ${location}. ${item.body||''} The record is marked ${item.status||'unverified'}, and its claim trail includes ${sources.length?sources.slice(0,3).join(', '):'no attached source yet'}. This story keeps the documented facts and the remaining uncertainty together.`;
  }
  function renderUtility(view){
    const item=window.activeArchiveItem; const recordName=escape(item?.name||'No record selected');
    if(view==='stories'){
      const src=(item?.sources||[]).map(s=>`<a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${escape(s.title)} ↗</a>`).join('')||'<span class="subtle">No source links are attached to the selected record.</span>';
      utility.innerHTML=`<div class="workspace-heading"><div><span class="eyebrow">SOURCE-LED NARRATION</span><h1>AI Storyteller</h1></div></div><div class="utility-grid"><section class="utility-card"><h2 id="story-name">${recordName}</h2><p class="story-copy" id="story-text">${escape(storyFor(item))}</p><div class="story-controls"><button class="primary" id="speak-story">▶ Speak story</button><button class="ghost" id="stop-story">■ Stop</button><span class="workspace-status" id="speech-status">${'speechSynthesis' in window?'Browser voice available':'Speech synthesis is not available in this browser'}</span></div></section><aside class="utility-card"><h2>Source trail</h2><p>The narration is assembled from this archive record and its source links. It preserves unknown or approximate locations instead of filling gaps with guesses.</p><div class="story-source">${src}</div><p class="workspace-status">NARRATION TEXT IS GENERATED FROM THE SELECTED RECORD · VOICE USES YOUR BROWSER</p></aside></div>`;
      document.querySelector('#speak-story').onclick=()=>{if(!('speechSynthesis'in window)){document.querySelector('#speech-status').textContent='This browser does not support speech synthesis.';return;}speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(storyFor(item));utterance.rate=storyRate;utterance.onstart=()=>document.querySelector('#speech-status').textContent='Speaking…';utterance.onend=()=>document.querySelector('#speech-status').textContent='Story complete';utterance.onerror=()=>document.querySelector('#speech-status').textContent='Speech playback was blocked';speechSynthesis.speak(utterance);};
      document.querySelector('#stop-story').onclick=()=>{window.speechSynthesis?.cancel();document.querySelector('#speech-status').textContent='Stopped';};
    } else if(view==='evidence'){
      const sources=(item?.sources||[]).map(s=>`<div class="evidence-record"><strong>${escape(s.title)}</strong><span>${escape(s.note||'Source record')}</span><a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">Open source ↗</a></div>`).join('')||'<p>No linked source for this record.</p>';
      utility.innerHTML=`<div class="workspace-heading"><div><span class="eyebrow">PROOF METER · SOURCE LINKS</span><h1>Evidence desk</h1></div></div><div class="utility-grid"><section class="utility-card"><h2>${recordName}</h2><p>${escape(item?.body||'Select an archive record to inspect its source evidence.')}</p><div class="tagrow"><span class="tag">${escape(item?.status||'UNVERIFIED').toUpperCase()}</span><span class="tag gold">${(item?.sources||[]).length} SOURCE LINKS</span></div></section><section class="utility-card"><h2>Primary references</h2>${sources}</section></div>`;
    } else if(view==='settings'){
      utility.innerHTML=`<div class="workspace-heading"><div><span class="eyebrow">LOCAL PREFERENCES</span><h1>Settings</h1></div></div><div class="utility-grid"><section class="utility-card"><h2>3D explorer</h2><div class="settings-row"><label><input id="setting-rotate" type="checkbox" checked> Auto-rotate planets</label></div><div class="settings-row"><label><input id="setting-surfaces" type="checkbox" ${surfacesOn?'checked':''}> Planet surface maps</label></div><p>When online textures are unavailable, the explorer keeps an illuminated fallback globe.</p></section><section class="utility-card"><h2>Story voice</h2><label for="setting-rate">Narration speed</label><div class="settings-row"><input class="workspace-range" id="setting-rate" type="range" min="0.7" max="1.3" step="0.1" value="${storyRate}"><span id="setting-rate-label">${storyRate.toFixed(1)}×</span></div><p>Uses the voice and language available in this browser. No audio is uploaded.</p><button class="ghost" id="preview-voice">▶ Preview voice</button></section></div>`;
      const rotate=document.querySelector('#setting-rotate');rotate.checked=localStorage.getItem('lkp-auto-rotate')!=='off';rotate.onchange=()=>{localStorage.setItem('lkp-auto-rotate',rotate.checked?'on':'off');window.solarSim?.setAutoRotate(rotate.checked);};
      const surfaces=document.querySelector('#setting-surfaces');surfaces.onchange=()=>{surfacesOn=surfaces.checked;localStorage.setItem('lkp-surfaces',surfacesOn?'on':'off');window.solarSim?.setTextures(surfacesOn);};
      const rate=document.querySelector('#setting-rate');rate.oninput=()=>{storyRate=Number(rate.value);localStorage.setItem('lkp-story-rate',String(storyRate));document.querySelector('#setting-rate-label').textContent=`${storyRate.toFixed(1)}×`;};
      document.querySelector('#preview-voice').onclick=()=>{if('speechSynthesis'in window){speechSynthesis.cancel();const u=new SpeechSynthesisUtterance('Voice narration is ready for the selected mission record.');u.rate=storyRate;speechSynthesis.speak(u);}};
      window.solarSim?.setAutoRotate(rotate.checked);window.solarSim?.setTextures(surfacesOn);
    } else {
      utility.innerHTML=`<div class="workspace-heading"><div><span class="eyebrow">LOCAL ARCHIVE WORKSPACE</span><h1>Profile</h1></div></div><div class="utility-card"><h2>Researcher workspace</h2><p>This app runs as a local mission archive. Records are stored in the local SQLite database and source links open at their providers.</p><p class="workspace-status">NO ACCOUNT CONNECTED · PRIVATE LOCAL SESSION</p><button class="ghost" id="profile-dashboard">Return to dashboard</button></div>`;
      document.querySelector('#profile-dashboard').onclick=()=>openWorkspace('dashboard');
    }
  }

  document.querySelectorAll('[data-workspace-view]').forEach(button=>button.addEventListener('click',()=>openWorkspace(button.dataset.workspaceView)));
  document.querySelectorAll('.topnav .tab[data-view]').forEach(button=>button.addEventListener('click',()=>openWorkspace(button.dataset.view)));
  document.querySelectorAll('[data-catalogue-mode]').forEach(button=>button.addEventListener('click',()=>{catalogueMode=button.dataset.catalogueMode;document.querySelectorAll('[data-catalogue-mode]').forEach(b=>b.classList.toggle('active',b===button));if(search)search.value='';renderCatalogue();}));
  search?.addEventListener('input',renderCatalogue);
  document.querySelectorAll('.world-panel footer strong').forEach((button,index)=>button.addEventListener('click',()=>{catalogueMode=index?'rovers':'lunar';openWorkspace('catalogue');document.querySelectorAll('[data-catalogue-mode]').forEach(b=>b.classList.toggle('active',b.dataset.catalogueMode===catalogueMode));renderCatalogue();}));
  window.addEventListener('archive:records',renderCatalogue);
  window.addEventListener('archive:user-select',()=>{if(main.classList.contains('view-utility'))renderUtility('stories');});
  window.openWorkspace=openWorkspace;
})();


document.querySelector('#story').onclick=()=>openWorkspace('stories');
