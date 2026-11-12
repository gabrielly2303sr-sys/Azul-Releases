# Azul Estudo 0.2.0 — Liquid Glass

## Implementado

- Superfícies translúcidas com blur e saturação, reflexos sutis, bordas claras e sombras em camadas.
- Temas Claro, Escuro e Meia-noite; opção de contraste automático e ajustes manuais de fundo, texto e destaque.
- Tipografia configurável com prévia no aplicativo, nas matérias e nos blocos do mapa mental.
- Perfil com nome e avatar editáveis, estatísticas, tempo registrado, sessões, dias ativos e matérias com mais palavras anotadas.
- Contador de estudo ligado ao Pomodoro: contabiliza apenas enquanto há interação recente e deixa de somar após cinco minutos sem atividade.
- Estilo individual para blocos do mapa, opções de conexões, marcadores com sete cores e stickers com aparência de Post-it.
- Removidos a pasta, o empacotamento, a comunicação IPC e a interface da extensão do Firefox. O atalho normal para abrir o Firefox permanece disponível.
- Migração de dados v3 preserva a chave de armazenamento e o identificador de aplicativo existentes, criando backup antes de persistir o novo formato.

## Validação

- `node --check` nos processos principais e no código da interface.
- `npm test`: migração, backup, preservação dos dados/conexões/estilos e idempotência.
- `package.json` validado como JSON.

## Limitação conhecida

A distorção óptica física (deslocamento real de pixels como uma lente) exibida na primeira referência não é oferecida por CSS padrão no Chromium. A interface usa blur, saturação, transparência, reflexos e profundidade para reproduzir o acabamento de vidro fosco sem depender de filtros experimentais instáveis.

Este ZIP contém código-fonte, não um AppImage pré-compilado. Gere o AppImage em Linux com `./build-appimage.sh`.
