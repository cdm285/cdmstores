@echo off
REM ============================================================
REM instalar-node.bat
REM Instala Node.js automaticamente e configura o ambiente.
REM EXECUTE COMO ADMINISTRADOR (clique direito → "Executar como administrador")
REM ============================================================

echo.
echo ============================================================
echo  CDM STORES - Instalador Node.js + Ambiente de Desenvolvimento
echo ============================================================
echo.

REM ── Verificar admin ─────────────────────────────────────────
net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo [AVISO] Este script deve ser executado como Administrador.
    echo.
    echo Instrucoes:
    echo   1. Feche esta janela
    echo   2. Clique com botao direito em "instalar-node.bat"
    echo   3. Selecione "Executar como administrador"
    pause
    exit /b 1
)
echo [OK] Executando como Administrador

REM ── Verificar se Node ja esta instalado ─────────────────────
where node >nul 2>&1
if %errorLevel% EQU 0 (
    echo [OK] Node.js ja instalado:
    node --version
    npm --version
    goto :configurar
)

REM ── Tentar via winget ────────────────────────────────────────
where winget >nul 2>&1
if %errorLevel% EQU 0 (
    echo [INFO] Instalando Node.js LTS via winget...
    winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent --override "/quiet /norestart ADDLOCAL=ALL"
    if %errorLevel% EQU 0 (
        echo [OK] winget instalou Node.js com sucesso
        goto :configurar
    )
    echo [AVISO] winget falhou, tentando download direto...
)

REM ── Fallback: download via PowerShell ────────────────────────
echo [INFO] Baixando Node.js v22.14.0 LTS de nodejs.org...
powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi' -OutFile '%TEMP%\node-lts.msi' -UseBasicParsing"
if %errorLevel% NEQ 0 (
    echo [ERRO] Download falhou. Instale manualmente:
    echo   https://nodejs.org/en/download/
    pause
    exit /b 1
)

echo [INFO] Instalando MSI silenciosamente...
msiexec.exe /i "%TEMP%\node-lts.msi" /quiet /norestart ADDLOCAL=ALL
if %errorLevel% NEQ 0 (
    echo [ERRO] Instalacao MSI falhou com codigo: %errorLevel%
    pause
    exit /b 1
)
del "%TEMP%\node-lts.msi" >nul 2>&1

:configurar
REM ── Configurar PATH do sistema ───────────────────────────────
echo [INFO] Configurando PATH...
setx PATH "%PATH%;C:\Program Files\nodejs;%APPDATA%\npm" /M >nul 2>&1
echo [OK] PATH atualizado

REM ── Corrigir Execution Policy para .ps1 ─────────────────────
echo [INFO] Configurando PowerShell Execution Policy...
powershell -Command "Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force"
echo [OK] ExecutionPolicy: RemoteSigned

REM ── Validar ──────────────────────────────────────────────────
echo.
echo ============================================================
echo  VALIDACAO
echo ============================================================
set "PATH=C:\Program Files\nodejs;%APPDATA%\npm;%PATH%"
node --version >nul 2>&1
if %errorLevel% EQU 0 (
    echo [OK] node:
    node --version
    echo [OK] npm:
    npm --version
) else (
    echo [AVISO] Node nao encontrado no PATH desta sessao.
    echo [INFO]  Feche e reabra o PowerShell/CMD para recarregar o PATH.
)

echo.
echo ============================================================
echo  PROXIMOS PASSOS
echo ============================================================
echo  1. Feche e reabra o PowerShell ou VS Code
echo  2. Execute:
echo       cd d:\cdmstores\worker
echo       npm install
echo       npm run dev
echo.
echo  Para testar:
echo       node --version
echo       npm --version
echo       npx wrangler --version
echo ============================================================
echo.
pause
