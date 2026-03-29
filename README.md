# LEG3NDY Studio

Aplicativo desktop para análise, fila e download de conteúdo multimídia com interface moderna em Electron, frontend em React + TypeScript e engine de download em Python/FastAPI.

## Visão Geral

O projeto combina três camadas bem definidas:

- `Electron`: empacotamento desktop, janela customizada, bandeja do sistema, integração com o Windows e auto-update.
- `React + TypeScript`: interface principal da aplicação, agora organizada em componentes e tipada.
- `FastAPI + yt-dlp`: engine responsável por análise de links, busca, preview, download, biblioteca local e configurações.

A migração do frontend para React + TypeScript foi feita para facilitar manutenção, evolução de interface, separação de responsabilidades e reuso de lógica sem depender de manipulação direta de DOM.

## Estado Atual da Arquitetura

### Frontend

O frontend agora usa:

- React 19
- TypeScript
- Vite
- CSS reutilizado da identidade visual existente

A fonte oficial da interface passa a ser `frontend/src/`.

### Desktop Shell

A camada desktop continua em Electron e mantém:

- Janela customizada sem frame padrão
- Integração com tray
- Auto-start com Windows
- Atualizações automáticas com `electron-updater`
- Bridge segura via `preload.ts`

### Engine de Download

O backend continua em Python para preservar a maturidade da engine atual:

- FastAPI para a API local
- `yt-dlp` para extração e download
- `ffmpeg` para pós-processamento, merge e conversão
- leitura de Spotify para resolução de busca no YouTube

## Stack

### Desktop

- Electron
- electron-builder
- electron-updater

### Frontend

- React
- React DOM
- TypeScript
- Vite

### Backend

- FastAPI
- Uvicorn
- yt-dlp
- requests
- beautifulsoup4
- pydantic
- mutagen
- websockets
- bgutil-ytdlp-pot-provider

## Estrutura de Pastas

```text
.
|-- backend/
|   |-- server.py                # API local FastAPI e engine de download
|   |-- config.json              # Config legado do backend
|   |-- history.json             # Histórico legado do backend
|-- frontend/
|   |-- dist/                    # Build gerado do frontend React
|   |-- img/                     # Assets estáticos usados pela UI
|   |-- src/
|   |   |-- components/          # Componentes e views React
|   |   |-- lib/                 # API client e utilitários
|   |   |-- App.tsx              # Orquestração principal da interface
|   |   |-- constants.ts         # Configurações visuais e listas fixas
|   |   |-- types.ts             # Tipos compartilhados do frontend
|   |   |-- main.tsx             # Entry point React
|   |-- index.html               # HTML base do Vite
|   |-- style.css                # Base visual reaproveitada e ajustada
|   |-- vite-env.d.ts            # Tipagens globais do renderer
|-- resources_build/             # Binários e recursos usados no empacotamento
|-- main.ts                      # Processo principal do Electron
|-- preload.ts                   # Bridge segura entre Electron e renderer
|-- tsconfig.electron.json       # Build TS do Electron
|-- tsconfig.json                # Config TS do frontend React
|-- vite.config.ts               # Configuração do Vite
|-- package.json
|-- README.md
```

## Fluxo da Aplicação

1. O Electron inicia a aplicação desktop.
2. O processo principal sobe o backend Python local.
3. O frontend React é carregado no renderer.
4. A UI conversa com o backend via HTTP local (`127.0.0.1:5000`).
5. Recursos nativos do desktop passam pelo `preload.ts` com `contextIsolation` ativo.

## Funcionalidades Principais

- Análise de links do YouTube
- Resolução de links do Spotify para busca no YouTube
- Busca textual por vídeos
- Download de vídeo e áudio
- Fila de downloads com progresso
- Biblioteca local com ordenação
- Preview de mídia
- Seleção de diretório de download
- Auto-start e comportamento em bandeja
- Atualizações automáticas do app

## Requisitos para Desenvolvimento

### Node

- Node.js 20+
- npm 10+

### Python

