# Azul Estudo

Aplicativo desktop de estudos para Linux e Windows, com interface azul-clara inspirada em superfícies de vidro (Liquid Glass), armazenamento local e atualização automática por GitHub Releases.

## O que já funciona nesta versão

- **Matérias personalizáveis:** nome, descrição, cor, fonte e banner por URL ou imagem importada do computador (cópia local).
- **Assuntos por matéria:** anotações, relevância e nível de domínio (ainda não estudei, aprendendo, revisar ou já domino).
- **Mapas mentais:** canvas virtualmente infinito, coordenadas independentes da janela, blocos de texto formatáveis, stickers, imagens por URL ou arquivo local, conexões curvas que acompanham os blocos, redimensionamento, seleção múltipla, copiar/colar e desfazer/refazer.
- **Rotina:** tarefas do dia e hábitos diários que concedem XP ao serem concluídos.
- **Pomodoro:** tempos de estudo e pausa configuráveis, pausar, reiniciar, pular etapa, efeitos sonoros e notificações de conclusão.
- **Ranks:** Bronze, Prata, Ouro, Diamante, Rubi e Netherite.
- **Liquid Glass:** superfícies translúcidas com refração visual simulada por blur, saturação, reflexos, bordas e sombras, com temas Claro, Escuro e Meia-noite.
- **Perfil:** nome e foto personalizáveis, tempo de estudo, sessões, dias ativos e matérias com mais anotações.
- **Tempo de estudo:** contador do Pomodoro que considera atividade recente e pausa o registro após cinco minutos sem interação.
- **Mapas personalizáveis:** redimensionamento pelas quatro bordas e quatro cantos, slider de fonte direto na barra (9–144 px, com passos de 2 px e valor exato), imagens que acompanham o tamanho do bloco e podem ser inseridas sem legenda, cores com amostras visíveis e códigos hexadecimais, formas, fontes, sombras e conexões; stickers no estilo Post-it.
- **Presets de mapa:** modelos prontos para texto, Post-its e imagens; salve estilos próprios, aplique em blocos existentes e defina um padrão para novas criações. A paleta geral permite escolher uma cor-base, deriva cores de apoio e complementares e calcula automaticamente texto preto ou branco para maximizar o contraste em cada amostra.
- **Dados locais:** o conteúdo permanece no armazenamento local do aplicativo. Há backup JSON, importação manual e migração versionada com cópia de segurança antes de atualizar o formato.
- **Ajuste de texto:** cada bloco pode reduzir automaticamente o tamanho renderizado para caber dentro de sua área, sem sobrescrever o tamanho-base que você escolheu.
- **Distribuição:** AppImage para Linux e instalador NSIS para Windows, ambos com ícone próprio. O atualizador consulta GitHub Releases, baixa a versão compatível com o sistema e permite reiniciar para instalar.

## Canvas infinito e atalhos

O mapa mental usa coordenadas de mundo independentes do tamanho da janela. A câmera (posição e zoom) e a grade são persistidas por assunto. Use **Espaço + botão esquerdo** ou **botão do meio** para mover o canvas; use a roda para navegar e **Ctrl + roda** para aproximar/afastar na posição do cursor. A barra do mapa também oferece zoom, 100%, enquadrar conteúdo e grade.

Clique em um bloco para selecioná-lo; use **Shift + clique** ou **Ctrl/Cmd + clique** para selecionar vários. Em **Estilo e tamanho → Tipografia**, ative **Ajustar texto automaticamente** para reduzir a fonte renderizada quando o texto ultrapassar a área interna; o valor que você escolheu continua salvo e volta a ser usado quando houver espaço. Arraste os blocos para movê-los; passe o mouse sobre qualquer borda ou canto até o cursor de redimensionamento aparecer e arraste para ajustar altura, largura ou ambas. O controle A− / slider / número / A+ na barra altera rapidamente o tamanho do texto do bloco selecionado. Blocos de imagem não exigem legenda e a imagem ocupa a área interna inteira, acompanhando o redimensionamento do próprio bloco. Selecione um trecho no editor e use **B**, *I*, sublinhado ou marca-texto na barra para formatá-lo. Atalhos: **Ctrl/Cmd + Z**, **Ctrl/Cmd + Shift + Z**, **Ctrl/Cmd + C** e **Ctrl/Cmd + V**.

O botão **Presets** abre a biblioteca de modelos: aplique um estilo ao bloco selecionado, defina um padrão para novos textos, Post-its ou imagens e salve sua própria aparência como preset. A aba **Estilo e tamanho** organiza cores, bordas, tipografia e dimensões em grupos, com prévia ao vivo e amostras de cor visíveis com seus códigos hexadecimais. Em Configurações, a paleta geral deriva tons compatíveis a partir de uma cor-base.

As linhas de conexão são curvas SVG em coordenadas do mundo e são atualizadas ao mover ou redimensionar os blocos. Conexões e elementos são salvos junto com a câmera do mapa.

## Compatibilidade e migração de dados

No Linux, o Electron é configurado explicitamente para usar `~/.config/azul-estudo`, que é o diretório de dados das versões anteriores. Assim, a nova versão reutiliza o mesmo `Local Storage/leveldb` e não cria um perfil separado pelo nome exibido do produto. O caminho é definido antes da inicialização da janela.

O formato ativo continua usando a chave `localStorage` `azul-estudo-data-v1`; as migrações anteriores adicionaram perfil, estatísticas de estudo e preferências visuais sem remover o formato anterior; o `appId` `dev.azulestudo.desktop`, o `productName` e o perfil `userData` do Electron foram mantidos. A migração atual (v7) preserva IDs, matérias, assuntos, tarefas, hábitos, XP, datas de atividade, configurações, conteúdo, conexões e coordenadas já existentes. As coordenadas percentuais da folha antiga são convertidas uma única vez para coordenadas do canvas. Perfil, estatísticas, preferências visuais, biblioteca de presets e cor-base da paleta global são adicionados com valores padrão quando ainda não existem; IDs, posições, tamanhos e conexões dos mapas existentes permanecem preservados.

