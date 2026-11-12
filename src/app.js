const STORAGE_KEY = 'azul-estudo-data-v1';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const uid = () => Math.random().toString(36).slice(2, 10);
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const validHttps = value => { try { const url = new URL(String(value || '')); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; } };
const validImageSource = value => { const remote=validHttps(value); if(remote)return remote; const local=String(value||''); return /^azul-asset:\/\/local\/[a-z0-9-]+\.(?:png|jpe?g|webp)$/i.test(local)?local:''; };
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatDate = date => new Intl.DateTimeFormat('pt-BR', { weekday:'long', day:'numeric', month:'long' }).format(date);

const defaultState = () => ({
  subjects: [], tasks: [], habits: [
    { id: uid(), title: 'Estudar por 1 hora', detail: 'Uma sessão com atenção de verdade', icon: '📚', done: {} },
    { id: uid(), title: 'Revisar o que aprendi', detail: 'Releia ou tente explicar sem consultar', icon: '🧠', done: {} },
    { id: uid(), title: 'Organizar meus materiais', detail: 'Deixe o próximo estudo preparado', icon: '✏️', done: {} }
  ], xp: 0, activityDates: [],
  profile: { name: 'Meu cantinho', avatar: '' },
  studyStats: { totalSeconds: 0, dailySeconds: {}, completedSessions: 0 },
  mapPresets: { items: [], defaults: { text: 'builtin-glass-note', sticker: 'builtin-postit', image: 'builtin-image' } },
  workPinned: [], workShortcutsInitialized: false,
  settings: { study: 25, rest: 5, sound: true, theme: 'light', autoContrast: true, customBackground: '#f1f7fb', customText: '#20364b', baseColor: '#6db8eb', accent: '#6db8eb', highlightColor: '#fff0a8', font: 'Inter' }
});
const DATA_VERSION = 7;
const VERSION_KEY = 'azul-estudo-schema-version';
const LEGACY_STORAGE_KEYS = ['azul-estudo-data', 'azul-estudo-state', 'azulEstudoData', 'azul-estudo'];
let storageRecoveryError = '';
let migrationPending = false;
let rawBackupBeforeMigration = '';

function migrateState(raw) {
  const incoming = raw && typeof raw === 'object' && !Array.isArray(raw) ? JSON.parse(JSON.stringify(raw)) : {};
  const defaults = defaultState();
  const result = { ...defaults, ...incoming };
  result.settings = { ...defaults.settings, ...(incoming.settings || {}) };
  result.settings.baseColor = /^#[0-9a-f]{6}$/i.test(incoming.settings?.baseColor || '') ? incoming.settings.baseColor : (/^#[0-9a-f]{6}$/i.test(incoming.settings?.accent || '') ? incoming.settings.accent : defaults.settings.baseColor);
  result.settings.accent = result.settings.baseColor;
  result.settings.highlightColor = /^#[0-9a-f]{6}$/i.test(incoming.settings?.highlightColor || '') ? incoming.settings.highlightColor : defaults.settings.highlightColor;
  result.workPinned = Array.isArray(incoming.workPinned) ? incoming.workPinned.filter(id => typeof id === 'string').slice(0, 100) : [];
  result.workShortcutsInitialized = incoming.workShortcutsInitialized === true;
  result.profile = { ...defaults.profile, ...(incoming.profile || {}) };
  result.profile.name = String(result.profile.name || 'Meu cantinho').slice(0, 48);
  result.profile.avatar = validImageSource(result.profile.avatar || '');
  result.studyStats = { ...defaults.studyStats, ...(incoming.studyStats || {}) };
  result.studyStats.totalSeconds = Math.max(0, Number(result.studyStats.totalSeconds) || 0);
  result.studyStats.completedSessions = Math.max(0, Number(result.studyStats.completedSessions) || 0);
  result.studyStats.dailySeconds = result.studyStats.dailySeconds && typeof result.studyStats.dailySeconds === 'object' ? result.studyStats.dailySeconds : {};
  const presetDefaults = { text: 'builtin-glass-note', sticker: 'builtin-postit', image: 'builtin-image' };
  const storedPresets = incoming.mapPresets && typeof incoming.mapPresets === 'object' ? incoming.mapPresets : {};
  result.mapPresets = { items: Array.isArray(storedPresets.items) ? storedPresets.items.filter(p => p && typeof p === 'object' && typeof p.id === 'string') : [], defaults: { ...presetDefaults, ...(storedPresets.defaults || {}) } };
  if (!['light','dark','midnight'].includes(result.settings.theme)) result.settings.theme = 'light';
  result.settings.autoContrast = result.settings.autoContrast !== false;
  if (!['Inter','Noto Sans','Arial','Georgia','Trebuchet MS','Verdana','system-ui','monospace'].includes(result.settings.font)) result.settings.font = 'Inter';
  result.subjects = Array.isArray(incoming.subjects) ? incoming.subjects : [];
  result.tasks = Array.isArray(incoming.tasks) ? incoming.tasks : [];
  result.habits = Array.isArray(incoming.habits) ? incoming.habits : defaults.habits;
  result.activityDates = Array.isArray(incoming.activityDates) ? incoming.activityDates : [];
  result.xp = Number.isFinite(Number(incoming.xp)) ? Number(incoming.xp) : 0;
  result.subjects.forEach(subject => {
    if (!subject || typeof subject !== 'object') return;
    if (!Array.isArray(subject.topics)) subject.topics = [];
    subject.topics.forEach(topic => {
      if (!topic || typeof topic !== 'object') return;
      if (!Array.isArray(topic.map)) topic.map = [];
      const oldMapVersion = Number(topic.mapVersion || 0);
      if (oldMapVersion < 2) {
        // A versão anterior guardava x/y como porcentagens de uma folha de 410 px.
        // Converte uma única vez para coordenadas independentes em unidades do mundo.
        topic.map.forEach(node => {
          if (!node || typeof node !== 'object') return;
          const x = Number(node.x), y = Number(node.y);
          if (Number.isFinite(x)) node.x = Math.round(x * 12);
          if (Number.isFinite(y)) node.y = Math.round(y * 4.1);
        });
        topic.camera = topic.camera && typeof topic.camera === 'object' ? topic.camera : { cx: 0, cy: 0, zoom: 1 };
        topic.cameraNeedsFit = topic.map.length > 0;
      }
      topic.mapVersion = 2;
      topic.showGrid = topic.showGrid !== false;
      if (!topic.camera || typeof topic.camera !== 'object') topic.camera = { cx: 0, cy: 0, zoom: 1 };
      topic.camera = {
        cx: Number.isFinite(Number(topic.camera.cx)) ? Number(topic.camera.cx) : 0,
        cy: Number.isFinite(Number(topic.camera.cy)) ? Number(topic.camera.cy) : 0,
        zoom: Math.max(.1, Math.min(4, Number(topic.camera.zoom) || 1))
      };
      topic.map.forEach(node => {
        if (!node || typeof node !== 'object') return;
        if (typeof node.text !== 'string') node.text = String(node.text ?? '');
        if (!Array.isArray(node.links)) node.links = [];
        if (typeof node.fitText !== 'boolean') node.fitText = false;
        if (!Number.isFinite(Number(node.width)) || Number(node.width) < 100) node.width = 230;
        if (!Number.isFinite(Number(node.height)) || Number(node.height) < 60) node.height = 130;
      });
    });
  });
  result.dataVersion = DATA_VERSION;
  return result;
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(seconds / 3600), minutes = Math.floor((seconds % 3600) / 60), rest = seconds % 60;
  return `${hours}h ${String(minutes).padStart(2,'0')}min ${String(rest).padStart(2,'0')}s`;
}

function loadPersistedState() {
  const keys = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && /azul.*(data|state|store)|(?:data|state|store).*azul/i.test(key) && !/pre-migration|before-manual-import|backup/i.test(key) && !keys.includes(key)) keys.push(key);
  }
  let selected = null;
  const invalid = [];
  for (const key of keys) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const recognized = ['subjects', 'tasks', 'habits', 'xp', 'activityDates', 'settings']
          .some(field => Object.prototype.hasOwnProperty.call(parsed, field));
        if (!recognized) { invalid.push(key); continue; }
        if (!selected || key === STORAGE_KEY) selected = { key, raw, parsed };
        if (key === STORAGE_KEY) break;
      } else invalid.push(key);
    } catch (_) { invalid.push(key); }
  }
  if (!selected) {
    if (invalid.length) storageRecoveryError = `Não consegui ler os dados salvos (${invalid.join(', ')}). O conteúdo original foi mantido e nenhum dado novo será gravado até importar um backup válido.`;
    return defaultState();
  }
  rawBackupBeforeMigration = JSON.stringify({ backupKind: 'azul-estudo-pre-migration', sourceKey: selected.key, state: selected.parsed, invalidRaw: invalid.map(key => ({ key, raw: localStorage.getItem(key) })) });
  const storedVersion = Number(selected.parsed.dataVersion || (selected.key === STORAGE_KEY ? localStorage.getItem(VERSION_KEY) : 0) || 0);
  const hasUnmigratedMap = (selected.parsed.subjects || []).some(subject =>
    Array.isArray(subject?.topics) && subject.topics.some(topic => Number(topic?.mapVersion || 0) < 2)
  );
  const needsMigration = selected.key !== STORAGE_KEY || storedVersion < DATA_VERSION || hasUnmigratedMap;
  migrationPending = needsMigration;
  return migrateState(selected.parsed);
}

let state = loadPersistedState();
let currentPage = 'home';
let activeSubjectId = null;
let activeTopicId = null;
let selectedMapNodes = new Set();
let connectFrom = null;
let mapActiveEditor = null;
let mapSaveTimer = null;
let mapSpacePressed = false;
let mapHistory = { topicId: null, undo: [], redo: [] };
let mapClipboard = [];
let mapResizeObserver = null;
let mapFontSliderEditing = false;
let mapHighlightColor = state.settings.highlightColor || '#fff0a8';
let workApps = [];
let workAppsLoaded = false;
let workAppsLoading = false;
let workSearchTerm = '';
let workCategory = 'Todos';
let updateStatusCleanup = null;
let timer = { running:false, mode:'study', seconds: state.settings.study * 60, interval:null, scanInterval:null };
let lastStudyInteractionAt = Date.now();
let studyPersistCounter = 0;

