@echo off
REM ============================================================
REM EXECUTAR-COMO-ADMIN.cmd
REM O instalador do Node.js ja foi baixado automaticamente.
REM Este script apenas precisa ser executado como Administrador.
REM
REM INSTRUCOES:
REM   1. Clique com o botao DIREITO neste arquivo
REM   2. Selecione "Executar como administrador"
REM   3. Aguarde a conclusao
REM   4. Feche e reabra o PowerShell/Terminal
REM ============================================================

echo.
echo ============================================================
echo  Instalando Node.js LTS (ja baixado)
echo ============================================================
echo.

REM Verificar se e admin
net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo.
    echo  [ERRO] Este arquivo precisa ser executado como ADMINISTRADOR!
    echo.
    echo  Como fazer:
    echo    1. Clique com o botao DIREITO neste arquivo
    echo    2. Selecione "Executar como administrador"
    echo.
    pause
    exit /b 1
)
echo [OK] Rodando como Administrador

REM Caminho do MSI (ja disponivel na pasta do projeto)
set MSI_PATH=d:\cdmstores\node-lts.msi

if not exist "%MSI_PATH%" (
    echo [INFO] MSI nao encontrado, baixando Node.js v22.14.0 LTS...
    powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi' -OutFile '%MSI_PATH%' -UseBasicParsing"
    if %errorLevel% NEQ 0 (
        echo [ERRO] Falha no download. Verifique sua conexao com a internet.
        pause
        exit /b 1
    )
)

REM Instalar silenciosamente
echo [INFO] Instalando Node.js...
msiexec.exe /i "%MSI_PATH%" /quiet /norestart ADDLOCAL=ALL
if %errorLevel% EQU 0 (
    echo [OK] Node.js instalado com sucesso!
) else (
    echo [ERRO] Instalacao falhou. Codigo: %errorLevel%
    pause
    exit /b 1
)

REM Configurar PATH do sistema
echo [INFO] Configurando PATH...
setx PATH "%PATH%;C:\Program Files\nodejs;%APPDATA%\npm" /M >nul 2>&1

REM Corrigir Execution Policy
echo [INFO] Corrigindo PowerShell Execution Policy...
powershell -Command "Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force"

REM Validar
set "PATH=C:\Program Files\nodejs;%APPDATA%\npm;%PATH%"
echo.
echo ============================================================
echo  VALIDACAO:
echo ============================================================
node --version
npm --version
echo ============================================================
echo.
echo PROXIMO PASSO: Feche e reabra o PowerShell, depois execute:
echo.
echo   cd d:\cdmstores\worker
echo   npm install
echo   npm run dev
echo.
del "%TEMP%\node-lts.msi" >nul 2>&1
pause
