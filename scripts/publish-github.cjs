#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const packagePath = path.join(root, 'package.json');
const originalText = fs.readFileSync(packagePath, 'utf8');
const packageJson = JSON.parse(originalText);

function fail(message) {
  console.error(`\nERRO: ${message}\n`);
  process.exitCode = 1;
}

function getRepository() {
  const fromEnv = String(process.env.GH_REPO || '').trim();
  if (fromEnv) return parseRepository(fromEnv);
  const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8' }).trim();
  return parseRepository(remote);
}

function parseRepository(value) {
  const input = String(value || '').trim();
  const direct = input.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (direct) return { owner: direct[1], repo: direct[2].replace(/\.git$/, '') };
  const ssh = input.match(/^(?:git@|ssh:\/\/git@)github\.com[:/]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/i);
  if (ssh) return { owner: ssh[1], repo: ssh[2] };
  try {
    const url = new URL(input);
    if (url.hostname.toLowerCase() !== 'github.com') throw new Error('host');
    const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
    if (parts.length !== 2) throw new Error('path');
    return { owner: parts[0], repo: parts[1].replace(/\.git$/i, '') };
  } catch {
    throw new Error('Não consegui identificar o repositório. Configure `git remote add origin https://github.com/USUARIO/REPOSITORIO.git` ou defina GH_REPO=USUARIO/REPOSITORIO.');
  }
}

function getToken() {
  const envToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (envToken) return envToken;
  try { return execFileSync('gh', ['auth', 'token'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return ''; }
}

if (process.platform !== 'linux') {
  fail('Execute a publicação pelo Linux. Para compilar o instalador Windows nativamente, use `npm run dist:windows` no Windows.');
} else if (!process.env.CI && !process.env.GITHUB_ACTIONS && require('node:child_process').spawnSync('wine', ['--version'], { stdio: 'ignore' }).status !== 0) {
  fail('Para gerar o instalador Windows a partir do CachyOS, instale Wine: `sudo pacman -S --needed wine`. Também é possível gerar o EXE nativamente com build-windows.ps1 no Windows.');
} else {
  let temporaryConfigWritten = false;
  try {
    const repository = getRepository();
    const token = getToken();
    if (!token) throw new Error('Não encontrei token do GitHub. Instale `github-cli` e execute `gh auth login`, ou defina GH_TOKEN.');
    const buildConfig = { ...(packageJson.build || {}) };
    buildConfig.publish = [{ provider: 'github', owner: repository.owner, repo: repository.repo, releaseType: 'release' }];
    packageJson.build = buildConfig;
    fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
    temporaryConfigWritten = true;

    console.log(`Publicando Azul Estudo v${packageJson.version} em ${repository.owner}/${repository.repo}`);
    console.log('Alvos: Linux AppImage + Windows NSIS.');
    const result = spawnSync('npx', ['electron-builder', '--linux', 'AppImage', '--win', 'nsis', '--publish', 'always'], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, GH_TOKEN: token }
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`electron-builder terminou com código ${result.status ?? 'desconhecido'}.`);
    console.log('\nBuilds publicados. O GitHub Release agora contém os instaladores e metadados usados pelo atualizador.');
  } catch (error) {
    fail(error.message || String(error));
  } finally {
    if (temporaryConfigWritten) fs.writeFileSync(packagePath, originalText, 'utf8');
  }
}