const rankList = [
  { name:'Bronze', min:0, icon:'🥉', next:'Prata' },
  { name:'Prata', min:120, icon:'🥈', next:'Ouro' },
  { name:'Ouro', min:300, icon:'🥇', next:'Diamante' },
  { name:'Diamante', min:600, icon:'💎', next:'Rubi' },
  { name:'Rubi', min:1000, icon:'♦️', next:'Netherite' },
  { name:'Netherite', min:1600, icon:'⬡', next:'Máximo' }
];
const FONT_OPTIONS = ['Inter','Noto Sans','Arial','Georgia','Trebuchet MS','Verdana','system-ui','monospace'];
function initials(name) {
  return String(name || 'A').trim().split(/\s+/).slice(0,2).map(part => part[0] || '').join('').toUpperCase() || 'A';
}
function avatarMarkup() {
  const src = validImageSource(state.profile?.avatar || '');
  return src ? `<img src="${escapeHtml(src)}" alt="Foto de perfil">` : escapeHtml(initials(state.profile?.name));
}
function annotationStats() {
  return state.subjects.map(subject => {
    let words = 0, annotations = 0, mapNodes = 0;
    (subject.topics || []).forEach(topic => {
      const noteText = String(topic.notes || '').trim();
      if (noteText) { words += noteText.split(/\s+/).filter(Boolean).length; annotations++; }
      (topic.map || []).forEach(node => {
        const text = String(node.text || node.html || '').replace(/<[^>]*>/g,' ').trim();
        const count = text.split(/\s+/).filter(Boolean).length;
        if (count) { words += count; annotations++; }
        mapNodes++;
      });
    });
    return { id: subject.id, title: subject.title, words, annotations, mapNodes };
  }).sort((a,b) => b.words - a.words);
}
function dedicationStatus() {
  const days = Object.values(state.studyStats.dailySeconds || {}).filter(seconds => Number(seconds) >= 60).length;
  if (state.studyStats.totalSeconds >= 3600 && days >= 4) return { title: 'Estudante dedicada', detail: 'Pelo menos 1 hora registrada e atividade em 4 dias diferentes.' };
  return { title: 'Construindo constância', detail: 'A classificação muda com o tempo de estudo registrado e a regularidade.' };
}
function hexToHsl(hex) {
  const value = String(hex || '#6db8eb').replace('#','');
  const r=parseInt(value.slice(0,2),16)/255,g=parseInt(value.slice(2,4),16)/255,b=parseInt(value.slice(4,6),16)/255;
  const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
  let h=0,s=0,l=(max+min)/2;
  if(delta){s=delta/(1-Math.abs(2*l-1));if(max===r)h=((g-b)/delta)%6;else if(max===g)h=(b-r)/delta+2;else h=(r-g)/delta+4;h=(h*60+360)%360;}
  return {h,s:s*100,l:l*100};
}
function hslToHex(h,s,l) {
  h=((h%360)+360)%360;s=Math.max(0,Math.min(100,s))/100;l=Math.max(0,Math.min(100,l))/100;
  const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;
  let rgb=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
  return '#'+rgb.map(v=>Math.round((v+m)*255).toString(16).padStart(2,'0')).join('');
}
function colorLuminance(hex) {
  const value=String(hex||'#000000').replace('#','');
  const channels=[0,2,4].map(index=>parseInt(value.slice(index,index+2),16)/255).map(channel=>channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4);
  return .2126*channels[0]+.7152*channels[1]+.0722*channels[2];
}
function contrastRatio(a,b) {
  const first=colorLuminance(a),second=colorLuminance(b);
  return (Math.max(first,second)+.05)/(Math.min(first,second)+.05);
}
function bestContrastingText(background) {
  return contrastRatio(background,'#ffffff')>=contrastRatio(background,'#000000')?'#ffffff':'#152033';
}
function appPalette(baseColor, theme='light') {
  const base=/^#[0-9a-f]{6}$/i.test(baseColor||'')?baseColor:'#6db8eb';
  const hsl=hexToHsl(base);
  if(hsl.s<10){hsl.h=210;hsl.s=34;}
  const dark=theme!=='light';
  const strong=hslToHex(hsl.h,Math.max(42,hsl.s),dark?48:34);
  const support=hslToHex(hsl.h+42,Math.max(35,hsl.s*.74),dark?68:47);
  const complement=hslToHex(hsl.h+165,Math.max(35,hsl.s*.78),dark?69:45);
  const soft=hslToHex(hsl.h,Math.min(55,hsl.s*.48+8),theme==='light'?95:theme==='dark'?23:18);
  const entries=[['Base',base],['Destaque',strong],['Apoio',support],['Complementar',complement],['Superfície',soft]].map(([label,color])=>({label,color,foreground:bestContrastingText(color),contrast:Math.max(contrastRatio(color,'#ffffff'),contrastRatio(color,'#000000'))}));
  return {primary:base,strong,support,complement,soft,foreground:bestContrastingText(base),strongForeground:bestContrastingText(strong),entries};
}
const QUICK_COLOR_SWATCHES=['#ffffff','#f3f6fa','#1c2c3d','#36566d','#6db8eb','#388fc9','#a6d9bf','#edc77b','#e7a2ba','#c2afe8','#df9c72','#111827'];
function colorFieldMarkup(name,label,value) {
  const color=/^#[0-9a-f]{6}$/i.test(value||'')?value:'#ffffff';
  const swatches=QUICK_COLOR_SWATCHES.map(option=>`<button type="button" class="color-choice ${option.toLowerCase()===color.toLowerCase()?'selected':''}" data-color-choice="${name}" data-color-value="${option}" title="${option}" aria-label="Escolher cor ${option}"><span style="background:${option}"></span></button>`).join('');
  return `<div class="color-field"><span class="color-field-label">${escapeHtml(label)}</span><div class="color-choice-row" role="group" aria-label="Cores rápidas para ${escapeHtml(label)}">${swatches}</div><span class="color-field-preview"><i data-color-swatch="${name}" style="background:${color}"></i><code data-color-readout="${name}">${color.toUpperCase()}</code></span><details class="advanced-color-tools"><summary>Escolha avançada</summary><div class="advanced-color-row"><label>Seletor<input data-color-picker="${name}" name="${name}" type="color" value="${color}" aria-label="Seletor avançado: ${escapeHtml(label)}"></label><label>HEX<input data-color-hex-for="${name}" type="text" value="${color.toUpperCase()}" maxlength="7" spellcheck="false" aria-label="Código hexadecimal de ${escapeHtml(label)}"></label></div></details></div>`;
}
function settingsColorMarkup(id,label,value) {
  const color=/^#[0-9a-f]{6}$/i.test(value||'')?value:'#ffffff';
  return `<div class="settings-color-control"><span class="settings-color-label">${escapeHtml(label)}</span><span class="settings-color-preview"><i class="visible-color-swatch" data-color-swatch="${id}" style="background:${color}"></i><code data-color-readout="${id}">${color.toUpperCase()}</code></span><details class="advanced-color-tools" open><summary>Escolha avançada</summary><div class="advanced-color-row"><label>Seletor<input type="color" id="${id}" data-color-picker="${id}" value="${color}" aria-label="Seletor avançado: ${escapeHtml(label)}"></label><label>HEX<input type="text" data-color-hex-for="${id}" value="${color.toUpperCase()}" maxlength="7" spellcheck="false" aria-label="Código HEX de ${escapeHtml(label)}"></label></div></details></div>`;
}
function syncColorPair(target, root) {
  if (!target || !root) return null;
  const key = target.dataset.colorHexFor || target.dataset.colorPicker || target.name || target.id;
  if (!key) return null;
  let color = String(target.value || '').trim();
  if (target.dataset.colorHexFor) {
    if (/^[0-9a-f]{6}$/i.test(color)) color = `#${color}`;
    if (!/^#[0-9a-f]{6}$/i.test(color)) { target.setAttribute('aria-invalid','true'); return null; }
    target.removeAttribute('aria-invalid');
  }
  const picker = $$('input[type="color"]',root).find(input => input.dataset.colorPicker === key || input.name === key || input.id === key);
  const hex = $$('[data-color-hex-for]',root).find(input => input.dataset.colorHexFor === key);
  if (picker && picker.value.toLowerCase() !== color.toLowerCase()) picker.value = color;
  if (hex && hex.value.toLowerCase() !== color.toLowerCase()) hex.value = color.toUpperCase();
  const sample = $$('[data-color-swatch]',root).find(el => el.dataset.colorSwatch === key);
  const readout = $$('[data-color-readout]',root).find(el => el.dataset.colorReadout === key);
  if (sample) sample.style.background = color;
  if (readout) readout.textContent = color.toUpperCase();
  $$(`[data-color-choice="${key}"]`,root).forEach(button => button.classList.toggle('selected', button.dataset.colorValue.toLowerCase() === color.toLowerCase()));
  return { key, color };
}
function applySettingColor(key,color,persist=false) {
  if (!/^#[0-9a-f]{6}$/i.test(color || '')) return;
  if (key === 'app-base-color') { state.settings.baseColor=color; state.settings.accent=color; }
  else if (key === 'custom-bg-color') state.settings.customBackground=color;
  else if (key === 'custom-text-color') state.settings.customText=color;
  else if (key === 'map-highlight-color') { mapHighlightColor=color; state.settings.highlightColor=color; }
  if (persist) save();
  applyAppearance();
  if (key === 'app-base-color') {
    const preview=$('#generated-palette-preview');
    if (preview) preview.innerHTML=appPalette(color,state.settings.theme).entries.map(({label,color,foreground,contrast})=>`<div class="palette-chip"><span class="palette-color-sample" style="background:${color};color:${foreground}">Aa</span><small>${label}</small><code>${color.toUpperCase()} · ${contrast.toFixed(1)}:1</code></div>`).join('');
  }
}
function applyAppearance() {
  const settings = state.settings || {};
  const root = document.documentElement;
  const theme = ['light','dark','midnight'].includes(settings.theme) ? settings.theme : 'light';
  const baseColor = /^#[0-9a-f]{6}$/i.test(settings.baseColor || '') ? settings.baseColor : (/^#[0-9a-f]{6}$/i.test(settings.accent || '') ? settings.accent : '#6db8eb');
  const palette = appPalette(baseColor,theme);
  root.dataset.theme = theme;
  root.dataset.autoContrast = settings.autoContrast === false ? 'false' : 'true';
  root.style.setProperty('--custom-bg', /^#[0-9a-f]{6}$/i.test(settings.customBackground || '') ? settings.customBackground : '#f1f7fb');
  root.style.setProperty('--custom-ink', /^#[0-9a-f]{6}$/i.test(settings.customText || '') ? settings.customText : '#20364b');
  root.style.setProperty('--custom-accent', baseColor);
  root.style.setProperty('--accent', palette.primary);
  root.style.setProperty('--accent-strong', palette.strong);
  root.style.setProperty('--palette-soft', palette.soft);
  root.style.setProperty('--palette-support', palette.support);
  root.style.setProperty('--palette-complement', palette.complement);
  root.style.setProperty('--accent-foreground', palette.foreground);
  root.style.setProperty('--accent-strong-foreground', palette.strongForeground);
  const font = FONT_OPTIONS.includes(settings.font) ? settings.font : 'Inter';
  document.body.style.fontFamily = `'${font}', system-ui, sans-serif`;
  const topbar = document.querySelector('.topbar');
  if (topbar) topbar.style.setProperty('--titlebar-tint', theme === 'midnight' ? '#090e20' : theme === 'dark' ? '#171b26' : '#edf7ff');
  updateAppPalettePreview(baseColor);
}
function updateAppPalettePreview(baseColor) {
  const preview=$('#generated-palette-preview');if(!preview)return;
  const palette=appPalette(baseColor,state.settings?.theme||'light');
  preview.innerHTML=palette.entries.map(({label,color,foreground,contrast})=>`<div class="palette-chip"><span class="palette-color-sample" style="background:${color};color:${foreground}">Aa</span><small>${label}</small><code>${color.toUpperCase()} · ${contrast.toFixed(1)}:1</code></div>`).join('');
}

function rankInfo() {
  let index = 0;
  rankList.forEach((r, i) => { if (state.xp >= r.min) index = i; });
  const current = rankList[index];
  const next = rankList[index + 1];
  return { ...current, index, nextAt: next?.min ?? current.min, nextName: next?.name ?? 'Máximo', progress: next ? Math.max(0, Math.min(100, ((state.xp-current.min)/(next.min-current.min))*100)) : 100, remaining: next ? Math.max(0,next.min-state.xp) : 0 };
}
function save() {
  if (storageRecoveryError) { toast('Os dados salvos estão protegidos contra sobrescrita. Importe um backup válido nas configurações.'); return false; }
  if (migrationPending) {
    try {
      const backupKey = `${STORAGE_KEY}-pre-migration-${Date.now()}`;
      localStorage.setItem(backupKey, rawBackupBeforeMigration);
      window.azul?.backupBeforeMigration?.(rawBackupBeforeMigration)?.catch?.(() => {});
      migrationPending = false;
    } catch (error) {
      toast(`Não foi possível criar o backup antes da migração: ${error.message}`);
      return false;
    }
  }
  state.dataVersion = DATA_VERSION;
  state.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(VERSION_KEY, String(DATA_VERSION));
    updateSidebar();
    return true;
  } catch (error) {
    toast(`Falha ao salvar os dados: ${error.message}`);
    return false;
  }
}
function addXP(amount, reason) {
  const oldRank = rankInfo().name;
  state.xp += amount;
  state.activityDates = [...new Set([...state.activityDates, todayKey()])];
  save();
  const nextRank = rankInfo().name;
  playSound('complete');
  toast(`+${amount} XP · ${reason}`);
  if (oldRank !== nextRank) { playSound('rank'); toast(`Novo rank desbloqueado: ${nextRank}!`); }
}
function toast(message) {
  const root = $('#toast-root');
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = message; root.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
function playSound(kind='complete') {
  if (!state.settings.sound) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    const notes = kind === 'rank' ? [523,659,784,1046] : [660,880,990];
    notes.forEach((freq,i) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i*.13);
      gain.gain.exponentialRampToValueAtTime(.12, ctx.currentTime + i*.13 + .025);
      gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + i*.13 + .22);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(ctx.currentTime+i*.13); osc.stop(ctx.currentTime+i*.13+.24);
    });
    setTimeout(() => ctx.close(), 1200);
  } catch (_) {}
}
function getSubject(id) { return state.subjects.find(s => s.id === id); }
function getTopic(subject, id) { return subject?.topics?.find(t => t.id === id); }
function activeSubject() { return getSubject(activeSubjectId); }
function activeTopic() { return getTopic(activeSubject(), activeTopicId); }
function streakCount() {
  const set = new Set(state.activityDates);
  let d = new Date(); let count = 0;
  if (!set.has(todayKey())) d.setDate(d.getDate()-1);
  while (set.has(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`)) { count++; d.setDate(d.getDate()-1); }
  return count;
}
function updateSidebar() {
  const rank = rankInfo();
  const rankMini = $('#rank-mini'); if (rankMini) rankMini.textContent = `${rank.name} · ${state.xp} XP`;
  const profileName = $('#sidebar-profile-name'); if (profileName) profileName.textContent = state.profile?.name || 'Meu cantinho';
  const sidebarAvatar = $('#sidebar-avatar'); if (sidebarAvatar) { sidebarAvatar.innerHTML = avatarMarkup(); sidebarAvatar.classList.toggle('has-photo', !!state.profile?.avatar); }
  const topAvatar = $('#top-avatar'); if (topAvatar) { topAvatar.innerHTML = avatarMarkup(); topAvatar.classList.toggle('has-photo', !!state.profile?.avatar); }
  const count = $('#subject-count'); if (count) count.textContent = state.subjects.length;
  const streak = $('#streak-number'); if (streak) streak.textContent = `${streakCount()} ${streakCount() === 1 ? 'dia' : 'dias'}`;
  const fill = $('#streak-fill'); if (fill) fill.style.width = `${Math.min(100, streakCount()/7*100)}%`;
}
function setPage(page) {
  if (page !== 'mindmap') { connectFrom = null; selectedMapNodes.clear(); mapActiveEditor = null; mapResizeObserver?.disconnect(); mapResizeObserver = null; }
  currentPage = page;
  $$('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.page === page));
  const labels = { home:'Visão geral', subjects:'Minhas matérias', routine:'Rotina & tarefas', focus:'Modo foco', work:'Trabalho', mindmap:'Mapa mental', profile:'Meu perfil', settings:'Configurações' };
  $('#breadcrumb-current').textContent = labels[page] || 'Matérias';
  render();
}

function subjectCard(subject, large=false) {
  const topicCount = subject.topics?.length || 0;
  const bannerUrl = validImageSource(subject.banner);
  const bannerStyle = bannerUrl ? `background-image:linear-gradient(90deg,${subject.color}b8,${subject.color}55),url('${bannerUrl}');background-size:cover;background-position:center` : `background:linear-gradient(120deg,${subject.color || '#b8e1fa'},#ffffff)`;
  return `<article class="${large?'subject-large':'subject-card'}" data-open-subject="${subject.id}" style="font-family:${escapeHtml(subject.font || 'Inter')},sans-serif">
    <div class="subject-banner" style="${bannerStyle}"></div><div class="subject-title" style="color:${escapeHtml(subject.titleColor || '#325a76')}">${escapeHtml(subject.title)}</div>
    ${large?`<p>${escapeHtml(subject.description || 'Sua área de conhecimento.')}</p>`:''}
    <div class="subject-foot"><span>${topicCount} ${topicCount===1?'assunto':'assuntos'}</span><span>${escapeHtml(subject.label || 'Em andamento')}</span></div>
  </article>`;
}
function taskRows(tasks) {
  if (!tasks.length) return `<div class="empty-state"><div class="empty-icon">☁</div>Nenhuma tarefa por aqui ainda.<br>Adicione uma pequena meta para começar.</div>`;
  return `<div class="task-list">${tasks.map(task=>`<div class="task-row"><input class="task-check" type="checkbox" data-task-check="${task.id}" ${task.done?'checked':''}><span class="task-text ${task.done?'done':''}">${escapeHtml(task.title)}</span><span class="task-tag">${escapeHtml(task.tag || 'Hoje')}</span><button class="task-delete" data-delete-task="${task.id}" title="Excluir tarefa">×</button></div>`).join('')}</div>`;
}
function renderHome() {
  const rank=rankInfo(); const todayTasks=state.tasks.filter(t=>t.date===todayKey());
  const completed=todayTasks.filter(t=>t.done).length;
  return `<div class="welcome-line"><div><div class="eyebrow">${escapeHtml(new Intl.DateTimeFormat('pt-BR',{weekday:'long'}).format(new Date()).toUpperCase())} · UM PASSO DE CADA VEZ</div><h1 class="page-title">Olá! Bora aprender? <span style="font-size:23px">☁️</span></h1><div class="page-subtitle">Seu espaço está pronto para mais um dia de descobertas.</div></div><button class="primary-button" data-action="add-subject">＋ Nova matéria</button></div>
    <div class="dashboard-grid">
      <section class="hero-card"><div class="hero-copy"><div class="eyebrow">SEU CANTINHO DE FOCO</div><h2>Pequenos estudos,<br>grandes conquistas.</h2><p>Organize suas ideias, entenda seu ritmo e acompanhe o quanto você está evoluindo. Sem pressa, mas com constância.</p><div class="hero-meta"><span class="pill">✦ ${state.subjects.length} matérias</span><span class="pill">☑ ${completed}/${todayTasks.length} tarefas hoje</span></div></div><div class="hero-art"></div></section>
      <section class="stats-card"><div class="card-heading"><h3>Seu progresso</h3><span>nível atual</span></div><div class="rank-row"><div class="rank-gem">${rank.icon}</div><div class="rank-copy"><strong>${rank.name}</strong><small>${state.xp} pontos de experiência</small></div></div><div class="xp-line"><span>Próximo: ${rank.nextName}</span><b>${rank.remaining} XP</b></div><div class="progress"><span style="width:${rank.progress}%"></span></div><div class="small-muted" style="margin-top:12px">Você ganha XP ao concluir tarefas e sessões de estudo.</div></section>
    </div>
    <div class="section-row"><h3>Suas matérias</h3><button data-page="subjects">Ver todas ↗</button></div>
    ${state.subjects.length?`<div class="subject-grid">${state.subjects.slice(0,3).map(s=>subjectCard(s)).join('')}</div>`:`<div class="panel empty-state"><div class="empty-icon">📚</div><strong>Seu espaço começa aqui</strong><br>Crie sua primeira matéria e organize os assuntos que está estudando.<br><button class="soft-button" style="margin-top:14px" data-action="add-subject">Criar primeira matéria</button></div>`}
    <div class="lower-grid"><section class="panel"><div class="card-heading"><h3>Tarefas de hoje</h3><button class="tiny-button" data-action="add-task">＋ Adicionar</button></div>${taskRows(todayTasks)}</section>
      <section class="panel"><div class="card-heading"><h3>Uma pausa com propósito</h3><span>Pomodoro</span></div><div class="quick-pomo"><div class="mini-clock"><strong>${String(Math.floor(timer.seconds/60)).padStart(2,'0')}:${String(timer.seconds%60).padStart(2,'0')}</strong></div><div class="quick-pomo-copy"><strong>${timer.running?'Sessão em andamento':'Pronto para começar?'}</strong><p>Um bloco de concentração de cada vez. Faça pausas também.</p><button class="tiny-button" data-page="focus">Abrir cronômetro ↗</button></div></div></section></div>`;
}
function renderSubjects() {
  return `<div class="page-heading"><div><div class="eyebrow">BIBLIOTECA PESSOAL</div><h1 class="page-title">Minhas matérias</h1><div class="page-subtitle">Cada matéria tem seu próprio espaço, assuntos e mapas mentais.</div></div><button class="primary-button" data-action="add-subject">＋ Nova matéria</button></div>
  ${state.subjects.length?`<div class="subject-list">${state.subjects.map(s=>subjectCard(s,true)).join('')}</div>`:`<div class="panel empty-state"><div class="empty-icon">🗂️</div><strong>Nenhuma matéria criada</strong><br>Adicione uma matéria, escolha uma cor e personalize seu espaço.<br><button class="primary-button" style="margin-top:14px" data-action="add-subject">＋ Criar matéria</button></div>`}`;
}
function renderSubjectDetail(subject) {
  const topic=activeTopic();
  return `<div class="page-heading"><div><div class="eyebrow"><a href="#" data-page="subjects" style="color:#79a7c4;text-decoration:none">MINHAS MATÉRIAS</a> / ${escapeHtml(subject.title.toUpperCase())}</div><h1 class="page-title">${escapeHtml(subject.title)}</h1><div class="page-subtitle">${escapeHtml(subject.description || 'Seu espaço para organizar o que está aprendendo.')}</div></div><div style="display:flex;gap:7px"><button class="soft-button" data-action="edit-subject">Editar</button><button class="danger-button" data-action="delete-subject">Excluir matéria</button><button class="primary-button" data-action="add-topic">＋ Novo assunto</button></div></div>
  <div class="detail-layout"><aside class="detail-sidebar"><h3>Assuntos <span style="color:#9bb1c0;font-weight:400">(${subject.topics.length})</span></h3>${subject.topics.length?subject.topics.map(t=>`<div class="topic-item ${topic?.id===t.id?'active':''}" data-open-topic="${t.id}"><span class="topic-dot"></span>${escapeHtml(t.title)}</div>`).join(''):`<div class="empty-state" style="padding:25px 4px">Adicione o primeiro assunto.</div>`}</aside>
  <section class="detail-main">${topic?`<div class="eyebrow">ASSUNTO</div><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div><h2>${escapeHtml(topic.title)}</h2><div class="muted">${escapeHtml(topic.notes || 'Este assunto ainda não tem anotações.')}</div></div><div style="display:flex;gap:6px"><button class="soft-button" data-action="edit-topic">Editar</button><button class="danger-button" data-action="delete-topic">Excluir</button></div></div><div class="topic-info-grid"><div class="info-chip"><span>IMPORTÂNCIA</span><strong>${topic.important?'✦ Relevante':'○ Ainda vou avaliar'}</strong></div><div class="info-chip"><span>DOMÍNIO</span><strong>${escapeHtml(topic.known || 'Ainda não estudei')}</strong></div></div><div class="section-row" style="margin-top:15px"><h3>Visualize suas ideias</h3><button data-action="open-map">Abrir mapa mental ↗</button></div><div class="panel" style="background:#f7fbff;box-shadow:none"><div style="font-size:11px;color:#7897ac">Transforme este assunto em um mapa com blocos, imagens, stickers e conexões.</div><button class="tiny-button" style="margin-top:12px" data-action="open-map">Criar / editar mapa</button></div>`:`<div class="empty-state"><div class="empty-icon">📝</div><strong>Escolha um assunto</strong><br>Ou crie um novo para começar a organizar suas ideias.</div>`}</section></div>`;
}
function renderSubjectPage() {
  if (activeSubject()) return renderSubjectDetail(activeSubject());
  return renderSubjects();
}
function renderRoutine() {
  const done=state.habits.filter(h=>h.done?.[todayKey()]).length;
  const tasks=state.tasks.filter(t=>t.date===todayKey());
  return `<div class="page-heading"><div><div class="eyebrow">CONSTÂNCIA SEM COBRANÇA</div><h1 class="page-title">Rotina & tarefas</h1><div class="page-subtitle">Metas pequenas e possíveis para manter seu ritmo.</div></div><button class="primary-button" data-action="add-task">＋ Nova tarefa</button></div>
  <div class="routine-layout"><section class="habit-card"><div class="card-heading"><h3>Seus hábitos diários</h3><span>${done}/${state.habits.length} concluídos</span></div>${state.habits.map(h=>`<div class="habit-row"><div class="habit-icon">${escapeHtml(h.icon || '✦')}</div><div class="habit-copy"><strong>${escapeHtml(h.title)}</strong><span>${escapeHtml(h.detail || 'Um hábito para cuidar dos estudos.')}</span></div><button class="task-delete" data-delete-habit="${h.id}" title="Excluir hábito">×</button><input class="task-check" type="checkbox" data-habit-check="${h.id}" ${h.done?.[todayKey()]?'checked':''}></div>`).join('')}<button class="soft-button" style="margin-top:12px" data-action="add-habit">＋ Criar hábito</button></section>
  <section class="habit-card"><div class="card-heading"><h3>Missões de hoje</h3><span>${tasks.filter(t=>t.done).length}/${tasks.length}</span></div>${taskRows(tasks)}</section></div>`;
}
function formatTime(seconds) { return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`; }
function workAppCard(appInfo, pinned=false) {
  const safeId=escapeHtml(appInfo.id);
  return `<article class="work-app-card"><button type="button" class="work-app-main" data-launch-installed="${safeId}" title="Abrir ${escapeHtml(appInfo.name)}"><span class="work-app-glyph">${escapeHtml(appInfo.glyph || '▣')}</span><span class="work-app-copy"><strong>${escapeHtml(appInfo.name)}</strong><small>${escapeHtml(appInfo.category || 'Aplicativo')}</small></span><span class="work-app-open">↗</span></button><button type="button" class="work-app-pin ${pinned?'is-pinned':''}" data-work-pin="${safeId}" title="${pinned?'Remover dos atalhos':'Fixar nos atalhos'}" aria-label="${pinned?'Desafixar':'Fixar'} ${escapeHtml(appInfo.name)}">${pinned?'★':'☆'}</button></article>`;
}
function renderWork() {
  const categories=['Todos','Estudo','Criação','Comunicação','Mídia','Aplicativos'];
  const query=workSearchTerm.trim().toLocaleLowerCase('pt-BR');
  const pinned=state.workPinned.map(id=>workApps.find(appInfo=>appInfo.id===id)).filter(Boolean);
  const filtered=workApps.filter(appInfo=>(workCategory==='Todos'||appInfo.category===workCategory)&&(!query||`${appInfo.name} ${appInfo.category}`.toLocaleLowerCase('pt-BR').includes(query)));
  return `<div class="page-heading"><div><div class="eyebrow">SEU AMBIENTE DE TRABALHO</div><h1 class="page-title">Trabalho</h1><div class="page-subtitle">Seus aplicativos instalados em um só lugar. Fixe os que você mais usa.</div></div><button class="soft-button" data-action="refresh-work-apps">↻ Atualizar aplicativos</button></div>
  <section class="work-tools-panel"><label class="work-search"><span>⌕</span><input type="search" id="work-app-search" value="${escapeHtml(workSearchTerm)}" placeholder="Buscar aplicativo instalado..." autocomplete="off"></label><div class="work-categories" role="group" aria-label="Filtrar aplicativos">${categories.map(category=>`<button type="button" class="work-category ${workCategory===category?'active':''}" data-work-category="${category}">${category}</button>`).join('')}</div></section>
  ${pinned.length?`<section class="work-section"><div class="work-section-heading"><div><h2>Acesso rápido</h2><p>Atalhos sugeridos automaticamente e os que você fixou.</p></div><span>${pinned.length} fixados</span></div><div class="work-app-grid">${pinned.map(appInfo=>workAppCard(appInfo,true)).join('')}</div></section>`:''}
  <section class="work-section"><div class="work-section-heading"><div><h2>${workCategory==='Todos'?'Aplicativos encontrados':workCategory}</h2><p>${workAppsLoaded?'Aplicativos disponíveis neste dispositivo.':'Procurando os aplicativos instalados...'}</p></div><span>${filtered.length} encontrados</span></div>${workAppsLoading?'<div class="work-empty">Lendo a lista de aplicativos do sistema…</div>':filtered.length?`<div class="work-app-grid">${filtered.map(appInfo=>workAppCard(appInfo,state.workPinned.includes(appInfo.id))).join('')}</div>`:`<div class="work-empty">${workAppsLoaded?'Nenhum aplicativo corresponde a esta busca.':'A lista de aplicativos ainda não foi carregada.'}</div>`}</section>
  <p class="work-footnote">Os atalhos apenas abrem aplicativos que já estão instalados. O Azul não instala nem remove programas.</p>`;
}
async function loadWorkApps(force=false) {
  if (workAppsLoading || (workAppsLoaded && !force)) return;
  workAppsLoading=true;
  if (currentPage==='work') render();
  try {
    const result=await window.azul?.listInstalledApps?.();
    workApps=Array.isArray(result?.apps)?result.apps:[];
    workAppsLoaded=!!result?.ok;
    if (result?.ok && workApps.length && !state.workShortcutsInitialized) {
      const preferred=[/firefox|chrome|chromium|brave|edge/,/obsidian|notion/,/code|visual studio/,/libreoffice|writer|word/,/spotify/,/whatsapp|discord/,/krita|gimp|inkscape/];
      const picks=[];
      for (const pattern of preferred) { const found=workApps.find(appInfo=>pattern.test(appInfo.name.toLowerCase())&&!picks.includes(appInfo.id)); if(found)picks.push(found.id); }
      state.workPinned=[...new Set([...(state.workPinned||[]),...picks])].slice(0,12);
      state.workShortcutsInitialized=true;
      save();
    }
  } catch (_) { workApps=[]; workAppsLoaded=false; }
  finally { workAppsLoading=false; if(currentPage==='work') render(); }
}
let focusMode = 'normal';
function renderFocus() {
  const modeLabel = timer.mode==='study'?'Tempo de estudo':'Tempo de descanso';
  const total = (timer.mode==='study'?state.settings.study:state.settings.rest)*60;
  const degree = total ? 360*(1-timer.seconds/total) : 0;
  return `<div class="page-heading"><div><div class="eyebrow">PRESENÇA, NÃO PERFEIÇÃO</div><h1 class="page-title">Modo foco</h1><div class="page-subtitle">Ajuste seu ritmo e cuide da sua atenção.</div></div></div>
  <div class="focus-layout"><section class="timer-card"><div class="timer-caption">SEU TEMPO, SEU RITMO</div><div class="timer-ring" id="timer-ring" style="background:conic-gradient(#6fb9e8 ${degree}deg,#d9ebf7 ${degree}deg)"><div class="timer-ring-inner"><div class="timer-display" id="timer-display">${formatTime(timer.seconds)}</div><div class="timer-mode" id="timer-mode">${modeLabel}</div></div></div><div class="timer-controls"><button class="primary-button" id="timer-toggle">${timer.running?'Pausar':'Começar sessão'}</button><button class="soft-button" id="timer-reset">Reiniciar</button><button class="soft-button" id="timer-skip">Pular etapa</button></div>
  <div class="timer-settings"><label class="setting-field">Estudo <input type="number" min="1" max="180" id="study-minutes" value="${state.settings.study}"> min</label><label class="setting-field">Pausa <input type="number" min="1" max="60" id="rest-minutes" value="${state.settings.rest}"> min</label></div>
  <div class="mode-select"><button class="mode-chip ${focusMode==='normal'?'active':''}" data-focus-mode="normal">Normal</button><button class="mode-chip ${focusMode==='soft'?'active':''}" data-focus-mode="soft">Foco</button><button class="mode-chip ${focusMode==='strict'?'active':''}" data-focus-mode="strict">Intenso</button></div></section>
  <aside class="focus-side"><div class="focus-note"><h3>✦ Como funciona</h3><p><b>Normal:</b> só acompanha o cronômetro.<br><b>Foco:</b> mostra lembretes e atalhos para os apps escolhidos.<br><b>Intenso:</b> também verifica alguns aplicativos que costumam distrair e avisa quando encontra algum.</p>${focusMode==='normal'?'<p class="small-muted" style="margin-top:12px">Ative Foco para ver os atalhos dos seus apps permitidos.</p>':`<div class="allowed-apps"><span class="app-chip"><button data-launch-app="firefox">🦊 Firefox ↗</button></span><span class="app-chip"><button data-launch-app="spotify">♫ Spotify ↗</button></span><span class="app-chip"><button data-launch-app="whatsapp">◉ WhatsApp ↗</button></span></div>`}</div>
  <div class="warning-note">O modo Intenso é uma proteção de melhor esforço: ele detecta alguns aplicativos conhecidos, mas não bloqueia o sistema inteiro nem encerra nada sem sua autorização.</div></aside></div>`;
}
function safeMapHtml(html, plainText='') {
  const source = typeof html === 'string' && html.trim() ? html : escapeHtml(plainText).replace(/\r?\n/g, '<br>');
  const parsed = new DOMParser().parseFromString(`<div>${source}</div>`, 'text/html');
  const allowed = new Set(['B','STRONG','I','EM','U','MARK','BR','P','DIV','UL','OL','LI']);
  const cleanNode = node => {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.nodeValue || '');
    if (node.nodeType !== Node.ELEMENT_NODE) return document.createDocumentFragment();
    if (!allowed.has(node.tagName)) {
      const fragment = document.createDocumentFragment();
      [...node.childNodes].forEach(child => fragment.appendChild(cleanNode(child)));
      return fragment;
    }
    const element = document.createElement(node.tagName.toLowerCase());
    [...node.childNodes].forEach(child => element.appendChild(cleanNode(child)));
    return element;
  };
  const result = document.createElement('div');
  [...parsed.body.firstElementChild.childNodes].forEach(child => result.appendChild(cleanNode(child)));
  return result.innerHTML || '<br>';
}
function mapNodeContent(node) {
  return safeMapHtml(node.html, node.text || '');
}
function mapCameraFor(topic) {
  if (!topic.camera || typeof topic.camera !== 'object') topic.camera = { cx: 0, cy: 0, zoom: 1 };
  topic.camera.zoom = Math.max(.1, Math.min(4, Number(topic.camera.zoom) || 1));
  return topic.camera;
}
function renderMindmap() {
  const subject=activeSubject(), topic=activeTopic();
  if (!subject || !topic) {
    return `<div class="page-heading"><div><div class="eyebrow">PENSAR EM CONEXÕES</div><h1 class="page-title">Mapa mental</h1><div class="page-subtitle">Monte ideias visuais em um espaço sem bordas.</div></div></div><div class="panel empty-state"><div class="empty-icon">⌘</div><strong>Escolha uma matéria e um assunto primeiro</strong><br>Abra uma matéria, crie ou selecione um assunto e entre no mapa mental.<br><button class="soft-button" style="margin-top:14px" data-page="subjects">Ir para matérias</button></div>`;
  }
  const nodes = topic.map || [];
  const camera = mapCameraFor(topic);
  const selectedCount = selectedMapNodes.size;
  const nodeHtml = nodes.map(n => {
    const background = /^#[0-9a-f]{6}$/i.test(n.background || '') ? n.background : '#ffffff';
    const textColor = /^#[0-9a-f]{6}$/i.test(n.textColor || '') ? n.textColor : '#36566d';
    const borderColor = /^#[0-9a-f]{6}$/i.test(n.borderColor || '') ? n.borderColor : '#d7eaf7';
    const width = Math.max(120, Math.min(1200, Number(n.width) || 230));
    const height = Math.max(75, Math.min(1200, Number(n.height) || 130));
    const radius = n.shape==='square'?'5px':n.shape==='pill'?'24px':'14px';
    const shadow = n.shadow==='none'?'none':n.shadow==='strong'?'0 16px 38px rgba(22,42,60,.24)':'0 9px 26px rgba(55,85,110,.14)';
    const font = FONT_OPTIONS.includes(n.fontFamily)?n.fontFamily:'Inter';
    const fontSize = Math.max(9,Math.min(144,Number(n.fontSize)||(n.type==='title'?22:n.type==='subtitle'?16:12)));
    const borderWidth = Math.max(1,Math.min(6,Number(n.borderWidth)||1));
    const borderStyle = ['solid','dashed','dotted'].includes(n.borderStyle)?n.borderStyle:'solid';
    const isImageNode=n.type==='image';
    const imageSource=validImageSource(n.image);
    const hasCaption=String(n.text||'').trim().length>0 || Boolean(String(n.html||'').replace(/<[^>]*>/g,'').trim());
    const nodeStyle = `left:${Number(n.x)||0}px;top:${Number(n.y)||0}px;width:${width}px;height:${height}px;min-height:75px;background:${background};color:${textColor};border-color:${borderColor};border-width:${borderWidth}px;border-style:${borderStyle};border-radius:${radius};box-shadow:${shadow};font-family:'${font}',sans-serif;font-size:${fontSize}px;${n.type==='sticker'?`transform:rotate(${Math.max(-7,Math.min(7,Number(n.rotation)||0))}deg);`:''}`;
    return `<article class="map-node ${n.type==='sticker'?'postit-node':''} ${isImageNode?'map-image-node':''} ${selectedMapNodes.has(n.id)?'selected':''}" data-map-node="${escapeHtml(n.id)}" data-node-type="${escapeHtml(n.type || 'text')}" data-fit-text="${n.fitText===true?'true':'false'}" style="${nodeStyle}">
      <div class="map-node-head"><span class="node-emoji">${isImageNode?'':escapeHtml(n.sticker || '✦')}</span><div class="map-node-actions"><button type="button" data-style-node="${escapeHtml(n.id)}" title="Aparência do bloco">⚙</button><button type="button" data-delete-node="${escapeHtml(n.id)}" title="Remover bloco">×</button></div></div>
      ${isImageNode?`<div class="map-image-frame">${imageSource?`<img class="map-node-image" src="${escapeHtml(imageSource)}" alt="${escapeHtml(n.text||'Imagem do mapa')}" draggable="false">`:`<div class="map-image-placeholder">Escolha uma imagem nas opções do bloco</div>`}</div>`:''}
      ${(!isImageNode||hasCaption)?`<div class="map-richtext ${isImageNode?'map-image-caption':''}" data-node-content="${escapeHtml(n.id)}" contenteditable="true" spellcheck="false" style="font-size:${fontSize}px">${mapNodeContent(n)}</div>`:''}
    </article>`;
  }).join('');
  return `<div class="page-heading map-page-heading"><div><div class="eyebrow">${escapeHtml(subject.title.toUpperCase())} / ${escapeHtml(topic.title.toUpperCase())}</div><h1 class="page-title">Mapa mental</h1><div class="page-subtitle">Espaço infinito · arraste o fundo para navegar e edite o texto diretamente nos blocos.</div></div><button class="soft-button" data-page="subjects">← Voltar</button></div>
    <div class="map-toolbar map-toolbar-main">
      <button class="tiny-button" data-action="add-map-node">＋ Texto</button><button class="soft-button" data-action="add-map-title">Título</button><button class="soft-button" data-action="add-map-subtitle">Subtítulo</button><button class="soft-button" data-action="add-map-sticker">✦ Sticker</button><button class="soft-button" data-action="add-map-image">▧ Imagem URL</button><button class="soft-button ${connectFrom?'active-tool':''}" data-action="connect-nodes">${connectFrom?'Conexão: escolha outro bloco':'↗ Conectar'}</button>
      <span class="map-toolbar-separator"></span><button class="map-format-btn" data-format="bold" title="Negrito"><b>B</b></button><button class="map-format-btn" data-format="italic" title="Itálico"><i>I</i></button><button class="map-format-btn" data-format="underline" title="Sublinhado"><u>U</u></button><button class="map-format-btn map-highlight-btn" data-format="hiliteColor" title="Aplicar cor do marcador selecionada">▰</button><div class="map-highlight-palette" role="group" aria-label="Cores do marcador">${[['#fff0a8','Amarelo'],['#b9f2cf','Verde'],['#bfe5ff','Azul'],['#ffd0df','Rosa'],['#e0d0ff','Lilás'],['#ffd9ae','Pêssego'],['#f3f4f6','Cinza']].map(([color,label])=>`<button type="button" class="map-highlight-swatch ${mapHighlightColor===color?'selected':''}" data-highlight-color="${color}" title="${label}" aria-label="Marcador ${label}"><span style="background:${color}"></span></button>`).join('')}</div><details class="map-highlight-advanced advanced-color-tools"><summary>＋ Cor</summary><div class="advanced-color-row"><label>Seletor<input id="map-highlight-color" data-color-picker="map-highlight-color" type="color" value="${mapHighlightColor}"></label><label>HEX<input data-color-hex-for="map-highlight-color" type="text" value="${mapHighlightColor.toUpperCase()}" maxlength="7"></label></div></details><div class="map-font-control" title="Tamanho do texto do bloco selecionado"><span class="map-font-mark">Texto</span><button type="button" data-map-font-step="-2" ${selectedCount?'':'disabled'} aria-label="Diminuir tamanho">−</button><input id="map-font-size-slider" type="range" min="9" max="144" step="1" value="${selectedCount?Math.round(Number(nodes.find(n=>selectedMapNodes.has(n.id))?.fontSize)||12):12}" ${selectedCount?'':'disabled'} aria-label="Arraste para alterar o tamanho do texto"><output id="map-font-size-value">${selectedCount?Math.round(Number(nodes.find(n=>selectedMapNodes.has(n.id))?.fontSize)||12):12}px</output><input id="map-font-size-control" type="number" min="9" max="144" value="${selectedCount?Math.round(Number(nodes.find(n=>selectedMapNodes.has(n.id))?.fontSize)||12):12}" ${selectedCount?'':'disabled'} aria-label="Tamanho da fonte em pixels"><button type="button" data-map-font-step="2" ${selectedCount?'':'disabled'} aria-label="Aumentar tamanho">＋</button></div><button class="soft-button" data-action="style-selected" ${selectedCount?'':'disabled'}>✧ Estilo e tamanho</button><button class="soft-button" data-action="map-presets">▤ Presets</button><button class="soft-button" data-action="style-connections">Conexões</button><button class="soft-button" data-action="delete-selected" ${selectedCount?'':'disabled'}>Excluir seleção</button>
    </div>
    <div class="map-toolbar map-toolbar-navigation">
      <button class="map-zoom-button" data-action="map-zoom-out" title="Diminuir zoom">−</button><button class="map-zoom-label" id="map-zoom-label">${Math.round(camera.zoom*100)}%</button><button class="map-zoom-button" data-action="map-zoom-in" title="Aumentar zoom">＋</button><button class="soft-button" data-action="map-zoom-reset">100%</button><button class="soft-button" data-action="map-fit">Enquadrar conteúdo</button><button class="soft-button ${topic.showGrid===false?'':'active-tool'}" data-action="map-grid">${topic.showGrid===false?'Mostrar grade':'Ocultar grade'}</button><button class="soft-button" data-action="map-undo" ${mapHistory.undo.length?'':'disabled'} title="Ctrl+Z">↶ Desfazer</button><button class="soft-button" data-action="map-redo" ${mapHistory.redo.length?'':'disabled'} title="Ctrl+Shift+Z">↷ Refazer</button><span class="map-meta" id="map-meta">${nodes.length} blocos · ${topic.connections?.length || countMapConnections(nodes)} conexões · ${selectedCount} selecionados</span>
    </div>
    <div class="map-board ${topic.showGrid===false?'grid-hidden':''}" id="map-board" tabindex="0" aria-label="Canvas infinito do mapa mental">
      <svg class="map-svg" id="map-svg" aria-hidden="true"><defs><marker id="map-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L8,4 L0,8 Z" fill="#79acd0"></path></marker></defs><g id="map-edges"></g></svg>
      <div class="map-world" id="map-world">${nodeHtml}</div>
      ${nodes.length?'':'<div class="empty-map-hint">Seu canvas está vazio. Crie um bloco em qualquer região do espaço. ✦</div>'}
      <div class="map-canvas-hint">Espaço + arrastar ou botão do meio para mover · Ctrl + scroll para zoom · Shift + clique para selecionar vários</div>
    </div>`;
}
function countMapConnections(nodes) {
  const seen = new Set();
  (nodes || []).forEach(node => (node.links || []).forEach(id => seen.add([node.id,id].sort().join('::'))));
  return seen.size;
}

function renderProfile() {
  const status = dedicationStatus();
  const ranking = rankInfo();
  const notes = annotationStats();
  const topSubjects = notes.slice(0,5);
  const daily = Object.entries(state.studyStats.dailySeconds || {}).sort((a,b) => b[0].localeCompare(a[0])).slice(0,7);
  const activeDays = Object.values(state.studyStats.dailySeconds || {}).filter(seconds => Number(seconds) >= 60).length;
  const totalWords = notes.reduce((sum,item) => sum + item.words, 0);
  return `<div class="page-heading profile-heading"><div><div class="eyebrow">SEU CAMINHO DE APRENDIZADO</div><h1 class="page-title">Meu perfil</h1><div class="page-subtitle">Seu histórico, suas anotações e o tempo que você dedicou aos estudos.</div></div><button class="primary-button" data-action="edit-profile">Editar perfil</button></div>
    <section class="profile-hero glass-panel"><div class="profile-identity"><div class="profile-avatar-large">${avatarMarkup()}</div><div><h2>${escapeHtml(state.profile?.name || 'Meu cantinho')}</h2><span>${ranking.icon} ${ranking.name} · ${state.xp} XP</span><p>${escapeHtml(status.detail)}</p></div></div><div class="dedication-mark"><span>✦</span><strong>${status.title}</strong><small>Baseado no seu histórico registrado</small></div></section>
    <div class="profile-stats-grid"><article class="profile-stat glass-panel"><span>TEMPO TOTAL DE ESTUDO</span><strong class="live-study-time" id="profile-total-time">${formatDuration(state.studyStats.totalSeconds)}</strong><small>Contado durante sessões de foco com atividade recente</small></article><article class="profile-stat glass-panel"><span>SESSÕES CONCLUÍDAS</span><strong>${state.studyStats.completedSessions}</strong><small>Pomodoros de estudo finalizados</small></article><article class="profile-stat glass-panel"><span>DIAS COM ESTUDO</span><strong>${activeDays}</strong><small>Dias com pelo menos 1 minuto registrado</small></article><article class="profile-stat glass-panel"><span>PALAVRAS ANOTADAS</span><strong>${totalWords.toLocaleString('pt-BR')}</strong><small>Estimativa baseada em notas e blocos de mapas</small></article></div>
    <div class="profile-columns"><section class="profile-panel glass-panel"><div class="card-heading"><h3>Matérias em que mais anota</h3><span>por palavras</span></div>${topSubjects.length?topSubjects.map((item,index)=>`<div class="subject-stat-row"><span class="subject-stat-rank">${index+1}</span><div class="subject-stat-copy"><strong>${escapeHtml(item.title)}</strong><small>${item.annotations} anotações · ${item.mapNodes} blocos de mapa</small><div class="subject-stat-track"><i style="width:${Math.max(2,Math.round(item.words/Math.max(1,topSubjects[0].words)*100))}%"></i></div></div><b>${item.words.toLocaleString('pt-BR')} palavras</b></div>`).join(''):'<div class="small-muted">Suas matérias e anotações aparecerão aqui.</div>'}</section>
    <section class="profile-panel glass-panel"><div class="card-heading"><h3>Atividade recente</h3><span>tempo por dia</span></div>${daily.length?daily.map(([date,seconds])=>`<div class="activity-row"><span>${new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short'}).format(new Date(`${date}T12:00:00`))}</span><div class="activity-track"><i style="width:${Math.max(3,Math.min(100,Number(seconds)/Math.max(1,...daily.map(item=>Number(item[1])))*100))}%"></i></div><b>${formatDuration(seconds)}</b></div>`).join(''):'<div class="small-muted">Inicie uma sessão no Modo foco para registrar seu tempo.</div>'}<p class="profile-footnote">O contador registra somente o Pomodoro de estudo enquanto o app recebe interação recente. Após 5 minutos sem atividade, o tempo deixa de ser contabilizado até você voltar.</p></section></div>`;
}
function editProfile() {
  const profile = state.profile || { name:'Meu cantinho', avatar:'' };
  const form = openModal('Personalizar perfil',`<div class="form-field"><label>Nome exibido</label><input name="name" maxlength="48" required value="${escapeHtml(profile.name || '')}" placeholder="Como quer ser chamada no app?"></div><div class="form-field"><label>Foto de perfil (URL HTTPS ou imagem local)</label><input name="avatar" value="${escapeHtml(profile.avatar || '')}" placeholder="https://..."><button type="button" class="soft-button" id="choose-profile-avatar">Escolher imagem do computador</button></div><div class="profile-modal-preview">Prévia: <span id="profile-name-preview">${escapeHtml(profile.name || 'Meu cantinho')}</span></div>`,values=>{
    state.profile.name = values.name.trim() || 'Meu cantinho';
    state.profile.avatar = validImageSource(values.avatar);
    save(); render(); toast('Perfil atualizado.');
  });
  const nameInput = $('[name="name"]',form), preview = $('#profile-name-preview',$('#modal-root'));
  nameInput?.addEventListener('input',()=>{ if(preview) preview.textContent=nameInput.value || 'Meu cantinho'; });
  bindLocalImagePicker('choose-profile-avatar','avatar');
}
function openMapConnectionStyle() {
  const topic=activeTopic(); if(!topic)return;
  const style=topic.edgeStyle || {};
  openModal('Estilo das conexões',`${colorFieldMarkup('color','Cor das linhas',style.color||'#78acd0')}<div class="form-field"><label>Espessura</label><input name="width" type="number" min="1" max="8" value="${Math.max(1,Math.min(8,Number(style.width)||2))}"></div><div class="form-field"><label>Traçado</label><select name="dash"><option value="solid" ${style.dash==='solid'?'selected':''}>Contínuo</option><option value="dashed" ${style.dash==='dashed'?'selected':''}>Tracejado</option><option value="dotted" ${style.dash==='dotted'?'selected':''}>Pontilhado</option></select></div><div class="form-field"><label>Curvatura</label><select name="curve"><option value="soft" ${(!style.curve||style.curve==='soft')?'selected':''}>Suave</option><option value="wide" ${style.curve==='wide'?'selected':''}>Ampla</option><option value="straight" ${style.curve==='straight'?'selected':''}>Quase reta</option></select></div>`,values=>{pushMapHistory();topic.edgeStyle={color:values.color,width:Math.max(1,Math.min(8,Number(values.width)||2)),dash:values.dash,curve:values.curve};save();render();});
}
function updateStatusText(message,status='info',version='') {
  const label=$('#updater-status');
  if(label){label.textContent=message;label.dataset.status=status;}
  const download=$('#download-update-button'),install=$('#install-update-button');
  if(download)download.hidden=status!=='available';
  if(install)install.hidden=status!=='downloaded';
  if(version){const versionNode=$('#installed-app-version');if(versionNode)versionNode.textContent=version;}
}
function applyUpdateStatus(payload={}) {
  const version=payload.version?`v${payload.version}`:'';
  if(payload.status==='checking')updateStatusText('Procurando uma versão mais recente…','checking');
  else if(payload.status==='available')updateStatusText(`A versão ${payload.version||'nova'} está disponível. Baixe para instalar.`,'available');
  else if(payload.status==='up-to-date')updateStatusText('Você já está usando a versão mais recente.','up-to-date',version);
  else if(payload.status==='downloading')updateStatusText(`Baixando atualização… ${Math.max(0,Math.min(100,Number(payload.percent)||0))}%`,'downloading');
  else if(payload.status==='downloaded')updateStatusText(`A versão ${payload.version||'nova'} foi baixada e está pronta para instalar.`,'downloaded');
  else if(payload.status==='error')updateStatusText(payload.message||'Falha ao verificar atualização.','error');
}
async function initUpdatePanel() {
  if(!window.azul)return;
  if(!updateStatusCleanup && typeof window.azul.onUpdateStatus==='function') updateStatusCleanup=window.azul.onUpdateStatus(applyUpdateStatus);
  try {
    const currentStatus=await window.azul.getUpdateStatus?.();
    if(currentStatus && currentStatus.status && currentStatus.status!=='idle')applyUpdateStatus(currentStatus);
    const info=await window.azul.getAppInfo();
    const versionNode=$('#installed-app-version');
    if(versionNode)versionNode.textContent=`v${info?.version||'desconhecida'} · ${info?.platform||'desktop'}`;
    if(!info?.packaged)updateStatusText('O atualizador funciona no AppImage/instalador publicado, não na execução de desenvolvimento.','info');
  } catch (_) { updateStatusText('Não foi possível consultar a versão instalada.','error'); }
}

function renderSettings() {
  const settings=state.settings;
  return `<div class="page-heading"><div><div class="eyebrow">PREFERÊNCIAS DO SEU ESPAÇO</div><h1 class="page-title">Configurações</h1><div class="page-subtitle">Ajuste a aparência, a leitura e o funcionamento do Azul.</div></div></div>
  <div class="settings-layout"><section class="settings-panel glass-panel"><div class="settings-section-title"><span class="settings-section-icon">◐</span><div><h3>Aparência</h3><p>Três ambientes visuais, com superfícies translúcidas inspiradas no Liquid Glass.</p></div></div>
    <div class="theme-picker"><label class="theme-choice ${settings.theme==='light'?'selected':''}"><input type="radio" name="theme-choice" value="light" ${settings.theme==='light'?'checked':''}><span class="theme-preview theme-light"><i></i><i></i><i></i></span><b>Claro</b><small>Vidro luminoso</small></label><label class="theme-choice ${settings.theme==='dark'?'selected':''}"><input type="radio" name="theme-choice" value="dark" ${settings.theme==='dark'?'checked':''}><span class="theme-preview theme-dark"><i></i><i></i><i></i></span><b>Escuro</b><small>Vidro grafite</small></label><label class="theme-choice ${settings.theme==='midnight'?'selected':''}"><input type="radio" name="theme-choice" value="midnight" ${settings.theme==='midnight'?'checked':''}><span class="theme-preview theme-midnight"><i></i><i></i><i></i></span><b>Meia-noite</b><small>Azul profundo</small></label></div>
    <div class="settings-row"><div><strong>Contraste automático</strong><small>Ajusta textos, ícones e bordas para o tema selecionado.</small></div><input class="switch" type="checkbox" id="auto-contrast-toggle" ${settings.autoContrast?'checked':''}></div>
    <div class="global-palette-box"><div class="global-palette-heading"><div><strong>Paleta geral do aplicativo</strong><small>Escolha uma cor-base. O Azul cria tons de apoio e destaque e escolhe automaticamente a cor do texto com melhor contraste.</small></div><div class="base-color-picker">${settingsColorMarkup('app-base-color','Cor-base',settings.baseColor||settings.accent||'#6db8eb')}</div></div><div class="generated-palette" id="generated-palette-preview">${appPalette(settings.baseColor||settings.accent,settings.theme).entries.map(({label,color,foreground,contrast})=>`<div class="palette-chip"><span class="palette-color-sample" style="background:${color};color:${foreground}">Aa</span><small>${label}</small><code>${color.toUpperCase()} · ${contrast.toFixed(1)}:1</code></div>`).join('')}</div><small class="palette-contrast-note">Amostras mostram o contraste calculado entre o fundo e o texto sugerido.</small></div>
    <div class="settings-color-grid manual-color-grid">${settingsColorMarkup('custom-bg-color','Fundo personalizado',settings.customBackground)}${settingsColorMarkup('custom-text-color','Cor dos textos',settings.customText)}</div>
  </section>
  <section class="settings-panel glass-panel"><div class="settings-section-title"><span class="settings-section-icon">Aa</span><div><h3>Tipografia</h3><p>Visualize a família tipográfica antes de aplicar em toda a interface.</p></div></div><div class="form-field"><label>Fonte do aplicativo</label><select id="app-font-select">${FONT_OPTIONS.map(font=>`<option style="font-family:'${font}'" ${settings.font===font?'selected':''}>${font}</option>`).join('')}</select></div><div class="font-preview" id="font-preview" style="font-family:'${escapeHtml(settings.font)}',sans-serif"><strong>Aprender é construir conexões.</strong><span>Prévia real da fonte selecionada · 0123456789</span></div><div class="settings-row"><span>Efeitos sonoros</span><input class="switch" type="checkbox" id="sound-toggle" ${settings.sound?'checked':''}></div></section>
  <section class="settings-panel glass-panel"><div class="settings-section-title"><span class="settings-section-icon">↻</span><div><h3>Atualizações do Azul</h3><p>Confira novas versões e instale sem baixar um ZIP manualmente. Atualizações ficam disponíveis após a publicação de uma release no GitHub.</p></div></div><div class="settings-row"><div><strong>Versão instalada</strong><small id="installed-app-version">Consultando…</small></div><button class="soft-button" data-action="check-updates">Verificar atualizações</button></div><p class="updater-status" id="updater-status" role="status" aria-live="polite">O atualizador verificará novas versões automaticamente.</p><div class="updater-actions"><button class="primary-button" data-action="download-update" id="download-update-button" hidden>Baixar atualização</button><button class="primary-button" data-action="install-update" id="install-update-button" hidden>Reiniciar e instalar</button></div></section>
  <section class="settings-panel glass-panel"><div class="settings-section-title"><span class="settings-section-icon">◷</span><div><h3>Estudo e dados</h3><p>Seus conteúdos permanecem neste dispositivo. Exporte cópias periodicamente.</p></div></div><div class="settings-row"><div><strong>Tempo de estudo padrão</strong><small>Pomodoro</small></div><strong>${settings.study} min</strong></div><div class="settings-row"><div><strong>Tempo de pausa padrão</strong><small>Intervalo</small></div><strong>${settings.rest} min</strong></div><div class="settings-row"><span>Exportar seus dados</span><button class="soft-button" data-action="export-data">Baixar backup JSON</button></div><div class="settings-row"><span>Importar backup de uma versão anterior</span><button class="soft-button" data-action="import-data">Importar JSON</button></div><div class="settings-row"><span>Versão do formato de dados</span><strong>${Number(state.dataVersion || DATA_VERSION)} · migração segura</strong></div><div class="settings-row"><span>Apagar todos os dados deste dispositivo</span><button class="danger-button" data-action="reset-data">Redefinir aplicativo</button></div></section></div>`;
}
function render() {
  const page=$('#page-content');
  if(currentPage==='mindmap'){mapResizeObserver?.disconnect();mapResizeObserver=null;mapActiveEditor=null;}
  if (currentPage==='home') page.innerHTML=renderHome();
  else if (currentPage==='subjects') page.innerHTML=renderSubjectPage();
  else if (currentPage==='routine') page.innerHTML=renderRoutine();
  else if (currentPage==='focus') page.innerHTML=renderFocus();
  else if (currentPage==='work') page.innerHTML=renderWork();
  else if (currentPage==='mindmap') page.innerHTML=renderMindmap();
  else if (currentPage==='settings') page.innerHTML=renderSettings();
  else if (currentPage==='profile') page.innerHTML=renderProfile();
  applyAppearance();
  updateSidebar();
  if (currentPage==='mindmap') requestAnimationFrame(bindMapCanvas);
  if (currentPage==='work') requestAnimationFrame(() => loadWorkApps());
  if (currentPage==='settings') requestAnimationFrame(initUpdatePanel);
}

function bindLocalImagePicker(buttonId,inputName) {
  const button=$(`#${buttonId}`,$('#modal-root'));
  if(!button)return;
  button.addEventListener('click',async()=>{
    try {
      const result=await window.azul?.importMapImage?.();
      if(result?.ok){const input=$(`[name="${inputName}"]`,$('#modal-root'));if(input)input.value=result.src;toast('Imagem copiada para os dados locais do Azul Estudo.');}
      else if(!result?.cancelled)toast(result?.message||'Não foi possível importar a imagem.');
    } catch(error){toast(`Falha ao importar imagem: ${error.message}`);}
  });
}
function openModal(title, fields, onSave, saveLabel='Salvar') {
  const root=$('#modal-root');
  root.innerHTML=`<div class="modal-backdrop"><form class="modal"><h2>${title}</h2><div class="form-grid">${fields}</div><div class="form-actions"><button type="button" class="soft-button" data-modal-cancel>Cancelar</button><button class="primary-button" type="submit">${saveLabel}</button></div></form></div>`;
  const form=$('form',root);
  form.addEventListener('submit',e=>{e.preventDefault();const values={};$$('[name]',form).forEach(el=>values[el.name]=el.type==='checkbox'?el.checked:el.value);onSave(values);root.innerHTML='';});
  form.addEventListener('input',e=>{if(e.target.type==='color'||e.target.dataset.colorHexFor)syncColorPair(e.target,form);});
  form.addEventListener('change',e=>{if(e.target.type==='color'||e.target.dataset.colorHexFor)syncColorPair(e.target,form);});
  form.addEventListener('click',e=>{
    const choice=e.target.closest('[data-color-choice]');
    if(!choice)return;
    const name=choice.dataset.colorChoice,input=form.querySelector(`[name="${name}"]`);
    if(!input)return;
    input.value=choice.dataset.colorValue;
    syncColorPair(input,form);
    form.querySelectorAll(`[data-color-choice="${name}"]`).forEach(button=>button.classList.toggle('selected',button===choice));
    input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  $('[data-modal-cancel]',root).addEventListener('click',()=>root.innerHTML='');
  $('.modal-backdrop',root).addEventListener('click',e=>{if(e.target.classList.contains('modal-backdrop'))root.innerHTML='';});
  $('input,textarea,select',form)?.focus();
  return form;
}
function addSubject() {
  openModal('Criar matéria',`<div class="form-field"><label>Nome da matéria</label><input name="title" required maxlength="55" placeholder="Ex.: Biologia"></div><div class="form-field"><label>Descrição curta</label><input name="description" maxlength="100" placeholder="O que você quer aprender nela?"></div>${colorFieldMarkup('color','Cor do banner','#b8e1fa')}${colorFieldMarkup('titleColor','Cor do título','#325a76')}<div class="form-field"><label>Banner (URL ou imagem do computador)</label><input name="banner" placeholder="https://..."><button type="button" class="soft-button" id="choose-subject-banner">Escolher imagem do computador</button></div><div class="form-field"><label>Fonte</label><select name="font">${FONT_OPTIONS.map(font=>`<option style="font-family:'${font}'">${font}</option>`).join('')}</select><div class="font-preview-mini" id="subject-font-preview" style="font-family:'Inter',sans-serif">Amostra da fonte: Biologia e Fotossíntese</div></div>`,v=>{
    const s={id:uid(),title:v.title.trim(),description:v.description.trim(),color:v.color,titleColor:v.titleColor,banner:validImageSource(v.banner),font:v.font,topics:[]};state.subjects.push(s);activeSubjectId=s.id;activeTopicId=null;save();setPage('subjects');toast('Matéria criada!');
  });
  const fontSelect=$('[name="font"]',$('#modal-root'));fontSelect?.addEventListener('change',()=>{const preview=$('#subject-font-preview',$('#modal-root'));if(preview)preview.style.fontFamily=`'${fontSelect.value}',sans-serif`;});
  bindLocalImagePicker('choose-subject-banner','banner');
}
function editSubject() {
  const s=activeSubject(); if(!s)return;
  openModal('Personalizar matéria',`<div class="form-field"><label>Nome</label><input name="title" required value="${escapeHtml(s.title)}"></div><div class="form-field"><label>Descrição</label><input name="description" value="${escapeHtml(s.description||'')}"></div>${colorFieldMarkup('color','Cor do banner',s.color||'#b8e1fa')}${colorFieldMarkup('titleColor','Cor do título',s.titleColor||'#325a76')}<div class="form-field"><label>Banner (URL ou imagem do computador)</label><input name="banner" value="${escapeHtml(s.banner||'')}"><button type="button" class="soft-button" id="choose-subject-banner">Escolher imagem do computador</button></div><div class="form-field"><label>Fonte</label><select name="font">${FONT_OPTIONS.map(f=>`<option style="font-family:'${f}'" ${s.font===f?'selected':''}>${f}</option>`).join('')}</select><div class="font-preview-mini" id="subject-font-preview" style="font-family:'${escapeHtml(s.font||'Inter')}',sans-serif">Amostra da fonte: Biologia e Fotossíntese</div></div>`,v=>{Object.assign(s,{title:v.title.trim(),description:v.description,color:v.color,titleColor:v.titleColor,banner:validImageSource(v.banner),font:v.font});save();render();});
  const fontSelect=$('[name="font"]',$('#modal-root'));fontSelect?.addEventListener('change',()=>{const preview=$('#subject-font-preview',$('#modal-root'));if(preview)preview.style.fontFamily=`'${fontSelect.value}',sans-serif`;});
  bindLocalImagePicker('choose-subject-banner','banner');
}
function addTopic() {
  const s=activeSubject();if(!s)return;
  openModal('Novo assunto',`<div class="form-field"><label>Nome do assunto</label><input name="title" required maxlength="70" placeholder="Ex.: Fotossíntese"></div><div class="form-field"><label>O que você sabe sobre ele?</label><textarea name="notes" placeholder="Anotações, dúvidas ou resumo inicial..."></textarea></div><div class="form-field"><label>Importância para seus estudos</label><select name="important"><option value="yes">Relevante</option><option value="no">Ainda vou avaliar</option></select></div><div class="form-field"><label>Quanto você domina?</label><select name="known"><option>Ainda não estudei</option><option>Estou aprendendo</option><option>Preciso revisar</option><option>Já domino</option></select></div>`,v=>{const t={id:uid(),title:v.title.trim(),notes:v.notes,important:v.important==='yes',known:v.known,map:[],mapVersion:2,camera:{cx:0,cy:0,zoom:1},showGrid:true};s.topics.push(t);activeTopicId=t.id;save();render();toast('Assunto adicionado!');});
}
function editTopic() {
  const t=activeTopic();if(!t)return;
  openModal('Editar assunto',`<div class="form-field"><label>Nome</label><input name="title" required value="${escapeHtml(t.title)}"></div><div class="form-field"><label>Anotações</label><textarea name="notes">${escapeHtml(t.notes||'')}</textarea></div><div class="form-field"><label>Importância</label><select name="important"><option value="yes" ${t.important?'selected':''}>Relevante</option><option value="no" ${!t.important?'selected':''}>Ainda vou avaliar</option></select></div><div class="form-field"><label>Domínio do assunto</label><select name="known">${['Ainda não estudei','Estou aprendendo','Preciso revisar','Já domino'].map(x=>`<option ${t.known===x?'selected':''}>${x}</option>`).join('')}</select></div>`,v=>{Object.assign(t,{title:v.title.trim(),notes:v.notes,important:v.important==='yes',known:v.known});save();render();});
}
function addTask() {
  openModal('Nova tarefa',`<div class="form-field"><label>O que você precisa fazer?</label><input name="title" required maxlength="90" placeholder="Ex.: Resolver 5 exercícios"></div><div class="form-field"><label>Categoria</label><select name="tag"><option>Estudo</option><option>Revisão</option><option>Organização</option><option>Projeto</option><option>Outro</option></select></div>`,v=>{state.tasks.unshift({id:uid(),title:v.title.trim(),tag:v.tag,done:false,date:todayKey()});save();render();toast('Tarefa adicionada.');});
}
function addHabit() {
  openModal('Novo hábito diário',`<div class="form-field"><label>Nome do hábito</label><input name="title" required maxlength="70" placeholder="Ex.: Ler por 20 minutos"></div><div class="form-field"><label>Pequena descrição</label><input name="detail" maxlength="90" placeholder="Quando ou como fazer?"></div><div class="form-field"><label>Sticker</label><select name="icon"><option>✦</option><option>📚</option><option>🧠</option><option>✏️</option><option>🌱</option><option>🎯</option><option>☁️</option></select></div>`,v=>{state.habits.push({id:uid(),title:v.title.trim(),detail:v.detail,icon:v.icon,done:{}});save();render();});
}
function resetMapHistory() { mapHistory = { topicId: activeTopicId, undo: [], redo: [] }; }
function mapSnapshot() {
  const topic = activeTopic();
  if (!topic) return null;
  return JSON.stringify({ map: topic.map || [], camera: topic.camera || { cx:0,cy:0,zoom:1 }, showGrid: topic.showGrid !== false, edgeStyle: topic.edgeStyle || null });
}
function pushMapHistory() {
  const topic = activeTopic();
  if (!topic) return;
  if (mapHistory.topicId !== topic.id) resetMapHistory();
  const snapshot = mapSnapshot();
  if (!snapshot) return;
  mapHistory.undo.push(snapshot);
  if (mapHistory.undo.length > 80) mapHistory.undo.shift();
  mapHistory.redo = [];
  updateMapToolbarState();
}
function applyMapHistory(direction) {
  const topic = activeTopic();
  if (!topic) return;
  if (mapHistory.topicId !== topic.id) resetMapHistory();
  const source = direction === 'undo' ? mapHistory.undo : mapHistory.redo;
  const target = direction === 'undo' ? mapHistory.redo : mapHistory.undo;
  if (!source.length) return;
  const current = mapSnapshot();
  target.push(current);
  const snapshot = JSON.parse(source.pop());
  topic.map = snapshot.map || [];
  topic.camera = snapshot.camera || { cx:0,cy:0,zoom:1 };
  topic.showGrid = snapshot.showGrid !== false;
  topic.edgeStyle = snapshot.edgeStyle || null;
  selectedMapNodes.clear();
  save(); render();
}
function openMap() { resetMapHistory(); setPage('mindmap'); }
function addMapNode(type) {
  const topic=activeTopic(); if(!topic)return;
  const isImage=type==='image', isSticker=type==='sticker';
  const fields=isImage?`<div class="form-field"><label>Imagem (URL HTTPS ou arquivo)</label><input name="image" required placeholder="https://..."><button type="button" class="soft-button" id="choose-map-image">Escolher imagem do computador</button></div><div class="form-field"><label>Legenda (opcional)</label><input name="text" maxlength="120" placeholder="Deixe vazio para inserir só a imagem."></div>`:isSticker?`<div class="form-field"><label>Texto do Post-it</label><textarea name="text" required placeholder="Escreva um lembrete importante..."></textarea></div>${colorFieldMarkup('postitColor','Cor do Post-it','#fff0a8')}<div class="form-field"><label>Ícone</label><select name="sticker"><option>📌</option><option>💡</option><option>⭐</option><option>❗</option><option>🧠</option><option>✦</option></select></div>`:`<div class="form-field"><label>Texto do bloco</label><textarea name="text" required placeholder="Escreva uma ideia ou conceito..."></textarea></div><div class="form-field"><label>Sticker (opcional)</label><select name="sticker"><option>✦</option><option>💡</option><option>📌</option><option>🧠</option><option>⭐</option><option>🔍</option></select></div>`;
  openModal(isImage?'Adicionar imagem':isSticker?'Adicionar sticker':'Novo bloco de texto',fields,v=>{
    pushMapHistory();
    const board=$('#map-board'),camera=mapCameraFor(topic),rect=board?.getBoundingClientRect();
    const point=rect?mapScreenToWorld(rect.width/2,rect.height/2,camera,rect.width,rect.height):{x:camera.cx,y:camera.cy};
    const nodeWidth=isImage?320:isSticker?210:230,nodeHeight=isImage?260:isSticker?160:130;
    const node={id:uid(),text:String(v.text||'').trim(),sticker:v.sticker||'▤',image:validImageSource(v.image),x:Math.round(point.x-nodeWidth/2),y:Math.round(point.y-nodeHeight/2),width:nodeWidth,height:nodeHeight,links:[],type:isImage?'image':isSticker?'sticker':'text',background:isSticker?(v.postitColor||'#fff0a8'):'#ffffff',textColor:isSticker?'#4e4937':'#36566d',rotation:isSticker?Number((Math.random()*4-2).toFixed(1)):0,shape:isSticker?'square':'rounded',fontSize:12,fontFamily:'Inter',fitText:false};
    const basePreset=getDefaultMapPreset(isImage?'image':isSticker?'sticker':'text');
    if(basePreset)Object.assign(node,mapPresetStyle(basePreset));
    topic.map ||= []; topic.map.push(node); selectedMapNodes=new Set([node.id]); save(); render();
  });
  if(isImage)bindLocalImagePicker('choose-map-image','image');
}
function addMapHeading(type) {
  const topic=activeTopic();if(!topic)return;
  pushMapHistory();
  const board=$('#map-board'),camera=mapCameraFor(topic),rect=board?.getBoundingClientRect();
  const point=rect?mapScreenToWorld(rect.width/2,rect.height/2,camera,rect.width,rect.height):{x:camera.cx,y:camera.cy};
  const node={id:uid(),text:type==='title'?'Novo título':'Novo subtítulo',sticker:type==='title'?'✦':'',x:Math.round(point.x-135),y:Math.round(point.y-45),width:type==='title'?300:260,height:100,links:[],type,background:type==='title'?'#eaf6ff':'#f7fbff',textColor:'#315f7e',fontFamily:'Inter',fontSize:type==='title'?22:16,fitText:false};
  const basePreset=getDefaultMapPreset('text');if(basePreset)Object.assign(node,mapPresetStyle(basePreset));
  topic.map ||= [];topic.map.push(node);selectedMapNodes=new Set([node.id]);save();render();
}
const MAP_PRESET_STYLE_KEYS = ['background','textColor','borderColor','borderWidth','borderStyle','shape','shadow','fontFamily','fontSize','width','height','rotation'];
function mapPresetStyle(source) {
  const style={};
  MAP_PRESET_STYLE_KEYS.forEach(key=>{if(source && source[key]!==undefined)style[key]=source[key];});
  return style;
}
function builtinMapPresets() {
  return [
    {id:'builtin-glass-note',name:'Vidro azul',type:'text',description:'Bloco leve para ideias e conceitos.',background:'#eaf6ff',textColor:'#315f7e',borderColor:'#b8daf0',borderWidth:1,borderStyle:'solid',shape:'rounded',shadow:'soft',fontFamily:'Inter',fontSize:14,width:260,height:150},
    {id:'builtin-clean-paper',name:'Papel claro',type:'text',description:'Visual limpo para anotações longas.',background:'#fffefa',textColor:'#414b55',borderColor:'#e5e1d8',borderWidth:1,borderStyle:'solid',shape:'square',shadow:'soft',fontFamily:'Georgia',fontSize:15,width:290,height:180},
    {id:'builtin-title',name:'Título editorial',type:'text',description:'Destaque para um tema principal.',background:'#dcefff',textColor:'#234d6d',borderColor:'#9ec8e6',borderWidth:2,borderStyle:'solid',shape:'rounded',shadow:'soft',fontFamily:'Trebuchet MS',fontSize:22,width:320,height:120},
    {id:'builtin-postit',name:'Post-it clássico',type:'sticker',description:'Lembretes rápidos com cara de papel.',background:'#fff0a8',textColor:'#51472e',borderColor:'#eadb8d',borderWidth:1,borderStyle:'solid',shape:'square',shadow:'soft',fontFamily:'Trebuchet MS',fontSize:15,width:230,height:180,rotation:-1.5},
    {id:'builtin-postit-rose',name:'Post-it rosa',type:'sticker',description:'Lembretes e observações importantes.',background:'#ffd9e4',textColor:'#653f4d',borderColor:'#edb6c8',borderWidth:1,borderStyle:'solid',shape:'square',shadow:'soft',fontFamily:'Inter',fontSize:14,width:230,height:180,rotation:1.2},
    {id:'builtin-image',name:'Imagem em destaque',type:'image',description:'Moldura com espaço para imagem.',background:'#f4f9fd',textColor:'#34566e',borderColor:'#bdd5e7',borderWidth:2,borderStyle:'solid',shape:'rounded',shadow:'strong',fontFamily:'Inter',fontSize:12,width:320,height:260}
  ];
}
function allMapPresets() { return [...builtinMapPresets(), ...(state.mapPresets?.items || [])]; }
function getDefaultMapPreset(type) {
  const id=state.mapPresets?.defaults?.[type];
  return allMapPresets().find(p=>p.id===id && p.type===type) || builtinMapPresets().find(p=>p.type===type) || null;
}
function openMapPresets() {
  const topic=activeTopic();if(!topic)return;
  const selected=topic.map.find(node=>selectedMapNodes.has(node.id));
  const presets=allMapPresets();
  const cards=presets.map(p=>{
    const typeName=p.type==='sticker'?'Post-it':p.type==='image'?'Imagem':'Texto';
    const isDefault=state.mapPresets?.defaults?.[p.type]===p.id;
    const previewFont=FONT_OPTIONS.includes(p.fontFamily)?p.fontFamily:'Inter';
    return `<article class="preset-card"><div class="preset-swatch" style="background:${escapeHtml(p.background||'#fff')};color:${escapeHtml(p.textColor||'#34566d')};border-color:${escapeHtml(p.borderColor||'#d7eaf7')};font-family:'${escapeHtml(previewFont)}'">Aa</div><div class="preset-card-copy"><div class="preset-title-row"><strong>${escapeHtml(p.name)}</strong><span>${typeName}</span></div><small>${escapeHtml(p.description||'Estilo personalizado')}</small><div class="preset-actions"><button type="button" class="soft-button" data-preset-apply="${escapeHtml(p.id)}" ${selected?'':'disabled'}>Aplicar</button><button type="button" class="soft-button ${isDefault?'active-tool':''}" data-preset-default="${escapeHtml(p.id)}" data-preset-type="${escapeHtml(p.type)}">${isDefault?'Padrão ativo':'Usar ao criar'}</button>${p.id.startsWith('custom-')?`<button type="button" class="preset-delete" data-preset-delete="${escapeHtml(p.id)}" title="Excluir preset">×</button>`:''}</div></div></article>`;
  }).join('');
  const form=openModal('Biblioteca de presets',`<div class="preset-intro">Escolha uma base pronta, aplique ao bloco selecionado ou defina o estilo que será usado nas próximas criações.</div><div class="preset-grid">${cards}</div><div class="preset-footer"><button type="button" class="soft-button" id="save-map-preset" ${selected?'':'disabled'}>＋ Salvar aparência selecionada como preset</button><button type="button" class="soft-button" id="clear-map-presets-defaults">Restaurar padrões por tipo</button></div>`,()=>{},'Fechar');
  if(!form)return;
  form.querySelectorAll('[data-preset-apply]').forEach(button=>button.addEventListener('click',()=>{
    const preset=allMapPresets().find(p=>p.id===button.dataset.presetApply),node=topic.map.find(n=>selectedMapNodes.has(n.id));
    if(!preset||!node)return;
    pushMapHistory();Object.assign(node,mapPresetStyle(preset));save();$('#modal-root').innerHTML='';render();toast(`Preset “${preset.name}” aplicado.`);
  }));
  form.querySelectorAll('[data-preset-default]').forEach(button=>button.addEventListener('click',()=>{
    const type=button.dataset.presetType,id=button.dataset.presetDefault;
    state.mapPresets.defaults[type]=id;save();
    form.querySelectorAll('[data-preset-default]').forEach(el=>{const active=el.dataset.presetType===type&&el.dataset.presetDefault===id;el.textContent=active?'Padrão ativo':'Usar ao criar';el.classList.toggle('active-tool',active);});
    toast(`“${button.closest('.preset-card')?.querySelector('.preset-title-row strong')?.textContent||'Preset'}” será usado em novas criações de ${type==='sticker'?'Post-its':type==='image'?'imagens':'textos'}.`);
  }));
  form.querySelectorAll('[data-preset-delete]').forEach(button=>button.addEventListener('click',()=>{
    const id=button.dataset.presetDelete;
    state.mapPresets.items=state.mapPresets.items.filter(p=>p.id!==id);
    Object.keys(state.mapPresets.defaults).forEach(type=>{if(state.mapPresets.defaults[type]===id)state.mapPresets.defaults[type]=builtinMapPresets().find(p=>p.type===type)?.id||'';});
    save();$('#modal-root').innerHTML='';openMapPresets();toast('Preset removido.');
  }));
  $('#save-map-preset',form)?.addEventListener('click',()=>{
    const node=topic.map.find(n=>selectedMapNodes.has(n.id));if(!node)return;
    $('#modal-root').innerHTML='';
    openModal('Salvar novo preset',`<div class="form-field"><label>Nome do preset</label><input name="name" maxlength="32" required placeholder="Ex.: Meu bloco de resumo"></div><div class="preset-save-preview"><span style="background:${escapeHtml(node.background||'#fff')};color:${escapeHtml(node.textColor||'#34566d')}">Aa</span><small>O preset salvará cores, fonte, bordas, tamanho e formato deste bloco.</small></div>`,values=>{
      const preset={id:`custom-${uid()}`,name:values.name.trim(),description:'Preset criado por você.',type:node.type==='sticker'?'sticker':(node.type==='image'||node.image)?'image':'text',...mapPresetStyle(node)};
      state.mapPresets.items.push(preset);save();toast('Seu preset foi salvo. Reabra Presets para aplicá-lo ou defini-lo como padrão.');
    });
  });
  $('#clear-map-presets-defaults',form)?.addEventListener('click',()=>{
    state.mapPresets.defaults={text:'builtin-glass-note',sticker:'builtin-postit',image:'builtin-image'};save();$('#modal-root').innerHTML='';openMapPresets();toast('Estilos padrão restaurados.');
  });
}
function applyQuickMapFontSize(value,options={}) {
  const topic=activeTopic();if(!topic)return;
  const node=topic.map.find(n=>selectedMapNodes.has(n.id)) || (mapActiveEditor?mapNodeById(topic,mapActiveEditor.dataset.nodeContent):null);
  if(!node)return toast('Selecione um bloco para alterar o tamanho do texto.');
  const size=Math.max(9,Math.min(144,Math.round(Number(value)||12)));
  if(size===Number(node.fontSize||12))return;
  if(options.recordHistory!==false)pushMapHistory();
  node.fontSize=size;
  if(options.persist!==false)save();
  const el=$(`[data-map-node="${CSS.escape(node.id)}"]`);if(el){el.style.fontSize=`${size}px`;const rich=$('[data-node-content]',el);if(rich)rich.style.fontSize=`${size}px`;fitMapNodeText(el,node);}
  const input=$('#map-font-size-control'),slider=$('#map-font-size-slider'),output=$('#map-font-size-value');
  if(input)input.value=String(size);if(slider)slider.value=String(size);if(output)output.textContent=`${size}px`;
}
function handleNodeClick(id) {
  const topic=activeTopic();if(!topic)return;
  if (connectFrom === 'select-first') { connectFrom=id; toast('Agora clique no bloco de destino.'); render(); return; }
  if (connectFrom) {
    if (connectFrom!==id) {
      const a=topic.map.find(n=>n.id===connectFrom),b=topic.map.find(n=>n.id===id);
      if(a&&b){pushMapHistory();a.links||=[];b.links||=[];if(!a.links.includes(b.id))a.links.push(b.id);if(!b.links.includes(a.id))b.links.push(a.id);}
      connectFrom=null;save();render();toast('Conexão criada. Ela acompanha os dois blocos.'); return;
    }
    connectFrom=null;render();return;
  }
  selectedMapNodes = new Set([id]);
  $$('.map-node').forEach(node=>node.classList.toggle('selected',selectedMapNodes.has(node.dataset.mapNode)));
}
function mapScreenToWorld(screenX,screenY,camera,width,height) {
  return { x: camera.cx + (screenX-width/2)/camera.zoom, y: camera.cy + (screenY-height/2)/camera.zoom };
}
function getMapCameraTransform(board,camera) {
  const width=board.clientWidth,height=board.clientHeight,zoom=camera.zoom;
  return {tx:width/2-camera.cx*zoom,ty:height/2-camera.cy*zoom,width,height,zoom};
}
function updateMapToolbarState() {
  const topic=activeTopic();if(!topic)return;
  const appearance=$('[data-action="style-selected"]'),remove=$('[data-action="delete-selected"]');
  const undo=$('[data-action="map-undo"]'),redo=$('[data-action="map-redo"]');
  const fontInput=$('#map-font-size-control'),fontSlider=$('#map-font-size-slider'),fontOutput=$('#map-font-size-value'),fontButtons=$$('[data-map-font-step]');
  const selectedNode=(topic.map||[]).find(n=>selectedMapNodes.has(n.id));
  if(appearance)appearance.disabled=selectedMapNodes.size===0;
  if(remove)remove.disabled=selectedMapNodes.size===0;
  const fontSize=Math.round(Number(selectedNode?.fontSize)||12);
  if(fontInput){fontInput.disabled=!selectedNode;fontInput.value=String(fontSize);}
  if(fontSlider){fontSlider.disabled=!selectedNode;fontSlider.value=String(fontSize);}
  if(fontOutput)fontOutput.textContent=`${fontSize}px`;
  fontButtons.forEach(button=>button.disabled=!selectedNode);
  if(undo)undo.disabled=mapHistory.undo.length===0;
  if(redo)redo.disabled=mapHistory.redo.length===0;
  const meta=$('#map-meta');if(meta)meta.textContent=`${topic.map?.length||0} blocos · ${countMapConnections(topic.map||[])} conexões · ${selectedMapNodes.size} selecionados`;
}
function applyMapCamera(board,camera) {
  const world=$('#map-world',board),svg=$('#map-svg',board),zoomLabel=$('#map-zoom-label');
  if(!world||!svg)return;
  const t=getMapCameraTransform(board,camera);
  world.style.transform=`translate3d(${t.tx}px,${t.ty}px,0) scale(${t.zoom})`;
  svg.setAttribute('viewBox',`${camera.cx-t.width/(2*t.zoom)} ${camera.cy-t.height/(2*t.zoom)} ${t.width/t.zoom} ${t.height/t.zoom}`);
  board.style.backgroundSize=`${22*t.zoom}px ${22*t.zoom}px`;
  board.style.backgroundPosition=`${t.tx}px ${t.ty}px`;
  if(zoomLabel)zoomLabel.textContent=`${Math.round(t.zoom*100)}%`;
  updateMapToolbarState();
}
function mapNodeById(topic,id) { return topic?.map?.find(n=>n.id===id); }
function updateMapConnections(board) {
  const topic=activeTopic(),group=$('#map-edges',board);if(!topic||!group)return;
  const nodeElements=new Map($$('.map-node',board).map(el=>[el.dataset.mapNode,el]));
  const paths=[];
  const edgeStyle=topic.edgeStyle||{};
  const edgeColor=/^#[0-9a-f]{6}$/i.test(edgeStyle.color||'')?edgeStyle.color:'#78acd0';
  const edgeWidth=Math.max(1,Math.min(8,Number(edgeStyle.width)||2));
  const dash=edgeStyle.dash==='dashed'?'8 6':edgeStyle.dash==='dotted'?'2 6':'';
  const curve=edgeStyle.curve||'soft';
  const markerPath=$('#map-arrow path',board); if(markerPath)markerPath.setAttribute('fill',edgeColor);
  const seen=new Set();
  (topic.map||[]).forEach(a=>{
    (a.links||[]).forEach(id=>{
      const b=mapNodeById(topic,id);if(!b)return;
      const key=[a.id,b.id].sort().join('::');if(seen.has(key))return;seen.add(key);
      const aEl=nodeElements.get(a.id),bEl=nodeElements.get(b.id);if(!aEl||!bEl)return;
      const ax=Number(a.x)||0,ay=Number(a.y)||0,bx=Number(b.x)||0,by=Number(b.y)||0;
      const aw=aEl.offsetWidth||Number(a.width)||230,ah=aEl.offsetHeight||Number(a.height)||130;
      const bw=bEl.offsetWidth||Number(b.width)||230,bh=bEl.offsetHeight||Number(b.height)||130;
      const acx=ax+aw/2,acy=ay+ah/2,bcx=bx+bw/2,bcy=by+bh/2;
      const dx=bcx-acx,dy=bcy-acy;
      let sx,sy,ex,ey,d;
      if(Math.abs(dx)>=Math.abs(dy)*.85){
        const direction=dx>=0?1:-1;
        sx=acx+direction*aw/2;sy=acy;ex=bcx-direction*bw/2;ey=bcy;
        const bend=Math.max(curve==='straight'?8:curve==='wide'?90:42,Math.abs(ex-sx)*(curve==='straight'?.12:curve==='wide'?.62:.42));
        d=`M ${sx} ${sy} C ${sx+bend*direction} ${sy}, ${ex-bend*direction} ${ey}, ${ex} ${ey}`;
      }else{
        const direction=dy>=0?1:-1;
        sx=acx;sy=acy+direction*ah/2;ex=bcx;ey=bcy-direction*bh/2;
        const bend=Math.max(curve==='straight'?8:curve==='wide'?90:42,Math.abs(ey-sy)*(curve==='straight'?.12:curve==='wide'?.62:.42));
        d=`M ${sx} ${sy} C ${sx} ${sy+bend*direction}, ${ex} ${ey-bend*direction}, ${ex} ${ey}`;
      }
      paths.push(`<path class="map-edge" d="${d}" style="stroke:${edgeColor};stroke-width:${edgeWidth}px;${dash?`stroke-dasharray:${dash};`:``}" marker-end="url(#map-arrow)" data-edge="${escapeHtml(key)}"></path>`);
    });
  });
  group.innerHTML=paths.join('');
}
function scheduleMapSave() {
  clearTimeout(mapSaveTimer);
  mapSaveTimer=setTimeout(()=>{const topic=activeTopic();if(topic)save();},450);
}
function setMapZoom(board,nextZoom,anchorX=board.clientWidth/2,anchorY=board.clientHeight/2) {
  const topic=activeTopic();if(!topic)return;
  const camera=mapCameraFor(topic),oldZoom=camera.zoom,newZoom=Math.max(.1,Math.min(4,nextZoom));
  if(Math.abs(oldZoom-newZoom)<.0001)return;
  const worldPoint=mapScreenToWorld(anchorX,anchorY,camera,board.clientWidth,board.clientHeight);
  pushMapHistory();
  camera.zoom=newZoom;
  camera.cx=worldPoint.x-(anchorX-board.clientWidth/2)/newZoom;
  camera.cy=worldPoint.y-(anchorY-board.clientHeight/2)/newZoom;
  applyMapCamera(board,camera);scheduleMapSave();
}
function fitMapContent(board) {
  const topic=activeTopic();if(!topic)return;
  const nodes=topic.map||[];
  if(!nodes.length){pushMapHistory();topic.camera={cx:0,cy:0,zoom:1};applyMapCamera(board,topic.camera);scheduleMapSave();return;}
  const elements=new Map($$('.map-node',board).map(el=>[el.dataset.mapNode,el]));
  const bounds=nodes.map(node=>{const el=elements.get(node.id);return {x:Number(node.x)||0,y:Number(node.y)||0,w:el?.offsetWidth||Number(node.width)||230,h:el?.offsetHeight||Number(node.height)||130};});
  const minX=Math.min(...bounds.map(b=>b.x)),minY=Math.min(...bounds.map(b=>b.y));
  const maxX=Math.max(...bounds.map(b=>b.x+b.w)),maxY=Math.max(...bounds.map(b=>b.y+b.h));
  const spanX=Math.max(1,maxX-minX),spanY=Math.max(1,maxY-minY);
  const zoom=Math.max(.1,Math.min(2.5,(board.clientWidth-120)/spanX,(board.clientHeight-120)/spanY));
  pushMapHistory();topic.camera={cx:(minX+maxX)/2,cy:(minY+maxY)/2,zoom};
  applyMapCamera(board,topic.camera);scheduleMapSave();
}
function formatActiveMapText(command, highlightColor) {
  const selection=window.getSelection();
  const anchorElement=selection?.anchorNode?.nodeType===1?selection.anchorNode:selection?.anchorNode?.parentElement;
  let editor=anchorElement?.closest('[data-node-content]') || mapActiveEditor;
  if(!editor)return toast('Clique em um bloco e selecione um trecho de texto primeiro.');
  const nodeId=editor.dataset.nodeContent,node=mapNodeById(activeTopic(),nodeId);if(!node)return;
  if(selection && selection.rangeCount && !selection.isCollapsed && editor.contains(selection.anchorNode)) pushMapHistory();
  editor.focus();
  document.execCommand(command,false,command==='hiliteColor'?(highlightColor||'#fff0a8'):null);
  node.html=safeMapHtml(editor.innerHTML,node.text);
  node.text=editor.innerText.trim();
  save();
}
function editSelectedNodeStyle(id) {
  const topic=activeTopic();if(!topic)return;
  const node=mapNodeById(topic,id || [...selectedMapNodes][0]);if(!node)return;
  const fonts=FONT_OPTIONS.map(font=>`<option style="font-family:'${font}'" ${node.fontFamily===font?'selected':''}>${font}</option>`).join('');
  const preview=`<div class="appearance-live-preview"><span>PRÉVIA DO BLOCO</span><div class="appearance-preview-node" id="appearance-preview-node" style="background:${escapeHtml(node.background||'#fff')};color:${escapeHtml(node.textColor||'#36566d')};border: ${Math.max(1,Math.min(6,Number(node.borderWidth)||1))}px ${escapeHtml(node.borderStyle||'solid')} ${escapeHtml(node.borderColor||'#d7eaf7')};border-radius:${node.shape==='square'?'5px':node.shape==='pill'?'24px':'13px'};font-family:'${escapeHtml(node.fontFamily||'Inter')}',sans-serif;font-size:${Math.max(9,Math.min(144,Number(node.fontSize)||12))}px">${escapeHtml((node.text||'Seu texto de exemplo').slice(0,70))}</div><small>As mudanças serão aplicadas ao bloco escolhido.</small></div>`;
  const content=`<div class="appearance-workspace">${preview}<div class="appearance-sections">
    <section class="appearance-group"><div class="appearance-group-heading"><span>◈</span><div><strong>Cores e superfície</strong><small>Defina o fundo e a leitura do bloco.</small></div></div><div class="appearance-fields three">${colorFieldMarkup('background','Fundo',node.background||'#ffffff')}${colorFieldMarkup('textColor','Texto',node.textColor||'#36566d')}${colorFieldMarkup('borderColor','Borda',node.borderColor||'#d7eaf7')}</div></section>
    <section class="appearance-group"><div class="appearance-group-heading"><span>▱</span><div><strong>Borda e formato</strong><small>Personalize a moldura e profundidade.</small></div></div><div class="appearance-fields"><label>Formato<select name="shape"><option value="rounded" ${(!node.shape||node.shape==='rounded')?'selected':''}>Arredondado</option><option value="square" ${node.shape==='square'?'selected':''}>Quadrado</option><option value="pill" ${node.shape==='pill'?'selected':''}>Pílula</option></select></label><label>Estilo<select name="borderStyle"><option value="solid" ${node.borderStyle==='solid'?'selected':''}>Contínua</option><option value="dashed" ${node.borderStyle==='dashed'?'selected':''}>Tracejada</option><option value="dotted" ${node.borderStyle==='dotted'?'selected':''}>Pontilhada</option></select></label><label>Espessura<input name="borderWidth" type="range" min="1" max="6" value="${Math.max(1,Math.min(6,Number(node.borderWidth)||1))}"><output data-range-value="borderWidth">${Math.max(1,Math.min(6,Number(node.borderWidth)||1))} px</output></label><label>Sombra<select name="shadow"><option value="soft" ${(!node.shadow||node.shadow==='soft')?'selected':''}>Suave</option><option value="strong" ${node.shadow==='strong'?'selected':''}>Profunda</option><option value="none" ${node.shadow==='none'?'selected':''}>Sem sombra</option></select></label></div></section>
    <section class="appearance-group"><div class="appearance-group-heading"><span>Aa</span><div><strong>Tipografia</strong><small>Fonte e tamanho do texto.</small></div></div><div class="appearance-fields"><label>Fonte<select name="fontFamily">${fonts}</select></label><div class="font-size-editor appearance-full"><div class="font-size-editor-heading"><label for="appearance-font-size">Tamanho do texto</label><output data-range-value="fontSize">${Math.max(9,Math.min(144,Number(node.fontSize)||12))} px</output></div><div class="font-size-editor-controls"><button type="button" class="font-size-step" data-appearance-font-step="-2" aria-label="Diminuir fonte">−</button><input id="appearance-font-size" name="fontSize" type="range" min="9" max="144" value="${Math.max(9,Math.min(144,Number(node.fontSize)||12))}"><button type="button" class="font-size-step" data-appearance-font-step="2" aria-label="Aumentar fonte">＋</button><input name="fontSizeExact" type="number" min="9" max="144" value="${Math.max(9,Math.min(144,Number(node.fontSize)||12))}" aria-label="Tamanho exato em pixels"></div><small>Use a barra para ajustar visualmente ou digite o valor exato.</small></div><label class="appearance-full">Ícone / sticker<input name="sticker" maxlength="8" value="${escapeHtml(node.sticker||'✦')}"></label><label class="appearance-full auto-fit-toggle"><input name="fitText" type="checkbox" ${node.fitText===true?'checked':''}><span><strong>Ajustar texto automaticamente</strong><small>Reduz a fonte apenas quando o conteúdo ultrapassar a área interna do bloco. O tamanho escolhido continua salvo.</small></span></label></div></section>
    <section class="appearance-group"><div class="appearance-group-heading"><span>↗</span><div><strong>Dimensões</strong><small>Arraste as bordas no canvas ou ajuste com precisão aqui.</small></div></div><div class="appearance-fields two"><label>Largura<input name="width" type="number" min="120" max="1200" value="${Math.max(120,Math.min(1200,Number(node.width)||230))}"></label><label>Altura<input name="height" type="number" min="75" max="1200" value="${Math.max(75,Math.min(1200,Number(node.height)||130))}"></label></div></section>
  </div></div>`;
  const form=openModal('Estilo do bloco',content,values=>{
    pushMapHistory();
    Object.assign(node,{background:values.background,textColor:values.textColor,borderColor:values.borderColor,borderWidth:Math.max(1,Math.min(6,Number(values.borderWidth)||1)),borderStyle:values.borderStyle,shape:values.shape,shadow:values.shadow,fontFamily:FONT_OPTIONS.includes(values.fontFamily)?values.fontFamily:'Inter',fontSize:Math.max(9,Math.min(144,Number(values.fontSizeExact||values.fontSize)||12)),fitText:values.fitText===true,width:Math.max(120,Math.min(1200,Number(values.width)||230)),height:Math.max(75,Math.min(1200,Number(values.height)||130)),sticker:values.sticker||''});
    save();render();
  });
  const previewNode=$('#appearance-preview-node',form);
  const syncPreview=()=>{
    if(!previewNode)return;
    const val=name=>form.querySelector(`[name="${name}"]`)?.value;
    const bg=val('background'),fg=val('textColor'),border=val('borderColor'),shape=val('shape'),font=val('fontFamily'),size=val('fontSize'),borderWidth=val('borderWidth'),borderStyle=val('borderStyle');
    if(bg)previewNode.style.background=bg;if(fg)previewNode.style.color=fg;if(border)previewNode.style.borderColor=border;
    if(shape)previewNode.style.borderRadius=shape==='square'?'5px':shape==='pill'?'24px':'13px';
    if(font)previewNode.style.fontFamily=`'${font}',sans-serif`;if(size)previewNode.style.fontSize=`${size}px`;
    if(borderWidth&&borderStyle&&border)previewNode.style.border=`${borderWidth}px ${borderStyle} ${border}`;
  };
  form.querySelectorAll('input,select').forEach(input=>input.addEventListener('input',()=>{
    const output=form.querySelector(`[data-range-value="${input.name}"]`);if(output)output.textContent=`${input.value} px`;
    if(input.name==='fontSize'||input.name==='fontSizeExact'){
      const range=form.querySelector('[name="fontSize"]'),exact=form.querySelector('[name="fontSizeExact"]');
      const size=Math.max(9,Math.min(144,Math.round(Number(input.value)||12)));
      if(range&&input!==range)range.value=String(size);
      if(exact&&input!==exact)exact.value=String(size);
      if(output)output.textContent=`${size} px`;
    }
    const colorPreview=form.querySelector(`[data-color-readout="${input.name}"]`);
    if(colorPreview){colorPreview.textContent=input.value.toUpperCase();const sample=form.querySelector(`[data-color-swatch="${input.name}"]`);if(sample)sample.style.background=input.value;}
    syncPreview();
  }));
  form.addEventListener('click',e=>{
    const step=e.target.closest('[data-appearance-font-step]');
    if(!step)return;
    const range=form.querySelector('[name="fontSize"]');if(!range)return;
    range.value=String(Math.max(9,Math.min(144,Number(range.value||12)+Number(step.dataset.appearanceFontStep))));
    range.dispatchEvent(new Event('input',{bubbles:true}));
  });
  form.querySelector('[name="fontFamily"]')?.addEventListener('change',syncPreview);
}
function deleteSelectedMapNodes() {
  const topic=activeTopic();if(!topic||!selectedMapNodes.size)return;
  pushMapHistory();const ids=new Set(selectedMapNodes);
  topic.map=topic.map.filter(node=>!ids.has(node.id));
  topic.map.forEach(node=>node.links=(node.links||[]).filter(id=>!ids.has(id)));
  selectedMapNodes.clear();save();render();
}
function getNodeResizeDirection(nodeEl,clientX,clientY) {
  if(!nodeEl)return '';
  const rect=nodeEl.getBoundingClientRect(),threshold=Math.min(12,Math.max(4,Math.min(rect.width,rect.height)*.12));
  const x=clientX-rect.left,y=clientY-rect.top;
  if(x<0||y<0||x>rect.width||y>rect.height)return '';
  const left=x<=threshold,right=rect.width-x<=threshold,top=y<=threshold,bottom=rect.height-y<=threshold;
  if(top&&left)return 'nw';if(top&&right)return 'ne';if(bottom&&left)return 'sw';if(bottom&&right)return 'se';
  if(top)return 'n';if(bottom)return 's';if(left)return 'w';if(right)return 'e';
  return '';
}
function resizeCursorFor(direction) {
  return ['nw','se'].includes(direction)?'nwse-resize':['ne','sw'].includes(direction)?'nesw-resize':['n','s'].includes(direction)?'ns-resize':['e','w'].includes(direction)?'ew-resize':'';
}
function fitMapNodeText(nodeElement, nodeData) {
  const textElement = nodeElement?.querySelector?.('[data-node-content]');
  if (!textElement || !nodeData) return;
  const preferred = Math.max(9, Math.min(144, Number(nodeData.fontSize) || 12));
  textElement.style.fontSize = `${preferred}px`;
  textElement.dataset.fitTextApplied = String(preferred);
  if (nodeData.fitText !== true) return;

  // O ajuste visual não altera nodeData.fontSize: o tamanho escolhido pelo usuário
  // continua intacto e volta quando houver espaço suficiente no bloco.
  let size = preferred;
  const minSize = 9;
  const fits = () => textElement.scrollHeight <= textElement.clientHeight + 1 && textElement.scrollWidth <= textElement.clientWidth + 1;
  let guard = 0;
  while (!fits() && size > minSize && guard++ < 140) {
    size -= 1;
    textElement.style.fontSize = `${size}px`;
  }
  textElement.dataset.fitTextApplied = String(size);
}
function fitMapTexts(board, topic) {
  if (!board || !topic) return;
  (topic.map || []).forEach(node => fitMapNodeText($(`[data-map-node="${CSS.escape(node.id)}"]`, board), node));
}

function bindMapCanvas() {
  const board=$('#map-board');if(!board)return;
  const topic=activeTopic();if(!topic)return;
  if(mapHistory.topicId!==topic.id)resetMapHistory();
  const camera=mapCameraFor(topic);
  $$('[data-format]').forEach(button=>button.onmousedown=e=>e.preventDefault());
  applyMapCamera(board,camera);
  const onLayout=()=>{applyMapCamera(board,camera);updateMapConnections(board);};
  requestAnimationFrame(()=>{
    const elements=$$('.map-node',board);
    // Se um mapa antigo ainda não possuía câmera, enquadra o conteúdo uma única vez.
    if(topic.cameraNeedsFit){topic.cameraNeedsFit=false;fitMapContent(board);}
    fitMapTexts(board,topic);
    updateMapConnections(board);
    if(window.ResizeObserver){
      mapResizeObserver?.disconnect();
      mapResizeObserver=new ResizeObserver(()=>{fitMapTexts(board,topic);updateMapConnections(board);});
      elements.forEach(el=>mapResizeObserver.observe(el));
    }
  });
  board.onpointerdown=e=>{
    const nodeEl=e.target.closest('.map-node');
    const isPan=e.button===1 || (e.button===0 && mapSpacePressed && !e.target.closest('[contenteditable="true"]'));
    if(isPan){
      e.preventDefault();board.setPointerCapture(e.pointerId);board.classList.add('is-panning');
      board._mapPointer={type:'pan',pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,cx:camera.cx,cy:camera.cy,moved:false};return;
    }
    if(e.button!==0||!nodeEl)return;
    const id=nodeEl.dataset.mapNode;
    if(connectFrom){handleNodeClick(id);return;}
    if(e.target.closest('[data-delete-node]')||e.target.closest('button'))return;
    const resizeDirection=getNodeResizeDirection(nodeEl,e.clientX,e.clientY);
    if(resizeDirection){
      e.preventDefault();if(!selectedMapNodes.has(id)){selectedMapNodes=new Set([id]);$$('.map-node',board).forEach(el=>el.classList.toggle('selected',el.dataset.mapNode===id));updateMapToolbarState();}board.setPointerCapture(e.pointerId);
      board._mapPointer={type:'resize',pointerId:e.pointerId,nodeId:id,direction:resizeDirection,startX:e.clientX,startY:e.clientY,x:Number(mapNodeById(topic,id).x)||0,y:Number(mapNodeById(topic,id).y)||0,width:nodeEl.offsetWidth,height:nodeEl.offsetHeight,moved:false,historyPushed:false};
      nodeEl.dataset.resizeHover=resizeDirection;return;
    }
    if(e.target.closest('[contenteditable="true"]')){
      mapActiveEditor=e.target.closest('[data-node-content]');
      if(!selectedMapNodes.has(id)){selectedMapNodes=new Set([id]);$$('.map-node',board).forEach(el=>el.classList.toggle('selected',selectedMapNodes.has(el.dataset.mapNode)));updateMapToolbarState();}
      return;
    }
    if(e.target.closest('button'))return;
    if(e.shiftKey||e.ctrlKey||e.metaKey){
      if(selectedMapNodes.has(id))selectedMapNodes.delete(id);else selectedMapNodes.add(id);
    }else if(!selectedMapNodes.has(id)){selectedMapNodes=new Set([id]);}
    if(!selectedMapNodes.size)selectedMapNodes.add(id);
    $$('.map-node',board).forEach(el=>el.classList.toggle('selected',selectedMapNodes.has(el.dataset.mapNode)));
    updateMapToolbarState();
    e.preventDefault();board.setPointerCapture(e.pointerId);
    const starts=[...selectedMapNodes].map(nodeId=>{const n=mapNodeById(topic,nodeId);return n?{id:nodeId,x:Number(n.x)||0,y:Number(n.y)||0}:null;}).filter(Boolean);
    board._mapPointer={type:'nodes',pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,starts,moved:false};
  };
  board.onpointermove=e=>{
    const drag=board._mapPointer;
    if(!drag){
      const hovered=e.target.closest?.('button')?null:e.target.closest?.('.map-node');
      $$('.map-node',board).forEach(el=>{if(el!==hovered)delete el.dataset.resizeHover;});
      if(hovered){const direction=getNodeResizeDirection(hovered,e.clientX,e.clientY);if(direction)hovered.dataset.resizeHover=direction;else delete hovered.dataset.resizeHover;}
      return;
    }
    if(drag.pointerId!==e.pointerId)return;
    const dx=e.clientX-drag.startX,dy=e.clientY-drag.startY;
    if(Math.abs(dx)+Math.abs(dy)>2)drag.moved=true;
    if(drag.moved&&!drag.historyPushed){pushMapHistory();drag.historyPushed=true;}
    if(drag.type==='pan'){
      camera.cx=drag.cx-dx/camera.zoom;camera.cy=drag.cy-dy/camera.zoom;
      applyMapCamera(board,camera);return;
    }
    if(drag.type==='nodes'){
      drag.starts.forEach(start=>{const n=mapNodeById(topic,start.id),el=$(`[data-map-node="${CSS.escape(start.id)}"]`,board);if(!n||!el)return;n.x=Math.round(start.x+dx/camera.zoom);n.y=Math.round(start.y+dy/camera.zoom);el.style.left=`${n.x}px`;el.style.top=`${n.y}px`;});
      updateMapConnections(board);return;
    }
    if(drag.type==='resize'){
      const n=mapNodeById(topic,drag.nodeId),el=$(`[data-map-node="${CSS.escape(drag.nodeId)}"]`,board);if(!n||!el)return;
      const direction=drag.direction,worldDx=dx/camera.zoom,worldDy=dy/camera.zoom;
      let width=drag.width,height=drag.height,x=drag.x,y=drag.y;
      if(direction.includes('e'))width=drag.width+worldDx;
      if(direction.includes('s'))height=drag.height+worldDy;
      if(direction.includes('w')){width=drag.width-worldDx;x=drag.x+worldDx;}
      if(direction.includes('n')){height=drag.height-worldDy;y=drag.y+worldDy;}
      width=Math.max(120,Math.min(1200,Math.round(width)));height=Math.max(75,Math.min(1200,Math.round(height)));
      if(direction.includes('w'))x=drag.x+drag.width-width;
      if(direction.includes('n'))y=drag.y+drag.height-height;
      n.width=width;n.height=height;n.x=Math.round(x);n.y=Math.round(y);
      el.style.left=`${n.x}px`;el.style.top=`${n.y}px`;el.style.width=`${n.width}px`;el.style.height=`${n.height}px`;el.style.minHeight='75px';updateMapConnections(board);
    }
  };
  const finishPointer=e=>{
    const drag=board._mapPointer;if(!drag||drag.pointerId!==e.pointerId)return;
    board._mapPointer=null;board.classList.remove('is-panning');
    const nodeEl=$(`[data-map-node="${CSS.escape(drag.nodeId||'')}"]`,board);if(nodeEl)delete nodeEl.dataset.resizeHover;
    if(drag.moved){save();updateMapConnections(board);}
  };
  board.onpointerup=finishPointer;board.onpointercancel=finishPointer;
  board.onlostpointercapture=()=>{board._mapPointer=null;board.classList.remove('is-panning');$$('.map-node',board).forEach(el=>delete el.dataset.resizeHover);};
  board.onpointerleave=()=>{if(!board._mapPointer)$$('.map-node',board).forEach(el=>delete el.dataset.resizeHover);};
  board.onwheel=e=>{
    e.preventDefault();
    if(e.ctrlKey||e.metaKey){const rect=board.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;setMapZoom(board,camera.zoom*Math.exp(-e.deltaY*.002),x,y);}
    else {pushMapHistory();camera.cx+=e.deltaX/camera.zoom;camera.cy+=e.deltaY/camera.zoom;applyMapCamera(board,camera);scheduleMapSave();}
  };
  board.onclick=e=>{
    if(e.target.closest('[data-delete-node]')){
      const id=e.target.closest('[data-delete-node]').dataset.deleteNode;pushMapHistory();topic.map=topic.map.filter(n=>n.id!==id);topic.map.forEach(n=>n.links=(n.links||[]).filter(link=>link!==id));selectedMapNodes.delete(id);save();render();return;
    }
    if(e.target.closest('[data-style-node]')){editSelectedNodeStyle(e.target.closest('[data-style-node]').dataset.styleNode);return;}
    if(e.target===board && !connectFrom){selectedMapNodes.clear();$$('.map-node',board).forEach(el=>el.classList.remove('selected'));updateMapToolbarState();}
  };
  board.oninput=e=>{
    const editor=e.target.closest('[data-node-content]');if(!editor)return;
    mapActiveEditor=editor;const node=mapNodeById(topic,editor.dataset.nodeContent);if(!node)return;
    node.html=safeMapHtml(editor.innerHTML,node.text);node.text=editor.innerText.trim();scheduleMapSave();
  };
  board.onfocusin=e=>{
    const editor=e.target.closest('[data-node-content]');if(editor){mapActiveEditor=editor;pushMapHistory();}
  };
  board.onfocusout=e=>{
    const editor=e.target.closest('[data-node-content]');if(editor){const node=mapNodeById(topic,editor.dataset.nodeContent);if(node){node.html=safeMapHtml(editor.innerHTML,node.text);node.text=editor.innerText.trim();fitMapNodeText(editor.closest('.map-node'),node);save();}}
  };
  board.ondblclick=e=>{const node=e.target.closest('.map-node');if(node&&!e.target.closest('[contenteditable="true"]')){const editor=$('[data-node-content]',node);editor?.focus();}};
  window.onresize=()=>{if(currentPage==='mindmap'){const active=$('#map-board');if(active){applyMapCamera(active,camera);updateMapConnections(active);}}};
}
function mapCopySelection() {
  const topic=activeTopic();if(!topic||!selectedMapNodes.size)return;
  mapClipboard=topic.map.filter(node=>selectedMapNodes.has(node.id)).map(node=>JSON.parse(JSON.stringify(node)));
  toast(`${mapClipboard.length} bloco(s) copiado(s).`);
}
function mapPasteSelection() {
  const topic=activeTopic();if(!topic||!mapClipboard.length)return;
  pushMapHistory();
  const idMap=new Map(mapClipboard.map(node=>[node.id,uid()]));
  const clones=mapClipboard.map(node=>({...JSON.parse(JSON.stringify(node)),id:idMap.get(node.id),x:(Number(node.x)||0)+36,y:(Number(node.y)||0)+36,links:(node.links||[]).filter(id=>idMap.has(id)).map(id=>idMap.get(id))}));
  topic.map.push(...clones);selectedMapNodes=new Set(clones.map(node=>node.id));save();render();
}

function timerComplete() {
  timer.running=false;clearInterval(timer.interval);timer.interval=null;clearInterval(timer.scanInterval);timer.scanInterval=null;
  if(timer.mode==='study') { state.studyStats.completedSessions = (Number(state.studyStats.completedSessions)||0)+1; save(); addXP(20,'sessão de estudo concluída'); timer.mode='rest';timer.seconds=state.settings.rest*60;window.azul?.notify('Azul Estudo','Sua sessão terminou. Hora de descansar um pouco!');toast('Sessão concluída! Hora de fazer uma pausa.'); }
  else { timer.mode='study';timer.seconds=state.settings.study*60;window.azul?.notify('Azul Estudo','Pausa concluída. Pronta para mais uma sessão?');toast('Pausa concluída. Você consegue!'); }
  render();
}
function startTimer() {
  if(timer.running){clearInterval(timer.interval);clearInterval(timer.scanInterval);timer.running=false;timer.interval=null;timer.scanInterval=null;save();render();return;}
  timer.running=true;
  lastStudyInteractionAt=Date.now();
  timer.interval=setInterval(()=>{
    if(timer.mode==='study' && Date.now()-lastStudyInteractionAt < 5*60*1000){
      state.studyStats.totalSeconds=(Number(state.studyStats.totalSeconds)||0)+1;
      state.studyStats.dailySeconds[todayKey()]=(Number(state.studyStats.dailySeconds[todayKey()])||0)+1;
      studyPersistCounter++;
      const live=$('#profile-total-time'); if(live)live.textContent=formatDuration(state.studyStats.totalSeconds);
      if(studyPersistCounter>=15){studyPersistCounter=0;save();}
    }
    timer.seconds--;const el=$('#timer-display');if(el)el.textContent=formatTime(timer.seconds);const total=(timer.mode==='study'?state.settings.study:state.settings.rest)*60;const ring=$('#timer-ring');if(ring)ring.style.background=`conic-gradient(#6fb9e8 ${360*(1-timer.seconds/total)}deg,#d9ebf7 0deg)`;if(timer.seconds<=0)timerComplete();},1000);
  if(focusMode==='strict'){scanFocusApps();clearInterval(timer.scanInterval);timer.scanInterval=setInterval(scanFocusApps,20000);}
  render();
}
function applyTimerSettings() {
  const study=Math.max(1,Math.min(180,Number($('#study-minutes')?.value)||25));
  const rest=Math.max(1,Math.min(60,Number($('#rest-minutes')?.value)||5));
  state.settings.study=study;state.settings.rest=rest;save();
  if(!timer.running)timer.seconds=(timer.mode==='study'?study:rest)*60;
}
async function scanFocusApps() {
  if(focusMode!=='strict'||!timer.running)return;
  try { const result=await window.azul.scanFocusApps();if(result.supported&&result.apps.length)toast(`Atenção: ${result.apps.join(', ')} pode tirar seu foco.`); }
  catch (_) {}
}
function skipTimer() { clearInterval(timer.interval);clearInterval(timer.scanInterval);timer.scanInterval=null;timer.interval=null;timer.running=false;save();timer.mode=timer.mode==='study'?'rest':'study';timer.seconds=(timer.mode==='study'?state.settings.study:state.settings.rest)*60;render(); }
async function exportData() {
  const serialized=JSON.stringify(state,null,2);
  try {
    const result=await window.azul?.exportBackup?.(serialized);
    if(result?.ok){toast('Backup salvo com segurança.');return;}
    if(result?.cancelled)return;
    if(result?.message)toast(result.message);
  } catch(error) { toast(`Falha ao salvar backup: ${error.message}`);return; }
  const blob=new Blob([serialized],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`azul-estudo-backup-${todayKey()}.json`;a.click();URL.revokeObjectURL(url);toast('Backup preparado.');
}
async function importData() {
  try {
    const result=await window.azul?.importBackup?.();
    if(!result?.ok){if(result?.cancelled)return;toast(result?.message||'Não foi possível abrir o backup.');return;}
    const importPayload=result.data?.state && typeof result.data.state==='object' ? result.data.state : result.data;
    if(!importPayload || (!Array.isArray(importPayload.subjects) && !Array.isArray(importPayload.tasks) && !Array.isArray(importPayload.habits)))
      throw new Error('O arquivo não possui uma estrutura reconhecida do Azul Estudo.');
    const imported=migrateState(importPayload);
    if(!confirm(`Importar “${result.fileName}”? Os dados atuais serão substituídos. O backup selecionado não será alterado.`))return;
    const previousEntries=[];
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(key && (/azul/i.test(key)) && !/pre-migration|before-manual-import|backup/i.test(key))
        previousEntries.push({key,raw:localStorage.getItem(key)});
    }
    if(previousEntries.length){
      let previousState=null;
      for(const entry of previousEntries){
        try{
          const parsed=JSON.parse(entry.raw);
          if(parsed && typeof parsed==='object' && (Array.isArray(parsed.subjects)||Array.isArray(parsed.tasks)||Array.isArray(parsed.habits))){previousState=parsed;break;}
        }catch(_){}
      }
      const previousBackup=JSON.stringify({backupKind:'azul-estudo-before-manual-import',...(previousState?{state:previousState}:{}),entries:previousEntries});
      let backupWritten=false;
      try{const backupResult=await window.azul?.backupBeforeMigration?.(previousBackup);backupWritten=!!backupResult?.ok;}catch(_){}
      try{localStorage.setItem(`${STORAGE_KEY}-before-manual-import-${Date.now()}`,previousBackup);backupWritten=true;}catch(_){}
      if(!backupWritten)throw new Error('Não foi possível criar uma cópia dos dados atuais. A importação foi cancelada para evitar perda de informações.');
    }
    state=imported;storageRecoveryError='';migrationPending=false;rawBackupBeforeMigration='';
    timer.seconds=state.settings.study*60;timer.mode='study';timer.running=false;
    selectedMapNodes.clear();connectFrom=null;
    if(!save())throw new Error('O backup foi lido, mas não consegui gravar os dados importados. O backup original continua intacto.');
    toast('Backup importado e dados recuperados.');setPage('home');
  } catch(error){toast(`Falha ao importar o backup: ${error.message}`);}
}


$('#today-label').textContent=formatDate(new Date());
$$('.nav-item').forEach(btn=>btn.addEventListener('click',()=>{if(btn.dataset.page==='subjects')activeSubjectId=null;setPage(btn.dataset.page);}));
$('#settings-button').addEventListener('click',e=>{e.stopPropagation();setPage('settings');});

$('#top-avatar').addEventListener('click',()=>setPage('profile'));
$('.profile-mini')?.addEventListener('click',()=>setPage('profile'));
$('.profile-mini')?.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setPage('profile');}});

$('#page-content').addEventListener('click',async e=>{
  const pageBtn=e.target.closest('[data-page]');if(pageBtn){if(pageBtn.dataset.page==='subjects'&&e.target.closest('.section-row'))activeSubjectId=null;setPage(pageBtn.dataset.page);return;}
  const formatButton=e.target.closest('[data-format]');if(formatButton){formatActiveMapText(formatButton.dataset.format, mapHighlightColor);return;}
  const highlightSwatch=e.target.closest('[data-highlight-color]');if(highlightSwatch){mapHighlightColor=highlightSwatch.dataset.highlightColor;state.settings.highlightColor=mapHighlightColor;save();$$('[data-highlight-color]').forEach(el=>el.classList.toggle('selected',el===highlightSwatch));const picker=$('#map-highlight-color');if(picker)syncColorPair(picker,$('#page-content'));return;}
  const fontStep=e.target.closest('[data-map-font-step]');if(fontStep){const current=Number($('#map-font-size-control')?.value)||12;applyQuickMapFontSize(current+Number(fontStep.dataset.mapFontStep));return;}
  const action=e.target.closest('[data-action]')?.dataset.action;
  const appLaunch=e.target.closest('[data-launch-installed]')?.dataset.launchInstalled;if(appLaunch){const result=await window.azul?.launchInstalledApp?.(appLaunch);toast(result?.message||(result?.ok?'Abrindo aplicativo…':'Não foi possível abrir.'));return;}
  const pinButton=e.target.closest('[data-work-pin]');if(pinButton){const id=pinButton.dataset.workPin;state.workPinned=state.workPinned.includes(id)?state.workPinned.filter(value=>value!==id):[...state.workPinned,id].slice(0,100);save();render();return;}
  if(e.target.closest('[data-work-category]')){workCategory=e.target.closest('[data-work-category]').dataset.workCategory;render();return;}
  const deleteTask=e.target.closest('[data-delete-task]')?.dataset.deleteTask;if(deleteTask){state.tasks=state.tasks.filter(t=>t.id!==deleteTask);save();render();toast('Tarefa removida.');return;}
  const deleteHabit=e.target.closest('[data-delete-habit]')?.dataset.deleteHabit;if(deleteHabit){state.habits=state.habits.filter(h=>h.id!==deleteHabit);save();render();toast('Hábito removido.');return;}
  if(action==='refresh-work-apps'){workAppsLoaded=false;await loadWorkApps(true);return;}
  if(action==='check-updates'){updateStatusText('Procurando uma versão mais recente…','checking');const result=await window.azul?.checkForUpdates?.();if(result&&!result.ok)updateStatusText(result.message||'Não foi possível verificar atualizações.','error');return;}
  if(action==='download-update'){const result=await window.azul?.downloadUpdate?.();if(!result?.ok)updateStatusText(result?.message||'Não foi possível baixar a atualização.','error');else updateStatusText('Download iniciado…','downloading');return;}
  if(action==='install-update'){const result=await window.azul?.installUpdate?.();if(!result?.ok)updateStatusText(result?.message||'Não foi possível instalar a atualização.','error');return;}
  if(action==='add-subject')addSubject(); else if(action==='delete-subject'){const s=activeSubject();if(s&&confirm(`Excluir a matéria "${s.title}" e todos os assuntos dela?`)){state.subjects=state.subjects.filter(x=>x.id!==s.id);activeSubjectId=null;activeTopicId=null;save();setPage('subjects');}} else if(action==='delete-topic'){const s=activeSubject(),t=activeTopic();if(s&&t&&confirm(`Excluir o assunto "${t.title}"?`)){s.topics=s.topics.filter(x=>x.id!==t.id);activeTopicId=s.topics[0]?.id||null;save();render();}} else if(action==='add-topic')addTopic();else if(action==='edit-subject')editSubject();else if(action==='edit-topic')editTopic();else if(action==='add-task')addTask();else if(action==='add-habit')addHabit();else if(action==='open-map')openMap();else if(action==='add-map-node')addMapNode('text');else if(action==='add-map-sticker')addMapNode('sticker');else if(action==='add-map-image')addMapNode('image');else if(action==='add-map-title')addMapHeading('title');else if(action==='add-map-subtitle')addMapHeading('subtitle');else if(action==='connect-nodes'){if(connectFrom){connectFrom=null;toast('Conexão cancelada.');render();}else{connectFrom='select-first';toast('Clique no primeiro bloco para iniciar.');render();}}
  else if(action==='map-zoom-in'||action==='map-zoom-out'||action==='map-zoom-reset'||action==='map-fit'||action==='map-grid'||action==='map-undo'||action==='map-redo'||action==='style-selected'||action==='style-connections'||action==='delete-selected'){
    const board=$('#map-board'),topic=activeTopic();
    if(action==='map-zoom-in'&&board)setMapZoom(board,topic.camera.zoom*1.2);
    else if(action==='map-zoom-out'&&board)setMapZoom(board,topic.camera.zoom/1.2);
    else if(action==='map-zoom-reset'&&board){pushMapHistory();topic.camera.zoom=1;applyMapCamera(board,topic.camera);scheduleMapSave();}
    else if(action==='map-fit'&&board)fitMapContent(board);
    else if(action==='map-grid'&&topic){pushMapHistory();topic.showGrid=topic.showGrid===false;save();render();}
    else if(action==='map-undo')applyMapHistory('undo');else if(action==='map-redo')applyMapHistory('redo');
    else if(action==='style-selected'&&selectedMapNodes.size)editSelectedNodeStyle([...selectedMapNodes][0]);else if(action==='map-presets')openMapPresets();else if(action==='style-connections')openMapConnectionStyle();else if(action==='delete-selected')deleteSelectedMapNodes();
  }
  else if(action==='edit-profile')editProfile();else if(action==='export-data')exportData();else if(action==='import-data')await importData();else if(action==='reset-data'){if(confirm('Isso apagará matérias, tarefas e progresso salvos neste dispositivo. Continuar?')){localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(VERSION_KEY);location.reload();}}
  const subjectCardEl=e.target.closest('[data-open-subject]');if(subjectCardEl){activeSubjectId=subjectCardEl.dataset.openSubject;const s=activeSubject();activeTopicId=s?.topics?.[0]?.id||null;selectedMapNodes.clear();connectFrom=null;resetMapHistory();setPage('subjects');return;}
  const topicEl=e.target.closest('[data-open-topic]');if(topicEl){activeTopicId=topicEl.dataset.openTopic;selectedMapNodes.clear();connectFrom=null;resetMapHistory();render();return;}
  const mode=e.target.closest('[data-focus-mode]')?.dataset.focusMode;if(mode){focusMode=mode;clearInterval(timer.scanInterval);timer.scanInterval=null;if(mode==='strict'&&timer.running){scanFocusApps();timer.scanInterval=setInterval(scanFocusApps,20000);}render();toast(mode==='strict'?'Modo Intenso selecionado.':'Modo atualizado.');return;}
  const launch=e.target.closest('[data-launch-app]')?.dataset.launchApp;if(launch){const result=await window.azul.launchApp(launch);toast(result.message|| (result.ok?'Abrindo aplicativo...':'Não foi possível abrir.'));return;}
});
$('#page-content').addEventListener('change',e=>{
  const taskId=e.target.dataset.taskCheck;if(taskId){const task=state.tasks.find(t=>t.id===taskId);if(task&&!task.done){task.done=true;addXP(15,'tarefa concluída');}else if(task){task.done=false;save();}render();return;}
  const habitId=e.target.dataset.habitCheck;if(habitId){const habit=state.habits.find(h=>h.id===habitId);if(h){habit.done||={};if(e.target.checked){if(!habit.done[todayKey()]){habit.done[todayKey()]=true;addXP(10,'hábito diário concluído');}}else{delete habit.done[todayKey()];save();}}render();return;}
  if(e.target.id==='sound-toggle'){state.settings.sound=e.target.checked;save();toast('Preferência salva.');}
  if(e.target.name==='theme-choice'){state.settings.theme=e.target.value;save();applyAppearance();render();}
  if(e.target.id==='auto-contrast-toggle'){state.settings.autoContrast=e.target.checked;save();applyAppearance();render();}
  if(e.target.dataset.colorPicker||e.target.dataset.colorHexFor){const pair=syncColorPair(e.target,$('#page-content'));if(pair)applySettingColor(pair.key,pair.color,true);}
  if(e.target.id==='app-font-select'){state.settings.font=FONT_OPTIONS.includes(e.target.value)?e.target.value:'Inter';save();applyAppearance();render();}
  if(e.target.id==='map-font-size-control')applyQuickMapFontSize(e.target.value);
  if(e.target.id==='map-font-size-slider'){if(mapFontSliderEditing){save();mapFontSliderEditing=false;}}

});
$('#page-content').addEventListener('click',e=>{
  if(e.target.id==='timer-toggle')startTimer();
  if(e.target.id==='timer-reset'){clearInterval(timer.interval);clearInterval(timer.scanInterval);timer.scanInterval=null;timer.interval=null;timer.running=false;save();timer.mode='study';timer.seconds=state.settings.study*60;render();}
  if(e.target.id==='timer-skip')skipTimer();
});
$('#page-content').addEventListener('change',e=>{if(e.target.id==='study-minutes'||e.target.id==='rest-minutes'){applyTimerSettings();render();}});
$('#page-content').addEventListener('pointerdown',e=>{if(e.target.id==='map-font-size-slider'&&!mapFontSliderEditing){pushMapHistory();mapFontSliderEditing=true;}});
$('#page-content').addEventListener('pointerup',e=>{if(e.target.id==='map-font-size-slider'&&mapFontSliderEditing){save();mapFontSliderEditing=false;}});
$('#page-content').addEventListener('pointercancel',e=>{if(e.target.id==='map-font-size-slider'&&mapFontSliderEditing){save();mapFontSliderEditing=false;}});
$('#page-content').addEventListener('input',e=>{
  if(e.target.id==='app-font-select'){const preview=$('#font-preview');if(preview)preview.style.fontFamily=`'${e.target.value}',sans-serif`;}
  if(e.target.dataset.colorPicker||e.target.dataset.colorHexFor){const pair=syncColorPair(e.target,$('#page-content'));if(pair)applySettingColor(pair.key,pair.color,false);}
  if(e.target.id==='work-app-search'){workSearchTerm=e.target.value;const cursor=e.target.selectionStart;render();const search=$('#work-app-search');search?.focus();if(search&&cursor!==null)search.setSelectionRange(cursor,cursor);}
  if(e.target.id==='map-font-size-slider'){
    if(!mapFontSliderEditing){pushMapHistory();mapFontSliderEditing=true;}
    applyQuickMapFontSize(e.target.value,{recordHistory:false,persist:false});
  }
});
function isTextEntry(target) { return !!target?.closest?.('input,textarea,select,[contenteditable="true"],[role="textbox"]'); }
window.addEventListener('keydown',e=>{
  if(e.key==='Escape'){$('#modal-root').innerHTML='';connectFrom=null;}
  if(e.code==='Space'&&!isTextEntry(e.target)&&currentPage==='mindmap'){mapSpacePressed=true;e.preventDefault();}
  if((e.ctrlKey||e.metaKey)&&currentPage==='mindmap'){
    const inEditor=!!e.target.closest?.('[contenteditable="true"]');
    if(e.key.toLowerCase()==='z'&&!inEditor){e.preventDefault();applyMapHistory(e.shiftKey?'redo':'undo');}
    else if(e.key.toLowerCase()==='y'&&!inEditor){e.preventDefault();applyMapHistory('redo');}
    else if(e.key.toLowerCase()==='a'&&!inEditor){e.preventDefault();selectedMapNodes=new Set((activeTopic()?.map||[]).map(n=>n.id));$$('.map-node').forEach(el=>el.classList.add('selected'));updateMapToolbarState();}
    else if(e.key.toLowerCase()==='c'&&!inEditor&&selectedMapNodes.size){e.preventDefault();mapCopySelection();}
    else if(e.key.toLowerCase()==='v'&&!inEditor&&mapClipboard.length){e.preventDefault();mapPasteSelection();}
  }
  if((e.key==='Delete'||e.key==='Backspace')&&currentPage==='mindmap'&&!isTextEntry(e.target)&&selectedMapNodes.size){e.preventDefault();deleteSelectedMapNodes();}
});
window.addEventListener('keyup',e=>{if(e.code==='Space')mapSpacePressed=false;});
window.addEventListener('blur',()=>{mapSpacePressed=false;if(mapFontSliderEditing){save();mapFontSliderEditing=false;}});
['pointerdown','keydown','wheel','touchstart'].forEach(eventName=>window.addEventListener(eventName,()=>{lastStudyInteractionAt=Date.now();},{passive:true}));
window.addEventListener('beforeunload',()=>{try{save();}catch(_){}});
render();
if(storageRecoveryError)setTimeout(()=>toast('Os dados antigos foram preservados. Importe um backup nas configurações.'),500);
