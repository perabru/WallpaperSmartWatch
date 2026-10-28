# Raccoon Studio 2.3.0 · Landscape Edition

Editor Android de imagens e animações para mostradores, agora com a identidade visual do card de paisagem fornecido pelo usuário.

**[Baixar APK assinado 2.3.0](https://github.com/perabru/WallpaperSmartWatch/releases/download/v2.3.0/RaccoonStudio-2.3.0-assinado.apk)** · [Releases](https://github.com/perabru/WallpaperSmartWatch/releases) · [Nova identidade visual](docs/LANDSCAPE-2.3.md)

## Card e identidade visual

Céu rosa/dourado, sol branco, oceano e reflexos, morros e árvores em terracota/malva, base clara, cantos arredondados e sombra deslocada. A referência fornecida está integrada ao editor, não apenas usada como inspiração da paleta. As informações do card mostram a hora do celular, o formato e tamanho configurados para a imagem e o estado da conexão no app; não exibem clima fictício.

**Usar esta paisagem no mostrador** cria um fundo estático editável, sem horário congelado. **Escolher minha imagem** abre o seletor nativo. **Abrir editor** leva diretamente aos ajustes. O card e os controles são responsivos; a animação decorativa respeita movimento reduzido.

## Recursos preservados

Ajuste automático proporcional, preservação com fundo desfocado, zoom/posição/rotação manuais, desfazer/refazer, recorte de perspectiva por quatro cantos, formatos de tela, catálogo local e projetos JSON; importação JPG/PNG/WebP/GIF e formatos reconhecidos pelo Android; exportação PNG/JPG/WebP/GIF. A barra ECG é decorativa, não uma leitura de saúde. O processamento é local, sem conta e sem upload das fotos.

A tela Relógio consulta dispositivos conectados e pareados que o Android disponibiliza e distingue conexões BLE de chamadas/áudio. O nome comercial é uma pista, não uma confirmação de modelo ou protocolo. A consulta não reutiliza a sessão interna do MActive Pro. Se houver disputa pela conexão, desconecte-o temporariamente no outro aplicativo e tente novamente.

## Instalação e limites

Android 8+. A assinatura de distribuição é a mesma da release 2.1.0, permitindo atualizar essa instalação sem desinstalar. Os APKs de teste do Actions usam outra assinatura. Antes de qualquer desinstalação, exporte seus projetos: desinstalar remove o catálogo local.

**Não houve teste físico no Watch 8 Ultra do usuário nem execução nativa em um celular.** A integração JieLi continua enviando apenas fundo PNG estático após autenticação e confirmação de capacidades/resolução. Estar conectado no Android não confirma compatibilidade. A animação no card do celular não significa suporte a mostrador animado no relógio.

## Compilação e testes

```sh
python3 tools/fetch-dependencies.py
bash build.sh
bash tools/test-policies.sh
npm ci --ignore-scripts
npx playwright install chromium
npm test
```

JDK 17+, Android Platform 35 e Build-Tools 35.0.0. Configure ANDROID_SDK_ROOT e JAVA_HOME. Relatórios e capturas ficam em build/qa. A suíte verifica regras de transferência, geometria/GIF, persistência, importação/exportação, UI e tema Landscape em larguras de 320 a 1366 px. Os testes nativos da UI usam eventos TEST ONLY, não rádio Bluetooth real.

A composição original do card está em CSS com seletores isolados em landscape.css; landscape.js atualiza as informações e gera o fundo. studio.html/studio.js/studio-core.js mantêm o editor. ConnectedDeviceCatalog.java e device-list.js preservam a descoberta do Android. A chave privada de assinatura não faz parte do repositório.

## Créditos

A referência visual foi fornecida pelo usuário em card(1).txt; esse arquivo não informa autoria original. A paisagem e a composição foram adaptadas, com dados climáticos demonstrativos substituídos. Consulte THIRD_PARTY_NOTICES.md e licenses/ para os componentes restantes. O inventário é arte de fã; marcas e personagens pertencem aos respectivos titulares.
