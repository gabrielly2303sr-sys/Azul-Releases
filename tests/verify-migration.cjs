const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
const marker = 'let state = loadPersistedState();';
const end = source.indexOf(marker);
assert.notEqual(end, -1, 'Não foi possível localizar a fronteira do carregamento inicial do app.');

const context = { console };
vm.createContext(context);
vm.runInContext(`${source.slice(0, end)}\nglobalThis.__migrationTest = { migrateState, loadPersistedState, DATA_VERSION, get migrationPending(){ return migrationPending; }, get rawBackupBeforeMigration(){ return rawBackupBeforeMigration; }, defaultState, formatDuration };`, context);
const { migrateState, loadPersistedState, DATA_VERSION, defaultState, formatDuration } = context.__migrationTest;

const legacy = {
  subjects: [{
    id: 'subject-keep-id',
    title: 'Biologia',
    banner: 'https://example.com/banner.jpg',
    topics: [{
      id: 'topic-keep-id',
      title: 'Células',
      notes: 'Anotações antigas',
      edgeStyle: { color: '#ff8800', width: 4, dash: 'dashed', curve: 'wide' },
      map: [
        { id: 'node-a', text: 'Membrana', x: 50, y: 20, width: 280, height: 150, links: ['node-b'], background: '#fff0a8', fontFamily: 'Georgia', fontSize: 18, borderStyle: 'dotted' },
        { id: 'node-b', text: 'Citoplasma', x: 72, y: 55, links: ['node-a'] }
      ]
    }]
  }],
  tasks: [{ id: 'task-keep-id', title: 'Revisar', done: true, date: '2026-11-08' }],
  habits: [{ id: 'habit-keep-id', title: 'Ler', done: { '2026-11-08': true } }],
  xp: 735,
  activityDates: ['2026-11-07', '2026-11-08'],
  settings: { study: 40, rest: 8, sound: false }
};

const migrated = migrateState(legacy);
const topic = migrated.subjects[0].topics[0];
assert.equal(migrated.dataVersion, DATA_VERSION);
assert.equal(migrated.profile.name, 'Meu cantinho', 'Perfis antigos recebem um perfil padrão sem perder os dados.');
assert.equal(migrated.studyStats.totalSeconds, 0, 'Estatísticas são inicializadas em migrações antigas.');
assert.equal(migrated.settings.theme, 'light', 'O tema antigo recebe um padrão válido.');
assert.equal(formatDuration(3661), '1h 01min 01s');
assert.equal(migrated.subjects[0].id, 'subject-keep-id');
assert.equal(topic.id, 'topic-keep-id');
assert.equal(topic.map[0].id, 'node-a');
assert.equal(topic.map[0].x, 600);
assert.equal(topic.map[0].y, 82);
assert.deepEqual(Array.from(topic.map[0].links), ['node-b']);
assert.equal(topic.edgeStyle.color, '#ff8800', 'O estilo personalizado das conexões deve sobreviver à migração.');
assert.equal(topic.edgeStyle.width, 4);
assert.equal(topic.map[0].background, '#fff0a8', 'A aparência personalizada dos blocos deve ser preservada.');
assert.equal(topic.map[0].fontFamily, 'Georgia');
assert.equal(topic.map[0].fontSize, 18);
assert.equal(topic.map[0].fitText, false, 'Nós antigos recebem ajuste automático desativado sem alterar a tipografia.');
assert.equal(topic.map[0].borderStyle, 'dotted');
assert.equal(topic.mapVersion, 2);
assert.equal(topic.camera.zoom, 1);
assert.equal(topic.cameraNeedsFit, true);
assert.equal(migrated.tasks[0].done, true);
assert.equal(migrated.habits[0].id, 'habit-keep-id');
assert.equal(migrated.xp, 735);
assert.deepEqual(Array.from(migrated.activityDates), ['2026-11-07', '2026-11-08']);
assert.equal(migrated.settings.study, 40);
assert.equal(migrated.settings.rest, 8);
assert.equal(migrated.settings.sound, false);
assert.equal(migrated.settings.baseColor, '#6db8eb', 'A cor-base recebe um padrão sem alterar configurações antigas.');