- Python 3.10+ recomendado
- `python` disponível no PATH

### Dependências Python

Instale com:

```bash
pip install -r requirements.txt
```

Conteúdo atual de `requirements.txt`:

- `yt-dlp>=2026.03.03`
- `fastapi`
- `uvicorn`
- `pydantic`
- `requests`
- `beautifulsoup4`
- `curl-cffi`
- `mutagen`
- `websockets`
- `bgutil-ytdlp-pot-provider`

## Instalação

### 1. Dependências Node

```bash
npm install
```

### 2. Dependências Python

```bash
pip install -r requirements.txt
```

## Scripts

### Desenvolvimento completo

```bash
npm run dev
```

Esse comando sobe:

- Vite para o frontend React
- `tsc --watch` para Electron
- Electron apontando para o dev server

### Build local para executar a app

```bash
npm start
```

Esse fluxo:

1. compila o Electron
2. gera o build do frontend
3. abre o app desktop

### Build de produção

```bash
npm run build
```

### Empacotamento do instalador

```bash
npm run dist
```

## Pontos de Entrada Importantes

### Renderer

- `frontend/src/main.tsx`
- `frontend/src/App.tsx`

### Electron

- `main.ts`
- `preload.ts`

### Backend

- `backend/server.py`

## Build Artifacts

Arquivos gerados automaticamente e que não devem ser editados manualmente:

- `main.js`
- `preload.js`
- `frontend/dist/`

## API Local do Backend

Principais rotas consumidas pelo frontend:

- `POST /api/info`
- `POST /api/download`
- `GET /api/status/{task_id}`
- `POST /api/cancel`
- `GET /api/preview`
- `GET /api/library`
- `POST /api/delete`
- `POST /api/clear-all`
- `GET /api/config`
- `POST /api/config`
- `POST /api/config/reset`
- `POST /api/open-folder`

## Decisões de Arquitetura

### Por que React + TypeScript

- elimina `onclick` global e manipulação direta de DOM
- melhora previsibilidade de estado
- facilita separação entre UI, serviços e tipos
- reduz risco de regressão em telas com muitas interações
- acelera manutenção e novas features

### Por que manter o backend Python

- a engine já está madura e funcionando bem
- `yt-dlp` e `ffmpeg` já estão integrados
- a migração focou na camada de interface e organização do app
- reduz risco de quebrar o core de download sem necessidade

## Convenções de Manutenção

- novas telas ou blocos visuais devem nascer em `frontend/src/components/`
- lógica de comunicação com API deve ficar em `frontend/src/lib/api.ts`
- utilitários e formatadores devem ficar em `frontend/src/lib/utils.ts`
- tipos compartilhados do renderer devem ficar em `frontend/src/types.ts`
- integrações nativas do Electron devem passar pelo `preload.ts`
- evitar acesso direto ao Node no renderer

## Próximos Passos Recomendados

- extrair estados complexos para hooks dedicados (`useQueue`, `useLibrary`, `useSettings`)
- adicionar testes para utilitários e fluxos críticos do renderer
- limpar definitivamente arquivos legados não mais usados no frontend antigo
- modularizar ainda mais a engine Python por domínio (`downloads`, `library`, `config`, `providers`)
- adicionar validação visual e smoke tests para build desktop

## Distribuição

O empacotamento é feito com `electron-builder` e usa recursos da pasta `resources_build/`, incluindo:

Para o fluxo de build/release do macOS, consulte [docs/platforms/macos-release.md](docs/platforms/macos-release.md).

- `leg3ndy-engine.exe`
- `ffmpeg.exe`
- `node.exe`
- `icon-app.png`

## Licença

Projeto marcado como `UNLICENSED` no `package.json`.

## Resumo da Migração

A base do app agora está pronta para evolução moderna:

- frontend migrado para React + TypeScript
- build organizado com Vite
- Electron ajustado para carregar renderer moderno
- bridge do preload preparada para subscriptions com cleanup
- README atualizado para refletir o estado real do projeto
