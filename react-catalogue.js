import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
const h = React.createElement;

const bodyLabel = (world) => String(world || 'Unknown').toUpperCase();

function ArtifactList() {
  const [records, setRecords] = useState(window.archiveRecords || []);
  const [selected, setSelected] = useState(null);
  const [filters, setFilters] = useState({query: '', world: 'all'});

  useEffect(() => {
    const update = (event) => setRecords(event.detail || []);
    const select = (event) => setSelected(event.detail?.id || null);
    const changeFilters = (event) => setFilters(event.detail || {query: '', world: 'all'});
    window.addEventListener('archive:records', update);
    window.addEventListener('archive:select', select);
    window.addEventListener('archive:user-select', select);
    window.addEventListener('archive:filters', changeFilters);
    return () => {
      window.removeEventListener('archive:records', update);
      window.removeEventListener('archive:select', select);
      window.removeEventListener('archive:user-select', select);
      window.removeEventListener('archive:filters', changeFilters);
    };
  }, []);

  const filtered = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    const world = filters.world;
    return records.filter((record) =>
      (world === 'all' || record.world === world) &&
      `${record.name} ${record.mission} ${record.location_label}`.toLowerCase().includes(query)
    );
  }, [records, filters]);

  return filtered.length ? filtered.map((record) => h('article', {key:record.id, className:`artifact ${record.id === selected ? 'selected' : ''}`,
      'data-record':record.id, onClick:() => {
        const index = (window.archiveRecords || []).findIndex((entry) => entry.id === record.id);
        if (index >= 0) window.selectArtifact?.(index);
      }, onKeyDown:(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          const index = (window.archiveRecords || []).findIndex((entry) => entry.id === record.id);
          if (index >= 0) window.selectArtifact?.(index);
        }
      }, role:'button', tabIndex:0, 'aria-pressed':record.id === selected},
      h('div',{className:'thumb'},record.icon || '◇'),
      h('div',null,h('h3',null,record.name),h('p',null,record.mission),
        h('div',{className:'artifact-foot'},`${bodyLabel(record.world)} · ${String(record.status || 'Unverified').toUpperCase()}`)),
      h('span',{className:`level ${record.status === 'Estimated' ? 'estimated' : record.status === 'Missing' ? 'missing' : ''}`})))
    : h('p',{className:'source-empty',style:{padding:12}},'No matching artifact records.');
}

function SiDisclosure() {
  const [open, setOpen] = useState(false);
  return h(React.Fragment,null,
    h('button',{className:'si-disclosure-button',type:'button',onClick:()=>setOpen(true),'aria-haspopup':'dialog'},'SI ASSISTED · DETAILS'),
    open && h('div',{className:'si-disclosure-backdrop',onMouseDown:(event)=>{if(event.target===event.currentTarget)setOpen(false);}},
      h('section',{className:'si-disclosure-card',role:'dialog','aria-modal':'true','aria-labelledby':'si-disclosure-title'},
        h('button',{className:'si-disclosure-close',type:'button',onClick:()=>setOpen(false),'aria-label':'Close'},'×'),
        h('span',{className:'eyebrow'},'PROJECT TRANSPARENCY'),
        h('h2',{id:'si-disclosure-title'},'Super Intelligence use'),
        h('p',null,'AI assistance was used to write and integrate application code, shape interface copy, and organize the archive experience. The Storyteller assembles narration from the selected archive record and its cited sources; browser text-to-speech reads it aloud without uploading audio.'),
        h('p',null,'Three.js scenes and mechanical fallback geometry are generated in code at runtime. Planet textures and mission hardware models are external source assets, not AI-generated media. This project does not include AI-generated images, video, or audio.'),
        h('p',{className:'si-disclosure-meta'},h('strong',null,'Disclosure: '),'Code and selected text · ',h('strong',null,'Visual media: '),'none AI-generated · ',h('strong',null,'Source: '),'NASA/JPL and NASA/GSFC records are cited in-app.'),
        h('button',{className:'primary',type:'button',onClick:()=>setOpen(false)},'Understood'))));
}

function TelemetryStrip() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch('/api/telemetry/live').then((response) => {
      if (!response.ok) throw new Error('Telemetry endpoint unavailable');
      return response.json();
    }).then((value) => { if (alive) setData(value); }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, []);
  if (error) return h('p',{className:'telemetry-note'},'SAMPLE TELEMETRY UNAVAILABLE');
  if (!data) return h('p',{className:'telemetry-note'},'LOADING ILLUSTRATIVE TELEMETRY…');
  return h('div',{className:'telemetry-strip'},
    h('div',null,h('strong',null,`MARS · SOL ${data.mars_weather.sol}`),h('span',null,`${data.mars_weather.temp_c}°C · ${data.mars_weather.pressure_pa} Pa`)),
    h('div',null,h('strong',null,'MOON · SURFACE RANGE'),h('span',null,`${data.moon_weather.surface_temp_day_c}°C / ${data.moon_weather.surface_temp_night_c}°C`)),
    h('small',null,'ILLUSTRATIVE SAMPLE · NOT LIVE MISSION TELEMETRY'));
}

createRoot(document.getElementById('artifact-list')).render(h(ArtifactList));
createRoot(document.getElementById('si-disclosure')).render(h(SiDisclosure));
createRoot(document.getElementById('telemetry-panel')).render(h(TelemetryStrip));

