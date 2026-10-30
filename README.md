# dixVR — Android Cardboard

Launcher dixVR WebXR-inspired para Android, feito em **Next.js + React + Three.js** e empacotado como APK. A interface usa câmera traseira em passthrough, painel flutuante em CSS3D, modo Cardboard side-by-side e controle opcional por mãos.

## 📲 APK

**Link direto permanente:** https://github.com/levajjooi-del/ATMOXR-ANDROID/releases/download/apk-latest/ATMOXR.apk
**Pull request:** https://github.com/levajjooi-del/ATMOXR-ANDROID/pull/1

O GitHub Actions valida o app e atualiza a release `apk-latest` somente quando a assinatura persistente está configurada. Requer Android 8+, câmera traseira, giroscópio e internet para carregar o MediaPipe e os sites. Na primeira abertura, autorize a câmera; a resolução solicitada é 640×480 a até 30 fps para reduzir a carga no celular.

## O que há no dixVR 4.3

- **Biblioteca inicial** em janela flutuante e dock inferior permanente, usando os glifos e fundos PNG da referência Aura enviada (sem emojis como ícones de app).
- **Dock mais próxima e visível nas duas lentes**, com relógio, estado Cardboard e atalhos Aura para Navegador, Calculadora, Calendário, Câmera, Relógio, Threads, Facebook, Arquivos, Galeria, Ajuda, Instagram, Área de trabalho remota, Ajustes, Loja, Mensagens, TV/YouTube e WhatsApp. A barra branca move a dock sem deslocar as janelas; o botão de grade abre a Biblioteca.
- **Navegador inspirado na interface Quest**: seta de voltar, barra de pesquisa/endereço com botão “Procurar” e favoritos com ícones próprios.
- **Janelas flutuantes ainda maiores (escala 0,0032)** para Biblioteca, Loja, Navegador, Relógio e Ajustes, seguindo a referência; o YouTube abre em uma janela compacta e pode ser pesquisado em `youtube.com`.
- **Cardboard 2015 ligado por padrão**: SBS com a mesma imagem duplicada nas duas lentes, máscara circular dupla e FOV 90°. O perfil mantém o IPD 0,064 m como referência; a separação de câmera é zerada para atender à imagem idêntica solicitada. World Lock começa desligado.
- **Recentração somente ao abrir apps**; painel e cabeça continuam com suavização amortecida. A barra branca arrasta a dock de forma independente, elevada e mais próxima do usuário.
- **Hand tracking por contorno azul**, construído pelas laterais dos cinco dedos (sem convex hull, preenchimento ou “bola”). O mesmo tracker e a mesma câmera alimentam o launcher e o ShootTheDie; o jogo exibe o contorno nos dois olhos SBS e usa pinça para atirar, sem abrir um segundo tracker.
- **Câmera traseira sem espelhamento**: corrige Left/Right do MediaPipe e alinha os landmarks ao recorte `object-fit: cover`. A mão direita controla a arma e a esquerda a lanterna.
- **Pinça sem feixe**: o ponto de interação fica entre polegar e indicador; apertar segura/arrasta e levantar os dedos conclui o clique. O cursor de pinça usa o marcador azul do HTML de referência.
- **Mais leve**: captura reduzida para 640×480/30 fps, evita processar o mesmo quadro da câmera duas vezes, adapta a taxa de inferência conforme o tempo do MediaPipe e redesenha o overlay apenas quando necessário.
- Mantém as experiências **Ilha Tropical**, **Dreamcore**, **Cozinha**, o jogo **ShootTheDie**, atalhos de Minecraft/Roblox e o conteúdo de YouTube/navegação.

## Estrutura do projeto

| Caminho | Conteúdo |
|---|---|
| `web/pages/` | Páginas Next.js e entrada React |
| `web/components/Launcher.jsx` | Biblioteca, dock, navegador, ajustes e estado da UI |
| `web/components/AuraIcon.jsx` | Ícones PNG Aura da referência e glifos vetoriais específicos dos apps |
| `web/public/aura-icons/` | Fundos e glifos PNG usados pela dock Aura |
| `web/lib/engine.js` | Three.js, render SBS, giroscópio e posicionamento das janelas |
| `web/lib/hands.js` | MediaPipe, contorno por dedo, pinça, hit-test e ponte de landmarks |
| `web/lib/environments.js` | Ambientes 3D procedurais |
| `web/public/shoot-the-die.html` | Jogo integrado, contorno compartilhado e ponte mãos/giroscópio |
| `app/` | Wrapper Android com WebView em `com.atmoxr.app` |
| `legacy/potatovr.html` | Launcher HTML antigo, mantido apenas como referência histórica |
| `.github/workflows/build-apk.yml` | Build Next.js/Android, validação e publicação do APK |

## Build

Build web/export estático:

```sh
cd web
npm ci
npm run build
```

O `postbuild` renomeia `_next/` para `next/` e atualiza as referências: o empacotador de assets do Android pode ignorar nomes iniciados por `_`. O workflow também verifica se `assets/next/static/chunks/`, a página inicial, a logo e o jogo estão dentro do APK e falha antes de publicar se o arquivo ficar incompleto.

O APK é construído pelo GitHub Actions com JDK 17, Gradle 8.7 e Android SDK 34. Build Android local requer essas ferramentas instaladas.

## Assinatura e atualização do APK

As builds de distribuição usam uma assinatura Android persistente, fornecida ao workflow pelos segredos do GitHub Actions `ATMOXR_SIGNING_KEYSTORE_BASE64` (keystore PKCS#12 em Base64) e `ATMOXR_SIGNING_PASSWORD` (senha do keystore/chave; alias `atmoxr`). O workflow não publica APK se esses segredos estiverem ausentes; builds de PR continuam usando a assinatura de debug apenas para validação. **A primeira instalação assinada de forma estável pode exigir remover uma vez o APK 4.2**, pois a chave temporária das builds antigas não está disponível. Depois dessa migração, a assinatura persistente permite atualizar sem conflito. A chave privada nunca deve ser colocada no repositório.
