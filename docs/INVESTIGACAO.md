# Investigação: MActivePro, identificação do relógio e envio de imagens

Data de verificação: **28 de outubro de 2026**.

## Resultado técnico

Foi encontrada uma rota pública e documentada para integrar dispositivos da
família Jieli ao aplicativo: o SDK Android JL Health do próprio fabricante.
A ligação com MActivePro tem evidência concreta: a biblioteca nativa de conversão
de imagens `libjl_bmp_convert.so`, para `arm64-v8a`, é idêntica byte a byte no
MActivePro 2.0.3.03 e no BmpConvert 1.6.0 do repositório oficial Jieli.

Isso confirma o uso desse componente na versão examinada do aplicativo.
**Ainda não identifica o chip, a resolução ou a compatibilidade do relógio
físico do usuário.** Um aplicativo pode atender várias famílias de dispositivos.
O envio exige que o dispositivo conectado complete a autenticação, informe
capacidades compatíveis e exponha um mostrador que aceite fundo personalizado.

Não foi realizada uma transferência no relógio físico durante esta investigação.
Compilar o APK e validar suas dependências não substitui esse teste.

## 1. Identificação pelas fotos e pelo anúncio

As fotos fornecidas pelo proprietário mostram uma tela circular dentro de uma
caixa prateada de formato aproximadamente quadrado, com pulseira laranja. A
traseira apresenta inscrições genéricas, incluindo `IP68`, `ROHS`, `HEART RATE`
e `BLUETOOTH CALL`. Não foi possível ler um número inequívoco de modelo, chip ou
resolução nessas imagens. As fotos pessoais não integram este repositório.

O link curto da Shopee foi resolvido para os identificadores públicos:

| Dado | Resultado observado |
| --- | --- |
| Loja | `1602843282` |
| Item | `58256989375` |
| URL canônica | <https://shopee.com.br/product/1602843282/58256989375> |

A página pública retornou uma estrutura de aplicação sem descrição de produto
legível no HTML obtido. Uma consulta anônima ao endpoint de item retornou HTTP
403; a investigação parou nesse ponto, sem login nem tentativa de contornar o
bloqueio. Portanto, o anúncio não confirmou um modelo comercial ou especificação.

`Watch8 Ultra`, informado na conversa, permanece uma designação comercial
relatada. Não foi associado automaticamente a fichas de relógios de formato
Apple Watch, nem a modelos apenas visualmente semelhantes. Nenhuma resolução
fixa foi adotada com base em anúncio de outro aparelho.

## 2. Proveniência do aplicativo analisado

A cadeia pública de download foi:

1. [Página de download da Microwear](https://download.microwear.com/mactiveapk.html).
2. [Página Tencent para o pacote com.njj.mactivepro](https://a.app.qq.com/o/simple.jsp?pkgname=com.njj.mactivepro).
3. [APK servido pelo domínio da Tencent](https://imtt.dd.qq.com/sjy.00022/sjy.00004/16891/apk/39A6C7A9E9A2B250E0D9BA021E34CEFD.apk?fsname=com.njj.mactivepro_2.0.3.03.apk).

| Propriedade | Valor verificado |
| --- | --- |
| Pacote | `com.njj.mactivepro` |
| Versão anunciada e arquivo obtido | `2.0.3.03` |
| Tamanho | `313907662` bytes |
| SHA-256 do APK | `cdb3ddb13561fa49f72d3cd91891057edfc33ccbac95ec874e0dc36abdccece3` |
| MD5 do APK, coincidente com a página de origem | `39a6c7a9e9a2b250e0d9ba021e34cefd` |

O APK foi inspecionado como arquivo, sem instalação ou execução. O pacote contém
proteção de código; não foi tentada sua remoção. O APK, seus arquivos extraídos
e código decompilado não são distribuídos neste projeto.

### Correlação com o SDK público

A comparação abaixo usa exclusivamente a arquitetura `arm64-v8a` de cada
arquivo. O hash da biblioteca idêntica é:

```text
libjl_bmp_convert.so
379360 bytes
SHA-256: 70c859271d153093b379356102ae32257f5ea36558b9775756660db21958a5f4
```

| Biblioteca no APK | Biblioteca pública comparada | Resultado |
| --- | --- | --- |
| `libjl_bmp_convert.so` | BmpConvert 1.6.0_10605 | Idêntica byte a byte |
| `libjl_fatfs.so` | JL Watch 1.14.0_11307 | Bytes diferentes |
| `libjl_pack_format.so` | JL Watch 1.14.0_11307 | Bytes diferentes |
| `libjl_auth.so` | JL RCSP 0.8.0_705 | Bytes diferentes |
| `libjl_crc.so` | JL RCSP 0.8.0_705 | Bytes diferentes |

Os hashes completos dessas comparações estão em
[`evidence/jieli-native-hashes.json`](evidence/jieli-native-hashes.json).
Bytes diferentes não permitem concluir, por si só, qual versão ou configuração
foi usada pelo MActivePro. Não se presume equivalência completa do protocolo
nem compatibilidade de todos os firmwares.

## 3. SDK oficial e dependências fixadas

Fonte primária: [Jieli-Tech/Android-JL_Health](https://github.com/Jieli-Tech/Android-JL_Health).
A organização GitHub Jieli-Tech é identificada como fabricante Zhuhai Jieli
Technology; o GitHub verifica o domínio `zh-jieli.com` da organização.

Todos os arquivos Jieli deste projeto usam o commit imutável
`ba19b04e286dd116a4e8bae1779878404c1dad04`.

| Dependência | Utilização |
| --- | --- |
| `JL_Watch_V1.14.0_11307-release.aar` | `WatchOpImpl`, operações de mostradores e sistema de arquivos |
| `jl_rcsp_V0.8.0_705-release.aar` | RCSP, `RcspAuth`, informações e comandos do dispositivo |
| `BmpConvert_V1.6.0_10605-release.aar` | Conversão oficial da imagem |
| `gson-2.13.1.jar` | Serialização usada internamente pelo SDK Watch |
| `error_prone_annotations-2.38.0.jar` | Dependência declarada pelo POM do Gson |

Uma inspeção estática das classes das três bibliotecas Jieli encontrou Gson como
dependência externa ao Android; não encontrou referências a AndroidX ou
`android.support`. O projeto utiliza transporte BLE próprio e não requer a
biblioteca de conexão ou a biblioteca de atualização OTA do exemplo completo.

O [build.gradle oficial do aplicativo de exemplo](https://github.com/Jieli-Tech/Android-JL_Health/blob/ba19b04e286dd116a4e8bae1779878404c1dad04/code/tool/WatchTestTool_V0.9.0_SDK_V1.14.0/app/build.gradle)
declara Gson 2.13.1. Seu
[POM publicado](https://repo.maven.apache.org/maven2/com/google/code/gson/gson/2.13.1/gson-2.13.1.pom)
declara Error Prone annotations 2.38.0. As dependências de interface presentes
no aplicativo de exemplo inteiro não são requisitos automáticos do núcleo SDK.

Os hashes e URLs estão em [`../dependencies.lock.json`](../dependencies.lock.json).
O script [`../tools/fetch-dependencies.py`](../tools/fetch-dependencies.py) valida
tamanho e SHA-256 antes de instalar cada download no cache local. A opção
`--check` valida o cache sem rede. As licenças e fontes dos avisos estão em
[`../THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).

## 4. Caminho de conexão e envio documentado

O SDK expõe uma interface de transporte: uma implementação de `WatchOpImpl`
fornece `getConnectedDevice()` e `sendDataToDevice(...)`, e recebe os eventos de
conexão e bytes através de `notifyBtDeviceConnection(...)` e
`notifyReceiveDeviceData(...)`. O transporte BLE precisa serializar as operações
GATT e entregar as notificações ao SDK correto.

O exemplo oficial usa `RcspAuth` antes de inicializar RCSP. A notificação de
autenticação bem-sucedida permite passar à inicialização. Uma autenticação
recusada é uma falha de conexão; não há tentativa de ignorá-la.

A sequência documentada relevante é:

1. Conectar ao serviço compatível, configurar notificações e completar a
   autenticação `RcspAuth`.
2. Aguardar `onRcspInit(..., true)` e `onWatchSystemInit(0)`.
3. Obter as informações reais do dispositivo e `ExternalFlashMsgResponse`.
   `getScreenWidth()` e `getScreenHeight()` fornecem a resolução anunciada pelo
   relógio. O método `getExternalFlashMsg(...)` do exemplo é um wrapper de
   `mStatusManager.getExtFlashMsg(...)`.
4. Consultar o mostrador atual com `getCurrentWatchInfo(...)` e sua capacidade de
   fundo por `getCustomWatchBgInfo(...)`. Confirmar o tipo de chip/codificador
   e dimensões antes de preparar o arquivo.
5. Converter a imagem com `BmpConvert.bitmapConvert(...)`. O exemplo escolhe
   RGB/ARGB de acordo com `DeviceInfo.getSdkType()` e as opções de
   `WatchConfigure`. A capacidade de informações extras do dial não significa
   suporte a qualquer layout arbitrário.
6. Transferir pelo sistema de arquivos do SDK. A API pública é
   `createWatchFile(...)`; `addFatFile(...)` é um wrapper do aplicativo de exemplo.
   Seus callbacks informam progresso e conclusão da operação.
7. Aplicar o fundo com `enableCustomWatchBg(...)` e consultar o resultado no
   dispositivo. Concluir apenas o envio dos bytes não confirma a seleção visual.

Fontes primárias de implementação:

- [BluetoothHelper.java: conexão e autenticação](https://github.com/Jieli-Tech/Android-JL_Health/blob/ba19b04e286dd116a4e8bae1779878404c1dad04/code/tool/WatchTestTool_V0.9.0_SDK_V1.14.0/app/src/main/java/com/jieli/watchtesttool/tool/bluetooth/BluetoothHelper.java).
- [WatchManager.java: adaptação do SDK e eventos](https://github.com/Jieli-Tech/Android-JL_Health/blob/ba19b04e286dd116a4e8bae1779878404c1dad04/code/tool/WatchTestTool_V0.9.0_SDK_V1.14.0/app/src/main/java/com/jieli/watchtesttool/tool/watch/WatchManager.java).
- [CustomDialManager.java: conversão e aplicação de fundo](https://github.com/Jieli-Tech/Android-JL_Health/blob/ba19b04e286dd116a4e8bae1779878404c1dad04/code/app/HealthAide_V1.1.0_SDK_V1.14.0/app/src/main/java/com/jieli/healthaide/tool/customdial/CustomDialManager.java).

O diagnóstico GATT padrão lê identidade, bateria e estrutura de serviços.
A inicialização do SDK, por sua vez, envia mensagens de autenticação e consultas
de protocolo. Na versão RCSP 0.8.0 examinada, `RcspOpImpl.updateSysTime(...)`
também sincroniza a hora do celular quando o dispositivo anuncia RTC habilitado.
Esse comportamento foi confirmado por inspeção estática da biblioteca pública
do SDK. A sondagem não deve ser descrita como uma operação puramente de leitura
GATT; o relatório registra `readOnly: false` quando o adaptador é tentado.
O envio de uma imagem é uma ação separada, escolhida pelo usuário.

## 5. Limites da funcionalidade

**Fundo personalizado:** a rota documentada transforma uma imagem no formato
aceito pelo relógio e a aplica em um mostrador compatível. A hora e os demais
elementos dinâmicos continuam sob o controle do mostrador e do firmware.

**Mostrador dinâmico completo:** desenhar hora, data e indicadores na prévia do
editor não gera automaticamente um pacote de mostrador executável. Não foi
localizada, nesta investigação, uma API pública suficiente para impor posições,
fontes e campos arbitrários ao mostrador do aparelho em questão. Exportar uma
imagem contendo uma hora desenhada produziria uma hora estática; por isso esse
conteúdo não deve ser apresentado como a hora funcional do relógio.

**Catálogo próprio:** um aplicativo independente pode organizar os projetos e
imagens de seu próprio catálogo. Isso não publica os itens na loja interna do
MActivePro. Não foi encontrada, nas fontes examinadas, uma API pública de
publicação de terceiros nessa loja.

**Firmware e recursos:** este caminho não exige reinstalar firmware, restaurar o
sistema de arquivos ou atualizar recursos do relógio. Erros que peçam essas
operações devem ser apresentados ao usuário, sem executar recuperação automática.

## 6. O que falta confirmar no dispositivo

O teste no relógio deve produzir: identificação reportada pelo firmware,
resultado da autenticação RCSP, tipo de chip anunciado, dimensões de tela,
capacidade de fundo do mostrador selecionado, progresso real da transferência
e confirmação de aplicação. Se qualquer um dos requisitos não for atendido,
o relatório técnico deve registrar a falha e a transferência deve permanecer
indisponível para aquela conexão.

Essas verificações são específicas da unidade e do firmware conectados. Os
dados públicos já encontrados justificam implementar a integração com o SDK
oficial; eles não justificam declarar o modelo do relógio ou sucesso de envio
antes desse teste.

## 7. Revisão das bibliotecas nativas

Os três AARs selecionados contêm cinco bibliotecas nativas em cada uma das
arquiteturas `arm64-v8a`, `armeabi-v7a`, `x86` e `x86_64`: vinte arquivos `.so`
no total. Todos os segmentos ELF `LOAD` examinados têm alinhamento `0x4000`
(16 KiB). A disposição de `GNU_RELRO` também foi examinada: quando o fim não
coincide com um múltiplo de 16 KiB, o segmento contém somente RELRO e a próxima
região gravável ocupa outra página, conforme a exceção documentada no
[guia oficial do Android sobre páginas de 16 KB](https://developer.android.com/guide/practices/page-sizes).

As dependências nativas `DT_NEEDED` são somente bibliotecas do sistema Android:
`libc.so`, `libm.so`, `libdl.so`, `liblog.so` e `libandroid.so`. Não há referência
a uma `libc++_shared.so` externa ausente. Os manifests dos AARs não declaram
`Application`, serviço ou provider que precise ser inicializado pelo aplicativo.

Essas verificações estáticas eliminam causas específicas de falha de carga,
mas não constituem teste de execução JNI. O ambiente de desenvolvimento desta
investigação não possui ADB, emulador, imagem Android, KVM ou dispositivo USB
disponível; não foi realizado um teste Android de abertura, conexão ou conversão
nativa. O empacotamento do APK precisa, ainda, preservar o alinhamento ZIP e as
arquiteturas corretas em cada compilação distribuída.
