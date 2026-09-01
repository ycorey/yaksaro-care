@echo off
REM DUR ingredient-pair ETL auto-resume wrapper (Windows Scheduled Task)
REM
REM ASCII ONLY. cmd.exe parses .cmd files using the system ANSI codepage (CP949 here),
REM so UTF-8 Korean text is mangled into garbage that cmd tries to run as commands.
REM The previous version of this file had Korean REM lines and was broken end to end --
REM even the `if not exist` guard failed to parse. Verified 2026-08-29 by running both
REM the old and new content: both produced "not recognized as an internal or external
REM command" for every line containing Korean. Keep this file ASCII.
REM Rationale in Korean lives in scripts/etl-dur-ingredient-pairs.mjs header.
REM
REM Runs only when a checkpoint exists -> automatic no-op once the scan completes
REM (the ETL deletes its checkpoint on full completion).
REM DUR_DELAY is raised to avoid API rate limiting (429).
REM
REM 2026-08-28: retargeted from etl-dur-ingredient.mjs to etl-dur-ingredient-pairs.mjs.
REM   The old script expanded ingredient pairs into product pairs and wrote them to
REM   `interactions`, which is frozen as of migration 068. Leaving the wrapper pointed
REM   at it would let a scheduled task break the freeze.

cd /d "E:\Projects\yaksaro-care"

if not exist ".etl-dur-ingr-pairs-checkpoint.json" (
  echo [%date% %time%] no checkpoint - ETL complete or not started, skipping >> dur-etl-cron.log
  exit /b 0
)

echo [%date% %time%] resuming DUR ingredient-pair ETL >> dur-etl-cron.log
set DUR_DELAY=400
"C:\Program Files\nodejs\node.exe" --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts\etl-dur-ingredient-pairs.mjs >> dur-etl-cron.log 2>&1
echo [%date% %time%] DUR ingredient-pair ETL finished (exit %errorlevel%) >> dur-etl-cron.log
