@echo off
setlocal
pushd "%~dp0" || (
  echo Impossibile aprire la cartella dell'applicazione.
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 24 LTS non trovato. Installalo e riprova.
  goto errore
)
where npm >nul 2>&1
if errorlevel 1 (
  echo npm non trovato. Installa Node.js 24 LTS con npm e riprova.
  goto errore
)
node -e "const v=process.versions.node.split('.').map(Number); process.exit(v[0]===24 && v[1]>=15 ? 0 : 1)"
if errorlevel 1 (
  echo Serve Node.js 24 LTS, versione 24.15.0 o successiva.
  goto errore
)

if not exist "node_modules\." (
  echo Installazione delle dipendenze al primo avvio...
  call npm ci
  if errorlevel 1 goto errore
)

echo Avvio di Immobiliare...
call npm run desktop:dev -- %*
if errorlevel 1 goto errore
popd
exit /b 0

:errore
echo.
echo Avvio non riuscito. Controlla i messaggi sopra e riprova.
popd
pause
exit /b 1
