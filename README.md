# WallpaperSmartWatch · Raccoon Studio 2.1 / Image Lab

Editor Android de imagens e animações para mostradores. Interface em português, processamento local, sem conta, anúncios ou envio de fotos a servidores.

**[Baixar APK assinado 2.1.0](https://github.com/perabru/WallpaperSmartWatch/releases/download/v2.1.0/RaccoonStudio-2.1.0-assinado.apk)** · [Releases](https://github.com/perabru/WallpaperSmartWatch/releases) · [Manual do Image Lab](docs/IMAGE_LAB.md)

## O que mudou

- Importe JPG, PNG, WebP e GIF. O seletor nativo converte outros formatos reconhecidos pelo Android, inclusive HEIC em aparelhos compatíveis.
- Arraste, amplie com dois dedos, gire, espelhe, centralize e desfaça/refaça alterações.
- Preencha recortando, mantenha a imagem inteira, use fundo desfocado ou estique livremente.
- Corrija uma foto em perspectiva escolhendo os quatro cantos da tela.
- Escolha máscara circular, quadrada, retangular ou arredondada e resolução de 64 a 2048 px.
- Ajuste brilho, contraste, saturação, fundo e texto. Hora é apenas prévia, não fica congelada no PNG.
- Anime um traçado ECG decorativo; importe e ajuste GIFs. Exporte PNG, JPG, WebP ou GIF (até 512 px por eixo).
- Salve projetos completos no catálogo local (IndexedDB), com imagem e ajustes. Faça backup em JSON portátil.
- O editor clássico e a integração JieLi foram preservados. A tela principal agora é o Image Lab.

## Instalação e atualização

Android 8.0 ou superior. Baixe o APK da release e abra no celular. Autorize a instalação para o navegador/gerenciador usado.

**A assinatura desta release 2.1.0 é nova.** A chave privada das versões antigas não estava no repositório. Antes de remover uma versão anterior, exporte seus projetos. Se o Android recusar a atualização por assinatura diferente, desinstale a versão antiga e instale esta. Desinstalar apaga o catálogo local. A chave privada da release não é publicada no GitHub.

O APK de GitHub Actions é assinado para testes com outra chave. Use a release para a instalação distribuída. A release contém o APK verificado e seu SHA-256.

## Bluetooth: limite importante

O adaptador real envia **um fundo PNG estático** somente depois de o relógio confirmar perfil JieLi, autenticação, capacidades e resolução. Ele não envia GIF animado nem compila um mostrador binário arbitrário. Exportar um GIF não prova que o firmware o aceita. A posição da hora, a data e sensores no relógio continuam sob controle do firmware.

A compatibilidade física da unidade Watch 8 Ultra do usuário **não foi testada**. Os testes de interface usam eventos marcados TEST ONLY; não substituem um teste no relógio. Não há progresso simulado de envio real.

## Desenvolvimento e verificação

```sh
python3 tools/fetch-dependencies.py
bash build.sh
bash tools/test-policies.sh
npm ci --ignore-scripts
npx playwright install chromium
npm test
```

Requer JDK 17+, Android Platform 35 e Build-Tools 35.0.0. Configure `ANDROID_SDK_ROOT` e `JAVA_HOME`. Também é possível abrir no Android Studio com Gradle.

Os relatórios e imagens de teste são gerados em `build/qa/`. A suíte verifica geometria, codec GIF, exportações, persistência do catálogo, recorte, layouts de 320 a 1024 px e o contrato da ponte nativa. Leia a execução do CI para o resultado efetivo de cada commit.

### Organização da versão 2.1

`studio.html`, `studio.css`, `studio.js` e `studio-core.js` formam o Image Lab. `MainActivity.java` oferece seleção nativa, conversão limitada em memória, salvamento e acesso à integração Bluetooth. `face.js` e o editor anterior permanecem disponíveis em Ajuda → Editor clássico.


## Integração Bluetooth e licenças

Consulte [INVESTIGACAO.md](docs/INVESTIGACAO.md) para fontes, hashes e limites do protocolo JieLi; [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) e `licenses/` para licenças. O inventário é arte de fã; marcas e personagens pertencem aos respectivos titulares.
