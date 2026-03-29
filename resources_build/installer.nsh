!include "MUI2.nsh"

; Forca privilegios de administrador para o desinstalador
RequestExecutionLevel admin

!macro customUnInstall
  ; Evita que o NSIS agende reinicio automatico como fallback.
  SetRebootFlag false

  ; 1. MATAR PROCESSOS (Garante que nada segura os arquivos)
  DetailPrint "Encerrando processos do LEG3NDY..."
  
  ; Tenta matar de forma suave primeiro, depois forcada
  nsExec::Exec 'taskkill /F /IM "LEG3NDY Studio.exe"'
  nsExec::Exec 'taskkill /F /IM "leg3ndy-engine.exe"'
  nsExec::Exec 'taskkill /F /IM "ffmpeg.exe"'
  
  ; Espera o Windows respirar
  Sleep 2000

  ; NAO apagar o AppData durante desinstalacao/atualizacao!
  ; As configs e o historico do usuario devem persistir entre versoes.

  ; LIMPEZA DA PASTA DE INSTALACAO
  ; O $INSTDIR e a pasta onde foi instalado.
  DetailPrint "Removendo arquivos do sistema..."
  
  ; Verifica se o diretorio existe antes de tentar apagar para evitar erro
  IfFileExists "$INSTDIR\*.*" 0 +2
    RMDir /r "$INSTDIR"

  SetRebootFlag false
!macroend