const migratedAgain = migrateState(migrated);
assert.equal(migratedAgain.subjects[0].topics[0].map[0].x, 600, 'A segunda migração não pode converter coordenadas novamente.');
assert.equal(migratedAgain.subjects[0].topics[0].map[0].y, 82);
assert.equal(migratedAgain.subjects[0].topics[0].map[0].id, 'node-a');
assert.equal(migratedAgain.subjects[0].topics[0].edgeStyle.color, '#ff8800');
assert.equal(migratedAgain.subjects[0].topics[0].map[0].fontFamily, 'Georgia');
assert.equal(migratedAgain.tasks[0].id, 'task-keep-id');
assert.equal(migratedAgain.xp, 735);
assert.equal(JSON.stringify(migratedAgain), JSON.stringify(migrated), 'A migração deve ser idempotente.');

const memoryStore = new Map([['azul-estudo-data-v1', JSON.stringify(legacy)]]);
context.localStorage = {
  get length() { return memoryStore.size; },
  key(index) { return Array.from(memoryStore.keys())[index] ?? null; },
  getItem(key) { return memoryStore.has(key) ? memoryStore.get(key) : null; },
  setItem(key, value) { memoryStore.set(key, String(value)); }
};
const firstLoad = loadPersistedState();
assert.equal(context.__migrationTest.migrationPending, true, 'A primeira abertura deve detectar a migração pendente.');
assert.equal(firstLoad.subjects[0].topics[0].map[0].x, 600);
assert.ok(JSON.parse(context.__migrationTest.rawBackupBeforeMigration).state.subjects, 'O backup de pré-migração deve conter o estado original.');
memoryStore.set('azul-estudo-data-v1', JSON.stringify(firstLoad));
memoryStore.set('azul-estudo-schema-version', String(DATA_VERSION));
const secondLoad = loadPersistedState();
assert.equal(context.__migrationTest.migrationPending, false, 'A abertura seguinte não deve repetir a migração.');
assert.equal(secondLoad.subjects[0].topics[0].map[0].x, 600);

const customized = migrateState({ subjects: [], profile: { name: 'Gabi', avatar: 'https://example.com/avatar.png' }, studyStats: { totalSeconds: 7322, dailySeconds: { '2026-11-09': 7322 }, completedSessions: 4 }, mapPresets: { items: [{ id: 'custom-a', name: 'Resumo', type: 'text', background: '#fff0a8', fontSize: 18, width: 350 }], defaults: { text: 'custom-a' } }, settings: { theme: 'midnight', autoContrast: false, font: 'Georgia' } });
assert.equal(customized.profile.name, 'Gabi');
assert.equal(customized.studyStats.totalSeconds, 7322);
assert.equal(customized.studyStats.completedSessions, 4);
const fitTextNode=migrateState({subjects:[{id:'fit-subject',topics:[{id:'fit-topic',map:[{id:'fit-node',fitText:true,fontSize:32,width:220,height:110}]}]}]});
assert.equal(fitTextNode.subjects[0].topics[0].map[0].fitText,true,'A preferência de ajuste automático deve ser persistida na migração.');
assert.equal(fitTextNode.subjects[0].topics[0].map[0].fontSize,32,'A migração não deve alterar o tamanho-base do texto.');
assert.equal(customized.settings.theme, 'midnight');
assert.equal(customized.settings.autoContrast, false);
assert.equal(customized.settings.font, 'Georgia');
const legacyAccent = migrateState({ settings: { accent: '#aa66cc' } });
assert.equal(legacyAccent.settings.baseColor, '#aa66cc', 'A cor de destaque antiga deve ser reaproveitada como cor-base.');
assert.equal(customized.mapPresets.items[0].id, 'custom-a', 'Presets personalizados devem sobreviver à migração.');
assert.equal(customized.mapPresets.defaults.text, 'custom-a', 'O preset padrão de novos blocos deve ser preservado.');
const oldWithoutPresets = migrateState({ subjects: [{ id: 'legacy-subject', topics: [{ id: 'legacy-topic', map: [{ id: 'legacy-node', x: 3, y: 4, links: ['other'], width: 260, height: 140 }] }] }] });
assert.equal(oldWithoutPresets.subjects[0].topics[0].map[0].id, 'legacy-node');
assert.equal(oldWithoutPresets.subjects[0].topics[0].map[0].width, 260);
assert.equal(oldWithoutPresets.subjects[0].topics[0].map[0].fitText, false);
assert.equal(oldWithoutPresets.mapPresets.defaults.sticker, 'builtin-postit');

console.log('Migração v7: backup anterior, matérias, conexões e estilos personalizados preservados; coordenadas idempotentes; perfil, estatísticas, presets personalizados e preferências visuais.');
