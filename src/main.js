const { app, BrowserWindow, ipcMain, shell, Notification, dialog, protocol, net } = require('electron');
const { autoUpdater } = require('electron-updater');
const { spawn, execFile } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

// Compatibilidade: mantém o mesmo perfil Electron em Linux (~/.config/azul-estudo)
// e Windows (%APPDATA%/azul-estudo), antes de qualquer janela ou armazenamento ser criado.
app.setPath('userData', path.join(app.getPath('appData'), 'azul-estudo'));
if (process.platform === 'win32') app.setAppUserModelId('dev.azulestudo.desktop');

protocol.registerSchemesAsPrivileged([{ scheme: 'azul-asset', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

let mainWindow;
let latestUpdateStatus = { status: 'idle' };

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 620,
    title: 'Azul Estudo',
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    backgroundColor: '#edf7ff',
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#edf7ff',
      symbolColor: '#47647c',
      height: 38
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(async () => {
  await protocol.handle('azul-asset', async request => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== 'local') return new Response('Not found', { status: 404 });
      const filename = path.basename(decodeURIComponent(url.pathname));
      if (!/^[a-z0-9-]+\.(?:png|jpe?g|webp)$/i.test(filename)) return new Response('Not found', { status: 404 });
      const assetPath = path.join(app.getPath('userData'), 'media', filename);
      return await net.fetch(pathToFileURL(assetPath).toString());
    } catch (_) { return new Response('Not found', { status: 404 }); }
  });
  createWindow();
  configureAutoUpdater();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Mantém appId, productName e app.getPath('userData') inalterados para reutilizar
// o perfil Electron das versões anteriores. Backups são adicionais e nunca sobrescritos.

ipcMain.handle('assets:import-image', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Importar imagem para o Azul Estudo',
    properties: ['openFile'],
    filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
  });
  if (result.canceled || !result.filePaths?.[0]) return { ok: false, cancelled: true };
  const source = result.filePaths[0];
  const extension = path.extname(source).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) return { ok: false, message: 'Formato de imagem não suportado.' };
  const stat = await fs.stat(source);
  if (stat.size > 20 * 1024 * 1024) return { ok: false, message: 'A imagem ultrapassa o limite de 20 MB.' };
  const directory = path.join(app.getPath('userData'), 'media');
  await fs.mkdir(directory, { recursive: true });
  const filename = `${crypto.randomUUID()}${extension}`;
  const destination = path.join(directory, filename);
  await fs.copyFile(source, destination, fs.constants.COPYFILE_EXCL);
  return { ok: true, src: `azul-asset://local/${filename}` };
});

ipcMain.handle('storage:backup-before-migration', async (_event, raw) => {
  if (typeof raw !== 'string' || raw.length > 50 * 1024 * 1024) return { ok: false, message: 'Backup de migração inválido ou muito grande.' };
  const directory = path.join(app.getPath('userData'), 'backups', 'migration');
  await fs.mkdir(directory, { recursive: true });
  const filename = `azul-estudo-before-migration-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.json`;
  const destination = path.join(directory, filename);
  await fs.writeFile(destination, raw, { encoding: 'utf8', flag: 'wx' });
  return { ok: true, path: destination };
});

