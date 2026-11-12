# Azul Estudo 0.2.7

- Adicionado ajuste opcional de texto por bloco: reduz o tamanho renderizado quando o conteúdo ultrapassa a área interna, preservando o tamanho-base escolhido.
- Atualizado o ícone de aplicativo em PNG 512×512 e ICO multi-resolução; janela, favicon, AppImage e instalador NSIS usam os arquivos correspondentes.
- Configurados builds Linux AppImage e Windows NSIS, com scripts específicos para cada plataforma e build combinado.
- Adicionado fluxo de publicação no GitHub Releases que descobre owner/repo pelo `origin` ou `GH_REPO`, injeta temporariamente a configuração de updater e publica os dois formatos.
- Mantido `appId`, chave `azul-estudo-data-v1` e caminho de dados (`~/.config/azul-estudo` no Linux e `%APPDATA%/azul-estudo` no Windows).
- Adicionado teste de distribuição para ícones, alvos de build, atalhos e atualizador.
