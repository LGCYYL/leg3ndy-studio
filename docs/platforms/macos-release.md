# macOS Build e Release

Este guia cobre o fluxo local e o fluxo de CI para gerar o `.dmg` do `LEG3NDY Studio` com a base atual do projeto.

## Estado Atual

O projeto agora já possui:

- renderer cross-platform em Electron + React
- backend Python com paths e descoberta de binários preparados para macOS
- `electron-builder` configurado para gerar `dmg` e `zip`
- hook de notarização opcional com `@electron/notarize`
- workflow GitHub preparado para rodar em `macos-latest`

## Pré-requisitos Locais no Mac

Instale:

- Xcode Command Line Tools
- Node.js 22+
- Python 3.11+
- Homebrew
- FFmpeg via Homebrew

Comandos sugeridos:

```bash
xcode-select --install
brew install ffmpeg
npm install
python3 -m pip install --upgrade pip
python3 -m pip install -r requirements.txt
python3 -m pip install pyinstaller
```

## Build Local sem Publicar

Gere a engine Python:

```bash
pyinstaller leg3ndy-engine.spec
```

Depois gere o app macOS:

```bash
npm run dist:mac
```

Esse fluxo já:

- compila Electron e renderer
- prepara o bundle de runtime em `resources_build`
- empacota o app para `dmg` e `zip`

## Secrets para GitHub Release macOS

Para assinatura e notarização reais, configure estes secrets no repositório:

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`
- `CSC_LINK`
- `CSC_KEY_PASSWORD`

### Sobre os secrets

- `APPLE_ID`: Apple ID da conta de distribuição
- `APPLE_APP_SPECIFIC_PASSWORD`: app-specific password da Apple
- `APPLE_TEAM_ID`: Team ID do Apple Developer
- `CSC_LINK`: certificado `.p12` de assinatura do app
- `CSC_KEY_PASSWORD`: senha do `.p12`

Sem os secrets Apple, o build mac ainda pode ser gerado, mas a notarização será pulada e o app não terá o fluxo final ideal de distribuição.

## Workflow de Release

O workflow atual em `.github/workflows/build-release.yml`:

- roda em `windows-latest` e `macos-latest`
- instala dependências Node e Python
- gera a engine Python com PyInstaller
- instala/prepara FFmpeg por plataforma
- publica artefatos no release da tag
- sobe uma cópia dos binários em `actions/upload-artifact`

## Smoke Test Recomendado no macOS

Antes de publicar para usuários, validar:

1. abrir o app pelo `.app` e pelo `.dmg`
2. verificar se a janela abre com traffic lights nativos
3. analisar um link do YouTube
4. abrir preview
5. baixar vídeo e áudio
6. trocar pasta de download
7. abrir pasta pelo app
8. validar biblioteca local
9. validar auto-start/login item
10. validar fechamento para tray ou comportamento equivalente esperado
11. validar update check manual
12. validar primeira execução em máquina limpa

## Riscos Ainda Conhecidos

- o comportamento exato de tray/menu bar precisa validação em um Mac real
- a notarização depende de credenciais Apple válidas no CI
- o provider `bgutil` precisa existir no ambiente ou vir bundled para garantir o mesmo fallback avançado do Windows
- updates no mac só devem ser considerados prontos após teste real de assinatura/notarização e instalação incremental

## Checklist de Release

1. confirmar versão em `package.json`
2. validar `npm run build`
3. validar `pyinstaller leg3ndy-engine.spec`
4. gerar build local no Mac com `npm run dist:mac`
5. executar smoke test completo
6. conferir secrets Apple no GitHub
7. criar tag `vX.Y.Z`
8. acompanhar workflow de Windows e macOS
9. baixar o `.dmg` gerado no release
10. testar instalação final em outro Mac
