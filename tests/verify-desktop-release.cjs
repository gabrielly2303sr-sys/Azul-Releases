const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const pkg = require('../package.json');
const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
const builder = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'publish-github.cjs'), 'utf8');

assert.equal(pkg.version, '0.2.7');
assert.equal(pkg.build.appId, 'dev.azulestudo.desktop');
assert.equal(pkg.build.productName, 'Azul Estudo');
assert.ok(pkg.dependencies['electron-updater'], 'electron-updater deve estar presente.');
assert.ok(pkg.build.linux.target.some(target => target === 'AppImage' || target?.target === 'AppImage'));
assert.ok(pkg.build.win.target.some(target => target === 'nsis' || target?.target === 'nsis'));
assert.equal(pkg.build.linux.icon, 'assets/icon.png');
assert.equal(pkg.build.win.icon, 'assets/icon.ico');
assert.equal(pkg.build.nsis.installerIcon, 'assets/icon.ico');
assert.equal(pkg.build.nsis.uninstallerIcon, 'assets/icon.ico');
assert.equal(pkg.build.nsis.deleteAppDataOnUninstall, false, 'Desinstalar não deve apagar dados do estudante.');
assert.ok(pkg.build.files.includes('assets/icon.png'));
assert.ok(pkg.build.files.includes('assets/icon.ico'));
assert.ok(fs.existsSync(path.join(__dirname, '..', 'build-appimage.sh')));
assert.ok(fs.existsSync(path.join(__dirname, '..', 'build-windows.ps1')));
assert.ok(fs.existsSync(path.join(__dirname, '..', 'build-all-linux.sh')));
assert.match(main, /app\.setPath\('userData',[\s\S]*?'azul-estudo'\)/, 'O caminho de dados compatível deve permanecer fixo.');
assert.match(main, /setAppUserModelId\('dev\.azulestudo\.desktop'\)/);
assert.match(main, /assets', process\.platform === 'win32' \? 'icon\.ico' : 'icon\.png'/);
assert.match(main, /autoUpdater\.checkForUpdates/);
assert.match(main, /updates:download/);
assert.match(main, /updates:install/);
assert.match(main, /updates:get-status/);
assert.match(main, /Get-StartApps/);
assert.match(main, /listLinuxInstalledApps/);
assert.match(preload, /listInstalledApps/);
assert.match(preload, /launchInstalledApp/);
assert.match(preload, /checkForUpdates/);
assert.match(preload, /downloadUpdate/);
assert.match(preload, /installUpdate/);
assert.match(preload, /getUpdateStatus/);
assert.match(html, /data-page="work"/);
assert.match(html, /assets\/icon\.png/);
assert.match(app, /function renderWork\(/);
assert.match(app, /workShortcutsInitialized/);
assert.match(app, /function loadWorkApps\(/);
assert.match(app, /Escolha avançada/);
assert.match(app, /data-color-picker/);
assert.match(app, /data-color-hex-for/);
assert.match(app, /fitText:values\.fitText===true/);
assert.match(app, /function fitMapNodeText\(/);
assert.match(app, /const DATA_VERSION = 7/);
assert.match(builder, /GH_REPO/);
assert.match(builder, /provider: 'github'/);
assert.match(builder, /--publish', 'always'/);

for (const relative of ['assets/icon.png', 'src/assets/icon.png']) {
  const png = fs.readFileSync(path.join(__dirname, '..', relative));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${relative} deve ser PNG válido.`);
}
for (const relative of ['assets/icon.ico', 'src/assets/icon.ico']) {
  const ico = fs.readFileSync(path.join(__dirname, '..', relative));
  assert.equal(ico.readUInt16LE(0), 0, `${relative} deve ter cabeçalho ICO válido.`);
  assert.equal(ico.readUInt16LE(2), 1, `${relative} deve ter tipo de ícone ICO.`);
}
console.log('Desktop v0.2.7: AppImage, NSIS, ícones PNG/ICO, caminho de dados, atalhos Linux/Windows e auto-updater GitHub verificados.');
