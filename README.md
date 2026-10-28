# WallpaperSmartWatch · Raccoon Studio 2.2 / Image Lab

Editor Android de imagens e animações para mostradores, com consulta de dispositivos já conectados e ajuste automático de imagens. Interface em português, processamento local, sem conta, anúncios ou envio de fotos a servidores.

**[Baixar APK assinado 2.2.0](https://github.com/perabru/WallpaperSmartWatch/releases/download/v2.2.0/RaccoonStudio-2.2.0-assinado.apk)** · [Releases](https://github.com/perabru/WallpaperSmartWatch/releases) · [Novidades e limites](docs/ATUALIZACAO-2.2.md) · [Manual do Image Lab](docs/IMAGE_LAB.md)

## Encontrar o relógio conectado

Abra **Relógio → Encontrar meu relógio conectado**, autorize Dispositivos próximos e selecione **Verificar** no provável relógio. A lista consulta BLE, chamadas/áudio e pareados disponibilizados pelo Android, elimina duplicatas por endereço e lembra sua escolha. A consulta não abre GATT nem envia comandos ao dispositivo.

Você pode manter o MActive Pro conectado para procurar o aparelho. A lista não reutiliza a sessão do outro aplicativo. Se houver disputa pela conexão durante a verificação ou o envio, desconecte-o temporariamente do MActive Pro. O canal de chamadas isolado não permite instalar imagens. Nomes e classes são pistas, não confirmação do modelo. Se o Android fornecer uma lista parcial, use **Buscar nas proximidades**.

## Ajustar a imagem automaticamente

Ao escolher uma imagem, o app usa uma análise local de detalhes e contraste para escolher enquadramento proporcional ou imagem inteira com fundo desfocado. Não usa esticamento automaticamente. No formato circular, o modo de preservação mantém a imagem dentro do círculo, com margem. Há prioridades Equilibrado, Não cortar nada e Preencher a tela. Use Desfazer para comparar ou desative o automático.

A resolução só é adotada como confirmada quando o relógio a informa após a verificação de compatibilidade. Até lá, é uma configuração manual. Edições manuais de rotação, zoom, posição e cor não são apagadas ao mudar a resolução; use o botão de ajuste para recalcular deliberadamente. O ajuste é heurístico, não reconhece a importância semântica de todos os objetos. Confira a prévia.

## Recursos preservados

Importação JPG/PNG/WebP/GIF; conversão nativa de outros formatos reconhecidos pelo Android; arrastar, pinça, rotação, espelhamento, desfazer/refazer; quatro cantos para correção de perspectiva; máscaras redonda, quadrada, retangular e arredondada; resolução de 64 a 2048 px; brilho, contraste, saturação, texto; catálogo local com projetos JSON; exportação PNG/JPG/WebP e GIF até 512 px por eixo; traçado ECG decorativo. Hora é apenas prévia, não fica congelada na imagem.

## Instalação e atualização

Android 8.0 ou superior. Baixe o APK da release e abra no celular. **Esta versão mantém a assinatura da release 2.1.0**, permitindo atualizar essa instalação sem desinstalar. Versões antigas e APKs de teste com outras chaves podem exigir reinstalação: exporte os projetos antes, pois desinstalar apaga o catálogo. A chave privada não é publicada no GitHub. O APK dos testes do GitHub Actions usa outra chave; instale o arquivo da release.

## Bluetooth: limite importante

O adaptador JieLi envia **fundo PNG estático** somente após confirmação do perfil, autenticação, capacidades e resolução. Não envia GIF animado nem compila um mostrador nativo arbitrário. Horas, data e sensores no relógio seguem o firmware.

**Não houve teste físico no Watch 8 Ultra do usuário nem teste de execução nativa em um celular nesta entrega.** Os testes de interface usam eventos TEST ONLY. Dispositivo conectado ao Android não equivale a compatível para transferência.

## Desenvolvimento e verificação

```sh
python3 tools/fetch-dependencies.py
bash build.sh
bash tools/test-policies.sh
npm ci --ignore-scripts
npx playwright install chromium
npm test
```

JDK 17+, Android Platform 35 e Build-Tools 35.0.0; configure ANDROID_SDK_ROOT e JAVA_HOME. Android Studio/Gradle também são suportados pelo projeto. Os relatórios ficam em build/qa. A [execução validada 2.2.0](https://github.com/perabru/WallpaperSmartWatch/actions/runs/40715398114) inclui testes de geometria/GIF, ajustes automáticos, importação/exportação, persistência, interface em larguras de 320 a 1024 px e contrato da ponte nativa. Não são testes de rádio Bluetooth.

ConnectedDeviceCatalog.java consulta as APIs públicas do Android. device-list.js agrupa e ordena dispositivos sem conceder compatibilidade. smart-fit.js implementa o ajuste local. O Image Lab permanece em studio.html/studio.js/studio-core.js. A integração de transmissão e o editor clássico foram preservados.

## Licenças e investigação

Consulte [INVESTIGACAO.md](docs/INVESTIGACAO.md), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) e licenses/. O inventário é arte de fã; marcas e personagens pertencem aos respectivos titulares.
