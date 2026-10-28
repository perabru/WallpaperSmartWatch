# Raccoon Studio 2.2.0 — Relógio conectado e ajuste automático

## Encontrar o relógio
Abra **Relógio → Encontrar meu relógio conectado**. O app consulta dispositivos pareados e conexões BLE, de chamadas e de áudio disponibilizadas pelo Android. Destaca possíveis relógios, elimina duplicatas pelo mesmo endereço e lembra sua seleção. Toque em **Verificar** no dispositivo de dados.

Nome e classe são pistas, não confirmação do modelo ou protocolo. Uma conexão de chamadas não é uma conexão de transferência. Listar não reutiliza a sessão interna do MActive Pro, não desconecta outros apps e não envia comandos ao relógio. Se a lista do Android estiver incompleta, use **Buscar nas proximidades**. Se houver disputa pela conexão durante a verificação/envio, desconecte temporariamente o MActive Pro.

## Enquadramento automático
Ao importar, o app analisa proporções e detalhes localmente. Escolhe recorte proporcional ou imagem inteira com fundo desfocado, com margem para a máscara circular e correções leves de brilho/contraste. Não estica automaticamente. Prioridades: Equilibrado, Não cortar nada e Preencher a tela. Pode ser desativado ou desfeito; o arquivo da galeria não é modificado.

A resolução só é adotada como confirmada após a verificação do relógio. Alterações manuais de rotação, posição, zoom e cores são preservadas ao mudar as dimensões. Use o botão de ajuste automático para recalcular deliberadamente. O ajuste é heurístico, não reconhecimento semântico perfeito de todos os objetos: confira a prévia.

## Instalação
Android 8 ou superior. Mesma assinatura da release 2.1.0: permite atualizar essa instalação sem desinstalar. Builds de teste/versões com outras chaves podem não atualizar diretamente; exporte projetos antes de desinstalar.

## Limites e testes
A integração JieLi continua enviando apenas PNG estático após autenticação e validação de capacidades. Conectado ao Android não significa compatível. Não houve teste físico no Watch 8 Ultra nem execução nativa em celular nesta entrega; animação GIF no relógio não foi confirmada.

Compilação e testes passaram em https://github.com/perabru/WallpaperSmartWatch/actions/runs/40715398114 . Incluem 534 verificações de políticas, 249 verificações dos novos algoritmos, geometria/GIF e testes de interface em Chromium. Eventos Bluetooth dos testes são fictícios e identificados como TEST ONLY. APK v2/v3 verificado com o mesmo certificado 2.1.0.