ipcMain.handle('storage:import-backup', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Importar backup do Azul Estudo',
    properties: ['openFile'],
    filters: [{ name: 'Backup JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePaths?.[0]) return { ok: false, cancelled: true };
  const filePath = result.filePaths[0];
  const stat = await fs.stat(filePath);
  if (stat.size > 50 * 1024 * 1024) return { ok: false, message: 'O backup ultrapassa o limite de 50 MB.' };
  const content = await fs.readFile(filePath, 'utf8');
  let data;
  try { data = JSON.parse(content); }
  catch { return { ok: false, message: 'O arquivo selecionado não contém JSON válido.' }; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, message: 'Estrutura de backup inválida.' };
  const payload = data.state && typeof data.state === 'object' ? data.state : data;
  const hasAzulData = Array.isArray(payload.subjects) || Array.isArray(payload.tasks) || Array.isArray(payload.habits) || (Array.isArray(payload.activityDates) && Number.isFinite(Number(payload.xp)));
  if (!hasAzulData) return { ok: false, message: 'Este arquivo não parece ser um backup do Azul Estudo.' };
  return { ok: true, data, fileName: path.basename(filePath) };
});

ipcMain.handle('storage:export-backup', async (_event, serialized) => {
  if (typeof serialized !== 'string' || serialized.length > 50 * 1024 * 1024) return { ok: false, message: 'Dados de exportação inválidos.' };
  try { JSON.parse(serialized); } catch { return { ok: false, message: 'Os dados não formam um JSON válido.' }; }
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Salvar backup do Azul Estudo',
    defaultPath: `azul-estudo-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'Backup JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return { ok: false, cancelled: true };
  await fs.writeFile(result.filePath, serialized, { encoding: 'utf8', flag: 'w' });
  return { ok: true, path: result.filePath };
});

const linuxDesktopRoots = () => [
  path.join(app.getPath('home'), '.local/share/applications'),
  path.join(app.getPath('home'), '.local/share/flatpak/exports/share/applications'),
  '/usr/local/share/applications',
  '/usr/share/applications',
  '/var/lib/flatpak/exports/share/applications'
];
let installedAppsCache = [];

function appCategory(name, categories = '') {
  const value = `${name} ${categories}`.toLowerCase();
  if (/education|science|office|study|school|writer|calc|impress/.test(value)) return 'Estudo';
  if (/development|ide|programming|code|graphics|vectorgraphics|drawing|photo|videoediting/.test(value)) return 'Criação';
  if (/network|webbrowser|browser|chat|instantmessaging|email|communication/.test(value)) return 'Comunicação';
  if (/audio|video|music|player|audiovideo/.test(value)) return 'Mídia';
  return 'Aplicativos';
}
function appGlyph(name, category) {
  const value = String(name || '').toLowerCase();
  if (/firefox/.test(value)) return '🦊';
  if (/chrome|chromium|browser|brave|edge/.test(value)) return '🌐';
  if (/spotify/.test(value)) return '♫';
  if (/whatsapp/.test(value)) return '◉';
  if (/discord/.test(value)) return '◈';
  if (/obsidian/.test(value)) return '◩';
  if (/code|visual studio/.test(value)) return '⌘';
  if (/writer|word/.test(value)) return 'W';
  if (/calc|excel|spreadsheet/.test(value)) return '▦';
  if (/libreoffice|impress|powerpoint/.test(value)) return '▣';
  if (/gimp|krita|inkscape|blender/.test(value)) return '✎';
  if (category === 'Estudo') return '📚';
  if (category === 'Criação') return '✦';
  if (category === 'Comunicação') return '↗';
  if (category === 'Mídia') return '♫';
  return '▣';
}
async function walkDesktopFiles(directory, depth = 0, output = []) {
  if (depth > 3 || output.length > 350) return output;
  let entries;
  try { entries = await fs.readdir(directory, { withFileTypes: true }); } catch { return output; }
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.desktop')) output.push(full);
    else if (entry.isDirectory() && !entry.name.startsWith('.')) await walkDesktopFiles(full, depth + 1, output);
    if (output.length > 350) break;
  }
  return output;
}
function parseDesktopApp(filePath, text) {
  const desktopEntry = String(text).split(/\r?\n(?=\[)/)[0];
  const fields = {};
  for (const line of desktopEntry.split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    fields[line.slice(0, index)] = line.slice(index + 1).trim();
  }
  const name = fields['Name[pt_BR]'] || fields['Name[pt]'] || fields.Name;
  if (fields.Type && fields.Type !== 'Application') return null;
  if (!name || !fields.Exec || fields.NoDisplay === 'true' || fields.Hidden === 'true' || fields.Terminal === 'true') return null;
  const categories = fields.Categories || '';
  const category = appCategory(name, categories);
  return { id: filePath, name, category, glyph: appGlyph(name, category), platform: 'linux' };
}
async function listLinuxInstalledApps() {
  const roots = linuxDesktopRoots();
  const files = [];
  for (const root of roots) await walkDesktopFiles(root, 0, files);
  const byName = new Map();
  for (const file of files) {
    let content;
    try { content = await fs.readFile(file, 'utf8'); } catch { continue; }
    const appInfo = parseDesktopApp(file, content);
    if (!appInfo) continue;
    const key = appInfo.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (!byName.has(key)) byName.set(key, appInfo);
  }
  const apps = [...byName.values()];
  const priority = name => /firefox|chrome|chromium|edge|libreoffice|writer|obsidian|code|visual studio|spotify|whatsapp|discord|krita|gimp|inkscape/.test(name.toLowerCase()) ? 0 : 1;
  apps.sort((a, b) => priority(a.name) - priority(b.name) || a.name.localeCompare(b.name, 'pt-BR'));
  return apps.slice(0, 180);
}
function runPowerShell(script, timeout = 8000) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) return reject(new Error(String(stderr || error.message).trim()));
      resolve(String(stdout || '').trim());
    });
  });
}
async function listWindowsInstalledApps() {
  const script = `$ErrorActionPreference='Stop'; Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress`;
  const output = await runPowerShell(script, 12000);
  let rows = [];
  try { rows = output ? JSON.parse(output) : []; } catch { rows = []; }
  if (!Array.isArray(rows)) rows = rows ? [rows] : [];
  const seen = new Set();
  return rows.filter(row => row && row.Name && row.AppID && !seen.has(String(row.AppID)) && seen.add(String(row.AppID)))
    .map(row => {
      const category = appCategory(row.Name);
      return { id: String(row.AppID), name: String(row.Name), category, glyph: appGlyph(row.Name, category), platform: 'win32' };
    })
    .sort((a, b) => {
      const aPriority = /firefox|chrome|edge|libreoffice|obsidian|code|spotify|whatsapp|discord|krita/.test(a.name.toLowerCase()) ? 0 : 1;
      const bPriority = /firefox|chrome|edge|libreoffice|obsidian|code|spotify|whatsapp|discord|krita/.test(b.name.toLowerCase()) ? 0 : 1;
      return aPriority - bPriority || a.name.localeCompare(b.name, 'pt-BR');
    }).slice(0, 180);
}
async function discoverInstalledApps() {
  if (process.platform === 'linux') return listLinuxInstalledApps();
  if (process.platform === 'win32') return listWindowsInstalledApps();
  return [];
}

ipcMain.handle('apps:list-installed', async () => {
  try {
    installedAppsCache = await discoverInstalledApps();
    return { ok: true, platform: process.platform, apps: installedAppsCache };
  } catch (error) {
    return { ok: false, platform: process.platform, apps: [], message: `Não foi possível listar os aplicativos: ${error.message}` };
  }
});

ipcMain.handle('apps:launch-installed', async (_event, appId) => {
  if (typeof appId !== 'string' || !appId || appId.length > 2048) return { ok: false, message: 'Atalho inválido.' };
  if (!installedAppsCache.length) {
    try { installedAppsCache = await discoverInstalledApps(); } catch { return { ok: false, message: 'Não foi possível consultar os aplicativos instalados.' }; }
  }
  const entry = installedAppsCache.find(appInfo => appInfo.id === appId);
  if (!entry) return { ok: false, message: 'Este aplicativo não está mais disponível. Atualize a lista de atalhos.' };
  if (process.platform === 'linux') {
    return new Promise(resolve => {
      execFile('gio', ['launch', entry.id], { timeout: 8000, windowsHide: true }, error => {
        if (!error) return resolve({ ok: true });
        const desktopId = path.basename(entry.id, '.desktop');
        execFile('gtk-launch', [desktopId], { timeout: 8000 }, gtkError => resolve(gtkError ? { ok: false, message: 'Não foi possível abrir este aplicativo.' } : { ok: true }));
      });
    });
  }
  if (process.platform === 'win32') {
    if (!/^[A-Za-z0-9._{}!_\\-]+$/.test(entry.id)) return { ok: false, message: 'Identificador do aplicativo inválido.' };
    try {
      const safeId = entry.id.replace(/'/g, "''");
      await runPowerShell(`Start-Process -FilePath 'explorer.exe' -ArgumentList ('shell:AppsFolder\\${safeId}')`, 8000);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: `Não foi possível abrir ${entry.name}: ${error.message}` };
    }
  }
  return { ok: false, message: 'Atalhos automáticos não estão disponíveis neste sistema.' };
});

ipcMain.handle('apps:launch', async (_event, appName) => {
  const commands = {
    firefox: [
      { command: 'firefox', args: [] },
      { command: 'firefox-esr', args: [] },
      { command: 'flatpak', args: ['run', 'org.mozilla.firefox'], appId: 'org.mozilla.firefox' }
    ],
    spotify: [
      { command: 'spotify', args: [] },
      { command: 'flatpak', args: ['run', 'com.spotify.Client'], appId: 'com.spotify.Client' }
    ],
    whatsapp: [
      { command: 'whatsapp-for-linux', args: [] },
      { command: 'whatsapp', args: [] },
      { command: 'flatpak', args: ['run', 'io.github.mimbrero.WhatsApp'], appId: 'io.github.mimbrero.WhatsApp' }
    ]
  };
  const candidates = commands[appName];
  if (!candidates) return { ok: false, message: 'Aplicativo não permitido.' };

  for (const candidate of candidates) {
    const found = await new Promise(resolve => {
      const args = candidate.appId ? ['info', candidate.appId] : [candidate.command];
      execFile(candidate.appId ? 'flatpak' : 'which', args, { timeout: 2500 }, error => resolve(!error));
    });
    if (!found) continue;
    try {
      const child = spawn(candidate.command, candidate.args, { detached: true, stdio: 'ignore' });
      child.unref();
      return { ok: true };
    } catch (_) {}
  }
  if (appName === 'whatsapp') {
    await shell.openExternal('https://web.whatsapp.com');
    return { ok: true, message: 'WhatsApp Web aberto no navegador padrão.' };
  }
  return { ok: false, message: 'Não encontrei esse aplicativo instalado.' };
});

ipcMain.handle('focus:scan', async () => {
  if (process.platform === 'linux') {
    return new Promise(resolve => {
      execFile('ps', ['-u', String(process.getuid()), '-o', 'comm='], { timeout: 2500 }, (error, stdout) => {
        if (error) return resolve({ supported: false, apps: [] });
        const names = new Set(stdout.split('\n').map(x => x.trim().toLowerCase()).filter(Boolean));
        const knownDistractions = [
          ['discord', 'Discord'], ['steam', 'Steam'], ['lutris', 'Lutris'],
          ['heroic', 'Heroic Games Launcher'], ['telegram-desktop', 'Telegram'],
          ['telegram', 'Telegram'], ['obsidian', 'Obsidian'], ['vlc', 'VLC'],
          ['prismlauncher', 'Prism Launcher'], ['minecraft-launcher', 'Minecraft Launcher']
        ];
        const apps = knownDistractions.filter(([bin]) => names.has(bin)).map(([, label]) => label);
        resolve({ supported: true, apps });
      });
    });
  }
  if (process.platform === 'win32') {
    try {
      const output = await runPowerShell(`$names = @('Discord','Steam','Telegram','Obsidian','vlc','Spotify'); Get-Process | Where-Object { $names -contains $_.ProcessName } | Select-Object -ExpandProperty ProcessName -Unique | ConvertTo-Json -Compress`, 5000);
      let names = output ? JSON.parse(output) : [];
      if (!Array.isArray(names)) names = names ? [names] : [];
      return { supported: true, apps: names.map(name => ({ discord: 'Discord', steam: 'Steam', telegram: 'Telegram', obsidian: 'Obsidian', vlc: 'VLC', spotify: 'Spotify' }[String(name).toLowerCase()] || name)) };
    } catch { return { supported: false, apps: [] }; }
  }
  return { supported: false, apps: [] };
});

function sendUpdateStatus(status, details = {}) {
  latestUpdateStatus = { status, ...details, updatedAt: Date.now() };
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('updates:status', latestUpdateStatus);
}
function configureAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.on('checking-for-update', () => sendUpdateStatus('checking'));
  autoUpdater.on('update-available', info => sendUpdateStatus('available', { version: info.version, releaseDate: info.releaseDate || null }));
  autoUpdater.on('update-not-available', info => sendUpdateStatus('up-to-date', { version: info.version || app.getVersion() }));
  autoUpdater.on('download-progress', progress => sendUpdateStatus('downloading', { percent: Math.round(progress.percent || 0), transferred: progress.transferred || 0, total: progress.total || 0 }));
  autoUpdater.on('update-downloaded', info => sendUpdateStatus('downloaded', { version: info.version }));
  autoUpdater.on('error', error => sendUpdateStatus('error', { message: String(error?.message || error || 'Erro desconhecido').slice(0, 400) }));
  if (app.isPackaged) {
    const timer = setTimeout(() => autoUpdater.checkForUpdates().catch(error => sendUpdateStatus('error', { message: String(error.message || error).slice(0, 400) })), 15000);
    timer.unref?.();
  }
}

ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform, packaged: app.isPackaged }));
ipcMain.handle('updates:get-status', () => latestUpdateStatus);
ipcMain.handle('updates:check', async () => {
  if (!app.isPackaged) return { ok: false, message: 'A verificação automática funciona na versão instalada do Azul Estudo.' };
  try {
    const result = await autoUpdater.checkForUpdates();
    return { ok: true, version: result?.updateInfo?.version || null };
  } catch (error) {
    sendUpdateStatus('error', { message: String(error.message || error).slice(0, 400) });
    return { ok: false, message: String(error.message || error).slice(0, 400) };
  }
});
ipcMain.handle('updates:download', async () => {
  if (!app.isPackaged) return { ok: false, message: 'Atualizações só podem ser baixadas na versão instalada.' };
  try { await autoUpdater.downloadUpdate(); return { ok: true }; }
  catch (error) { sendUpdateStatus('error', { message: String(error.message || error).slice(0, 400) }); return { ok: false, message: String(error.message || error).slice(0, 400) }; }
});
ipcMain.handle('updates:install', () => {
  if (!app.isPackaged) return { ok: false, message: 'Instale a versão publicada para usar o atualizador.' };
  setImmediate(() => autoUpdater.quitAndInstall());
  return { ok: true };
});

ipcMain.handle('system:notify', (_event, title, body) => {
  if (Notification.isSupported()) new Notification({ title, body }).show();
  return true;
});

ipcMain.handle('external:open', (_event, url) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false;
  shell.openExternal(url);
  return true;
});
