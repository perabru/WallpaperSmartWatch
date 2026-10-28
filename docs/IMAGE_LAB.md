# Image Lab 2.1 — manual de uso

1. Abra **Escolher imagem** e selecione uma foto, desenho ou GIF. O app não precisa acessar toda a galeria: você escolhe o arquivo pelo seletor do Android.
2. Em **Enquadramento**, escolha preencher, imagem inteira, fundo desfocado ou esticar. Arraste a prévia para mover, use dois dedos para zoom/rotação ou os controles. Desfazer e refazer mantêm até 25 estados.
3. Para uma fotografia de relógio, use **Recortar por quatro cantos**. Marque superior esquerdo, superior direito, inferior direito e inferior esquerdo da área da tela. Não inclua braço ou carcaça. O algoritmo corrige perspectiva; não é remoção automática por inteligência artificial. Em GIF, esse recorte vira imagem estática do quadro atual.
4. Em **Formato e resolução**, escolha círculo, quadrado ou retângulo. No modo circular, os lados são iguais. A resolução inicial 480×480 é apenas uma escolha de exportação, não uma especificação confirmada do Watch 8 Ultra.
5. Ajuste cores, espelhamento, transparência fora da máscara, texto e a prévia do horário. O horário não é gravado no arquivo exportado.
6. Para a barra animada, ative **ECG** e posicione o retângulo com os controles. Ajuste cor, tamanho, velocidade e duração. Não é uma medição de saúde. O modelo Inventário já abre com a área posicionada.
7. Exporte PNG (qualidade/transparência), JPG (menor), WebP ou GIF (animação). JPG e GIF recebem um fundo sólido. GIF tem paleta de 256 cores, portanto é normal perder precisão nas cores. O GIF toca em loop e não contém o braço/relógio físico quando a origem é o modelo de inventário.
8. **Meu catálogo** salva a imagem e os ajustes localmente. Na aba Catálogo, exporte o projeto atual em JSON para backup. JSON não é um arquivo de mostrador nativo.
9. Em **Relógio**, desconecte temporariamente o MActive Pro, busque e conecte seu dispositivo de dados. O envio só é liberado após autenticação e verificação pelo adaptador JieLi. A imagem é preparada nas dimensões informadas pelo aparelho. O envio é sempre estático, mesmo quando o projeto tem animação.

## Limites explícitos

Importação até 24 MB. Imagens estáticas são reduzidas, quando necessário, para até 2048 px no maior eixo. HEIC e outros formatos dependem dos decodificadores instalados no Android; SVG é rejeitado. GIF: até 90 quadros importados e 24 milhões de pixels somados; um aviso informa truncamento. O limite de exportação GIF é de 24 milhões de pixels somados e 512 px por eixo; diminua duração/resolução se o app pedir. Exportações até 40 MB; projetos importados até 36 MB.

Nenhuma aplicação pode garantir adaptação de todo arquivo corrompido/formato desconhecido. As falhas são informadas sem substituir a imagem atual. Fotos não ganham elementos dinâmicos de sensor por serem exportadas.

## Privacidade e atualização

Sem permissão de Internet. Fotos e projetos ficam no aparelho e nos destinos que você escolhe ao exportar. O diagnóstico Bluetooth pode conter nome/endereço do relógio: revise antes de compartilhar. Não publique sua chave de assinatura. Antes de desinstalar, exporte os projetos; não há backup em nuvem automático.
