# ATMOXR-ANDROID — ATMOXR 🥽

Launcher VR/AR para Android feito em HTML5 (Three.js + MediaPipe Hands),
pensado para rodar liso até em celular fraco: passthrough de câmera,
painéis 3D flutuantes controlados por **hand tracking**, navegador Google,
ilha 3D imersiva e jogos (Shoot The Die, Dreamcore, Cozinha) — com modo
**Side-by-Side para Google Cardboard 2015 (v2)**.

## 📲 Baixar o APK (link direto)

➡️ **https://github.com/levajjooi-del/ATMOXR-ANDROID/releases/download/apk-latest/ATMOXR.apk**

O APK é compilado automaticamente pelo GitHub Actions a cada atualização e
publicado na release `apk-latest`.

**Requisitos:** Android 8+, câmera, giroscópio e internet (Three.js e
MediaPipe são carregados de CDN). Para instalar, permita "fontes
desconhecidas" quando o Android pedir.

## ✨ Novidades da v3 (ATMOXR)

- **Marca nova:** tudo que era "Potato" virou **ATMOXR** (nome, ícone com a logo
  oficial, tela inicial com a logo, pacote `com.atmoxr.app`). Apps instalados
  da versão antiga são migrados automaticamente.
- **Interface Horizon (estilo Meta Quest):** biblioteca em grade de blocos
  coloridos, dock em formato de pílula flutuante com relógio, navegador
  escuro com página inicial de atalhos (YouTube, Spotify, Instagram, X,
  Twitch, TikTok, Netflix, WhatsApp) e painéis escuros combinando.
- **Side-by-Side ligado de fábrica:** o modo Cardboard 2015 já entra ativado.
- **Dock corrigida e sempre embaixo:** altura fixa do grupo + `margin-top:auto`
  — a dock não "flutua" mais quando nenhuma janela está aberta.
- **Nada de painel "duro":** giroscópio suavizado na taxa da tela e painel que
  **desliza** atrás do olhar (seguir-cabeça com amortecimento estilo Quest).
  World Lock agora vem desligado por padrão.
- **Recentrar ao abrir apps:** Biblioteca/Loja/Google/YouTube abrem bem na
  frente do jogador; no Shoot The Die, a direção do olhar vira a "frente".
- **Hand Tracking estilo Quest 3S:** mão fantasma branca ("Quest Fantasma"),
  **laser** saindo da palma, cursor que aperta com a pinça e **clique por
  pinça rápida** (soltar = clicar; arrastar segurando = rolar/mover).
- **Mais FPS:** removido o `backdrop-filter` dos painéis grandes (vilão nº 1
  em celular fraco) e o hit-test da mão agora usa retângulos cacheados — sem
  varrer o DOM nem forçar reflow a cada frame.

## ✨ O que foi otimizado nesta versão

### Hand Tracking mais rápido e estável
- Inferência **adaptativa**: mede o tempo real da IA e ajusta sozinha o
  intervalo (16–50 ms) e a resolução de entrada (256×192 ↔ 192×144) —
  celular forte ganha mais FPS/precisão; celular fraco não trava.
- Suavização com **predição por velocidade** + amortecimento exponencial por
  delta de tempo: mão sem tremida e sem atraso, igual a 30/60/90/120 Hz.
- Câmera pedindo 60 FPS (negocia sozinho se o aparelho não suportar).
- Giroscópio com suavização temporal (slerp por dt) — acabou a tremida do sensor.

### Modo Cardboard 2015 (Side-by-Side)
- Perfil do viewer **Cardboard v2 (2015)**: IPD de 64 mm, FOV de ~90° nos
  dois olhos e vinheta circular por olho simulando o barril das lentes de 34 mm.
- Olho direito agora renderiza **em todo frame** (antes 30 FPS) e os painéis
  sincronizam a posição por frame — sem "pulos" entre os olhos.
- **Mãos e ilha 3D aparecem nos dois olhos** (antes só no esquerdo).
- O Shoot The Die entra/sai do estéreo **junto com o launcher** (FOV 90°,
  `eyeSep` = IPD, HUD duplicado por olho).

### Mais FPS nos jogos e na interface
- Shoot The Die: paredes viraram **1 InstancedMesh** (antes ~100 draw calls,
  ×2 no estéreo), materiais Lambert, colisão O(1) por célula, delta de tempo
  em tudo (o jogo não acelera mais em tela de 120 Hz) e sem carregar o
  MediaPipe de novo dentro do jogo.
- Dreamcore/Cozinha/Ilha: pixel ratio limitado (1.2/1.2/1.15), antialias
  desligado, sombras PCF mais baratas, ilha a ~60 FPS.
- Loop principal: menos alocações por frame (GC), bounds nativos a 10 Hz.
- Correção de bug: o CSS do painel do YouTube estava fora da tag `<style>`.

### Ajustes pedidos
- **Painel do Google menor**: 940×610 → 720×470 px, escala 3D 0.0024 → 0.0020.
- **Teclado mais embaixo**: posição Y −0.62 → −0.92, mais perto e mais inclinado.

## 🕹️ Como usar

1. Abra o app, toque em iniciar e conceda a permissão de câmera.
2. Aponte o dedo indicador para mirar; **parar sobre um botão = clique**
   (dwell); pinça segura/arrasta painéis pela alça lateral.
3. Na dock inferior: Biblioteca, Loja (instalar Google/YouTube/jogos),
   **botão VR** (liga o Side-by-Side do Cardboard), World Lock e câmera/ilha.
4. Shoot The Die: a arma segue a mão direita, a lanterna a esquerda;
   feche o polegar para atirar e olhe para baixo para andar.

## 🛠️ Estrutura

| Caminho | O que é |
|---|---|
| `index.html` | O jogo/launcher completo (fonte única da verdade) |
| `app/` | Projeto Android (WebView imersiva em `MainActivity`) |
| `.github/workflows/build-apk.yml` | Compila o APK e publica na release `apk-latest` |

Build local (opcional): `cp index.html app/src/main/assets/ && gradle assembleDebug`

> Observação: a UI do launcher é feita em CSS3D (DOM), então a distorção de
> barril "por pixel" das lentes não se aplica aos painéis — o modo Cardboard
> usa SBS com IPD/FOV do perfil 2015 + vinheta de lente, que é a aproximação
> correta para esse tipo de interface. Nos jogos WebGL o estéreo é real
> (StereoCamera com `eyeSep` do Cardboard 2015).