Antes de gravar o formato novo, o aplicativo cria uma cópia JSON no `localStorage` e tenta criar outra em `userData/backups/migration`. Banners e imagens importados pelo seletor nativo são copiados para `userData/media`, não ficam dependentes do arquivo original. Backups JSON antigos podem ser importados em **Configurações → Importar JSON**. Se os dados encontrados estiverem ilegíveis ou não tiverem uma estrutura reconhecida, o app protege o conteúdo e não o substitui automaticamente.

A validação da migração v7 e dos recursos de edição do mapa pode ser executada com `npm test`; ela verifica preservação de IDs, tarefas, XP, configurações, conexões, conversão de coordenadas, autoajuste tipográfico e idempotência.

## O que o modo Intenso realmente consegue fazer

O modo Intenso verifica alguns processos conhecidos que costumam distrair e avisa quando os encontra. Os atalhos dentro do app abrem Firefox, Spotify e WhatsApp/WhatsApp Web.

**Ele ainda não consegue impedir globalmente que o usuário abra qualquer outro programa.** Isso exigiria integração específica com o ambiente gráfico e políticas do sistema, e o comportamento muda entre KDE/GNOME, X11/Wayland e distribuições. O projeto não mata processos automaticamente nem altera permissões do sistema. Essa limitação é intencional nesta versão para evitar fechar um programa com trabalho não salvo ou afetar componentes essenciais do desktop.

## Executar em desenvolvimento

Requisitos: Node.js 20 ou mais recente e npm.

```bash
cd azul-estudo
npm install
npm start
```

## Gerar aplicativos para Linux e Windows

Requisitos: Node.js 20+, npm e conexão com a internet para baixar as dependências e os runtimes de build.

No CachyOS / Arch Linux, para gerar apenas o AppImage:

```bash
npm install
npm run dist:linux
```

O arquivo aparece em `release/`. Para gerar os dois formatos no Linux, use `npm run dist:all` (instale Wine com `sudo pacman -S --needed wine`). No Windows, abra PowerShell na pasta do projeto e execute `./build-windows.ps1`. O instalador `.exe` aparece em `release/`. Para executar o AppImage:

```bash
chmod +x release/*.AppImage
./release/*.AppImage
```

Em algumas distribuições, o runtime AppImage requer FUSE 2. Exemplos: `fuse2` no Arch/CachyOS, `libfuse2` em versões compatíveis do Ubuntu/Debian ou `fuse-libs` no Fedora. Os nomes e a disponibilidade variam por versão da distribuição.

### Nota sobre a compilação neste pacote

Este diretório contém código-fonte e configuração do empacotador; os binários precisam ser construídos nos sistemas de destino ou em um ambiente de build compatível. O ZIP do código-fonte não inclui um AppImage ou instalador EXE pré-compilado.

## Estrutura

```text
azul-estudo/
├── assets/                 # Ícones PNG e ICO de distribuição
├── src/
│   ├── assets/             # PNG e ICO para janela/favicon
│   ├── main.js             # Processo principal Electron e integrações Linux
│   ├── preload.js          # Ponte IPC segura
│   ├── index.html          # Estrutura da interface
│   ├── styles.css          # Interface e animações
│   └── app.js              # Matérias, tarefas, mapa mental e Pomodoro
├── scripts/                # Publicação no GitHub Releases
├── tests/                  # Testes de migração, editor e distribuição
├── build-appimage.sh       # Build AppImage no Linux
├── build-all-linux.sh     # Build AppImage + NSIS no Linux
├── build-windows.ps1      # Build NSIS no Windows
├── package.json
└── README.md
```

## Privacidade e segurança

- Sem conta, telemetria ou servidor remoto.
- Os dados do app são gravados no armazenamento local do Electron.
- Imagens de banner e imagem dos mapas são carregadas por URL quando fornecidas.
- O app não altera configurações do navegador ou do sistema operacional.

## Próximas melhorias sugeridas

- Persistência com banco SQLite e migrações versionadas.
- Reordenação de matérias/assuntos e refinamento adicional do editor.
- Detecção de processos configurável pelo usuário e integração opcional por desktop (X11/Wayland).
- Estatísticas semanais, calendário de revisão e repetição espaçada.
- Empacotamento/assinatura automatizados para x86_64 e ARM64.

### Publicar uma versão no GitHub Releases

1. Crie um repositório no GitHub e configure-o como `origin` no clone local.
2. Instale GitHub CLI e autentique com `gh auth login`.
3. Execute os comandos na raiz do projeto:

```bash
npm install
npm test
git add .
git commit -m "Azul Estudo v0.2.7"
git push origin main
npm run publish:github
```

O script descobre `owner/repo` pelo `origin` (ou aceita `GH_REPO=owner/repo`), obtém o token do `gh auth token` e publica AppImage + instalador NSIS no GitHub Release. A configuração de publicação é inserida temporariamente no build e o `package.json` original é restaurado ao final. Depois que a Release pública estiver disponível, o AppImage e o EXE instalados conseguem verificar atualizações automaticamente. Builds locais que não foram publicados não têm um feed de atualização configurado.

No CachyOS / Arch, os requisitos do AppImage e da publicação podem ser instalados com:

```bash
sudo pacman -S --needed nodejs npm fuse2 git github-cli wine
```

A primeira compilação precisa de conexão para baixar Electron e as dependências do npm.
