# Raccoon Studio 2.2.0 — Dispositivos conectados e ajuste automático

## Encontrar o relógio

A tela Relógio agora consulta primeiro as listas públicas do Android: conexões GATT/GATT_SERVER, perfis de chamadas (HEADSET) e áudio (A2DP), e dispositivos pareados. A consulta não inicia transferência, não força pareamento e não necessita de GPS. No Android 12+, requer Dispositivos próximos (BLUETOOTH_CONNECT). A busca por dispositivos próximos continua separada e mantém os requisitos de localização do Android 11 e anteriores.

A lista combina resultados sem duplicar o mesmo endereço. Indica conectado, pareado, origem BLE/áudio e possível relógio. Nomes como Watch/Ultra e a classe de dispositivo são pistas, não confirmação do modelo ou protocolo. O usuário escolhe Verificar; não há conexão ou escrita automática em dispositivos desconhecidos. O último aparelho escolhido é lembrado apenas como preferência local. Nenhuma lista permite identificar qual aplicativo mantém uma conexão.

É possível listar conexões existentes com o MActive Pro ativo. Isso não reutiliza a sessão do MActive Pro nem comprova acesso simultâneo ao protocolo de mostradores. Se a autenticação ou transferência estiver ocupada, desconecte-o temporariamente no outro app. O canal de chamadas isolado não instala imagens. A compatibilidade depende das verificações JieLi preexistentes.

## Ajustar a imagem

Ao importar uma imagem, o modo automático analisa uma miniatura local: contrastes, bordas e distribuição de detalhes. Escolhe enquadramento proporcional ou preservação da imagem com fundo desfocado, com correções leves de brilho e contraste. Não gera conteúdo, não faz reconhecimento de identidade e não envia a imagem à internet. Não é uma garantia de identificar o assunto principal em todas as fotos.

A prioridade pode ser Equilibrado, Não cortar nada, ou Preencher a tela. No modo de preservação, os quatro cantos ficam dentro da máscara circular, evitando cortes que ocorreriam ao encaixar apenas na caixa quadrada. O usuário pode desativar o automático, desfazer/refazer e continuar o ajuste manual. A imagem de origem não é sobrescrita. Projetos importados e rascunhos restaurados preservam os ajustes gravados.

A resolução informada por uma sessão compatível pode ser aplicada automaticamente. Não se deduz resolução somente pelo nome comercial ou pela lista de dispositivos. O formato escolhido pelo usuário é preservado quando possível; a consulta básica do Android não informa a geometria da tela. Para fotos do relógio com carcaça e perspectiva, permanece disponível o recorte manual por quatro cantos.

PNG/JPG/WebP/GIF, catálogo e edição anteriores são preservados. O transporte nativo continua enviando somente PNG estático para um mostrador de fotos compatível. GIF exportado não equivale a um mostrador animado nativo.

## Verificação

249 verificações de geometria/classificação; regressões do editor, do codec GIF e das políticas de transferência; novos testes de contrato UI/nativo. As listas e eventos de Bluetooth dos testes são marcados TEST ONLY. O APK compila para Android 8+, mas não houve teste físico no celular/relógio do usuário. A assinatura de distribuição é a mesma da versão 2.1.0.

## Fontes técnicas

- https://developer.android.com/reference/android/bluetooth/BluetoothManager#getConnectedDevices(int)
- https://developer.android.com/reference/android/bluetooth/BluetoothAdapter#getBondedDevices()
- https://developer.android.com/reference/android/bluetooth/BluetoothAdapter#getProfileProxy(android.content.Context,android.bluetooth.BluetoothProfile.ServiceListener,int)
- https://developer.android.com/develop/connectivity/bluetooth/bt-permissions
