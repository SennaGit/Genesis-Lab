@echo off
setlocal

if defined GENESIS_NODE set "NODE_EXE=%GENESIS_NODE%"

if not defined NODE_EXE (
  where node >nul 2>nul
  if not errorlevel 1 set "NODE_EXE=node"
)

if not defined NODE_EXE (
  if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)

if not defined NODE_EXE (
  echo ??? Node.js??? node ?? PATH???? GENESIS_NODE ?? node.exe? 1>&2
  exit /b 1
)

"%NODE_EXE%" "%~dp0genesis.ts" %*
