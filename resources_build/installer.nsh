!include "MUI2.nsh"

; Força privilégios de administrador para o desinstalador
RequestExecutionLevel admin

!macro customUnInstall
  ; 1. MATAR PROCESSOS (Garante que nada segura os arquivos)
  DetailPrint "Encerrando processos do LEG3NDY..."
  
  ; Tenta matar de forma suave primeiro, depois forçada
  nsExec::Exec 'taskkill /F /IM "LEG3NDY Studio.exe"'
  nsExec::Exec 'taskkill /F /IM "leg3ndy-engine.exe"'
  nsExec::Exec 'taskkill /F /IM "ffmpeg.exe"'
  
  ; Espera o Windows respirar
  Sleep 2000

  ; 2. LIMPEZA DO APPDATA (Configs e Histórico)
  ; SetShellVarContext all garante que olhemos para todos os usuários se foi instalado perMachine
  SetShellVarContext all
  DetailPrint "Removendo configurações..."
  RMDir /r /REBOOTOK "$APPDATA\LEG3NDY Studio"
  
  ; Também checa no usuário atual por garantia
  SetShellVarContext current
  RMDir /r /REBOOTOK "$APPDATA\LEG3NDY Studio"

  ; 3. LIMPEZA DA PASTA DE INSTALAÇÃO
  ; O $INSTDIR é a pasta onde foi instalado. O comando /r apaga tudo recursivamente.
  DetailPrint "Removendo arquivos do sistema..."
  
  ; Verifica se o diretório existe antes de tentar apagar para evitar erro
  IfFileExists "$INSTDIR\*.*" 0 +2
    RMDir /r /REBOOTOK "$INSTDIR"
    
!macroend