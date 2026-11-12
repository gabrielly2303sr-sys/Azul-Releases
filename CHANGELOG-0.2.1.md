# Azul Estudo 0.2.1 — Compatibilidade do perfil

## Correção crítica

- No Linux, fixa explicitamente o diretório `userData` do Electron em `~/.config/azul-estudo` (via `app.getPath('appData')/azul-estudo`).
- A definição ocorre antes de `app.whenReady()`, garantindo que Local Storage, mídia e backups usem o mesmo diretório das versões anteriores.
- Mantém `appId`, `productName`, nome do pacote e chave `azul-estudo-data-v1`.

Esta versão não apaga, move nem sobrescreve a pasta antiga. Ela volta a apontar para ela.
