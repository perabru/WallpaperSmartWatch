# Componentes de terceiros

Este projeto utiliza os componentes abaixo. Os arquivos originais de licença
estão em `licenses/`. As versões, URLs e os hashes SHA-256 dos binários usados
na compilação estão em `dependencies.lock.json`.

Os binários são obtidos de fontes públicas dos respectivos projetos. Eles não
são extraídos do aplicativo MActivePro. O script `tools/fetch-dependencies.py`
baixa os arquivos para `app/libs` e confere seu tamanho e SHA-256; os binários
desse diretório não são versionados.

## Jieli Android JL Health SDK

Componentes utilizados:

| Componente | Versão | Finalidade |
| --- | --- | --- |
| JL Watch | 1.14.0_11307 | Operações de arquivos e mostradores em dispositivos compatíveis |
| JL RCSP | 0.8.0_705 | Protocolo RCSP, descoberta de capacidades e autenticação do dispositivo |
| BmpConvert | 1.6.0_10605 | Conversão da imagem para o formato do chip identificado |

Titular indicado na licença: **Copyright © 2015 ZhuHai JieLi Technology Co.,Ltd**.

Origem: [Jieli-Tech/Android-JL_Health](https://github.com/Jieli-Tech/Android-JL_Health),
commit `ba19b04e286dd116a4e8bae1779878404c1dad04`.

O repositório oficial declara a licença Apache License, Version 2.0. Foi
preservada uma cópia integral em [licenses/Jieli-Apache-2.0.txt](licenses/Jieli-Apache-2.0.txt),
obtida do [LICENSE desse commit](https://github.com/Jieli-Tech/Android-JL_Health/blob/ba19b04e286dd116a4e8bae1779878404c1dad04/LICENSE).
Não foram encontrados arquivos de licença ou de avisos adicionais dentro dos
três AARs selecionados. Os AARs e suas bibliotecas nativas não foram modificados.

O transporte Bluetooth deste aplicativo conecta as APIs públicas do SDK ao
Android. A documentação e os exemplos oficiais orientaram essa integração.
A presença desses componentes não significa endosso da Jieli ou compatibilidade
de todo relógio associado ao MActivePro.

## Gson

Componente: `com.google.code.gson:gson:2.13.1`.

Origem: [google/gson](https://github.com/google/gson/tree/gson-parent-2.13.1).
O POM publicado identifica **Copyright 2008 Google LLC**.

Licença: Apache License, Version 2.0; cópia integral em
[licenses/Gson-Apache-2.0.txt](licenses/Gson-Apache-2.0.txt), obtida do
[LICENSE da versão 2.13.1](https://github.com/google/gson/blob/gson-parent-2.13.1/LICENSE).

O SDK Jieli utiliza Gson em suas classes de arquivos e configuração. A versão
2.13.1 coincide com a dependência declarada pelo aplicativo de exemplo oficial
do SDK fixado neste projeto.

## Error Prone annotations

Componente: `com.google.errorprone:error_prone_annotations:2.38.0`.

Origem: [google/error-prone](https://github.com/google/error-prone/tree/v2.38.0).
Trata-se da dependência de anotações declarada pelo
[POM do Gson 2.13.1](https://repo.maven.apache.org/maven2/com/google/code/gson/gson/2.13.1/gson-2.13.1.pom).

Licença: Apache License, Version 2.0; cópia integral em
[licenses/Error-Prone-Apache-2.0.txt](licenses/Error-Prone-Apache-2.0.txt), obtida do
[COPYING da versão 2.38.0](https://github.com/google/error-prone/blob/v2.38.0/COPYING).

## Reprodução da compilação

Na raiz do projeto:

```sh
python3 tools/fetch-dependencies.py
python3 tools/fetch-dependencies.py --check
```

O segundo comando verifica os cinco arquivos sem acessar a rede. Uma divergência
de hash impede a aceitação do arquivo. Não são necessárias dependências AndroidX
para as três bibliotecas Jieli selecionadas; a interface deste aplicativo utiliza
as APIs nativas do Android.

Ao distribuir um APK que inclua esses componentes, acompanhe a distribuição com
estes avisos e com as cópias integrais das licenças. As licenças das dependências
aplicam-se aos respectivos componentes, independentemente da licença adotada
para o código próprio do aplicativo.

## Arte e ferramentas de desenvolvimento

A interface e os desenhos de painéis, inventário e indicadores são gerados
pelo código deste projeto. O retrato `jill-portrait.png` foi criado para o
projeto por geração de imagem; a proveniência e o prompt estão em
`ASSET_PROMPTS.txt`. Jill Valentine, Resident Evil e nomes associados pertencem
a seus respectivos titulares. Este projeto de fã não tem afiliação ou endosso
da Capcom, da Microwear ou da Jieli. A licença do código não concede direitos
sobre essas marcas e personagens.

O Gradle Wrapper e o Playwright são ferramentas de desenvolvimento sob
Apache-2.0, sem inclusão de seus executáveis no aplicativo. O wrapper segue
a distribuição Gradle 8.9 fixada por SHA-256. A dependência de desenvolvimento
Playwright está fixada no `package-lock.json`.
