# Verificação da versão 2.0.0

Data: 28 de outubro de 2026.

## Artefato publicado

- Arquivo: [`downloads/RaccoonStudio-2.0.0.apk`](../downloads/RaccoonStudio-2.0.0.apk).
- Application ID: `br.com.perabru.raccoonstudio`.
- Versão: 2.0.0; código: 2; Android mínimo: 8.0/API 26; target: API 35.
- Tamanho: **5,856,029 bytes**.
- SHA-256: `1edcb5661ee7dd3a261110d4dc3240abd683521463bb2483c3f158ad6a892823`.
- Assinatura: v2 e v3 verificadas; chave de debug externa ao repositório.

O APK em downloads é uma cópia byte a byte do build direto verificado.
O build Gradle também foi concluído, com sua própria assinatura de debug.

## Resultados

| Verificação | Resultado e alcance |
| --- | --- |
| Dependências | Cinco arquivos de fonte pública com versões, tamanho e SHA-256 conferidos |
| Download de dependências | Download limpo e verificação offline aprovados; adulterações de tamanho/hash recusadas |
| Build direto | `bash build.sh` aprovado: Java, DEX, recursos, bibliotecas, ZIP e assinatura |
| Android Studio / Gradle | `:app:assembleDebug` aprovado com Gradle 8.9, AGP 8.7.3 e JDK 17 |
| Permissões | Paridade entre os dois builds; sem Internet, armazenamento amplo ou localização aproximada |
| Conteúdo do APK | Os seis assets e os quatro arquivos Java correspondem aos hashes registrados no build |
| Bibliotecas nativas | 20 `.so` em quatro ABIs, iguais aos binários oficiais; alinhamento ELF/ZIP de 16 KiB verificado |
| Políticas do instalador | 534 assertions de limites, seleção de formatos, caminhos e nomes aceitos; execução em JVM, sem JNI |
| Interface | Chromium/Playwright: edição, catálogo persistente, exportação PNG/JSON, importação limitada, rótulos não interpretados como HTML e layouts entre 320 e 1024 px |
| Contrato da ponte | Entradas TEST ONLY: capacidades explícitas, resolução do PNG enviado, bloqueio de duplicatas, cancelamento, erro e confirmação de aplicação |
| Rádio Bluetooth físico | **Não executado** |
| Execução Android/JNI em celular ou emulador | **Não executada** |
| Aplicação visual no Watch 8 Ultra do usuário | **Não verificada** |

Um evento de progresso de bytes em 100% não produz sucesso na interface.
No serviço nativo, a operação só conclui após a resposta de ativação e nova
consulta que confirme o fundo associado ao mesmo mostrador. Esses caminhos
foram implementados e revisados; seus callbacks reais dependem do teste físico.

## Evidências reproduzíveis

- [Build, assinatura, assets, fontes e bibliotecas](validation/native-build.json).
- [Interface e contrato da ponte](validation/interface.json).
- [Build Gradle e comparação de permissões](validation/gradle.json).
- [Origem das dependências](../dependencies.lock.json).
- [Investigação e referências](INVESTIGACAO.md).

Avisos não bloqueantes do compilador: APIs Android mantidas para compatibilidade
com versões anteriores; Gradle recomenda gerir `extractNativeLibs` pelo DSL,
que também está configurado no projeto; o Gradle manteve as bibliotecas nativas
sem remover símbolos. O caminho de build direto conserva o atributo do manifesto
para empacotar as mesmas bibliotecas sem extração e sem compressão.

## Teste que depende do relógio

1. Selecionar no aparelho um mostrador de foto e liberar a conexão do MActive Pro.
2. Conectar pelo Raccoon Studio e aguardar as capacidades.
3. Registrar chipset, firmware, dimensões e resultado de autenticação no relatório.
4. Enviar o fundo e aguardar a confirmação.
5. Observar no relógio o fundo escolhido e a hora avançando pelo mostrador nativo.
6. Se o perfil não for aceito, exportar o diagnóstico para identificar a variante.

Nenhum arquivo de resultado apresentado aqui contém um teste físico fictício.
