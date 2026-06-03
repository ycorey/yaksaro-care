@echo off
REM DUR 성분기반 ETL 자동 재개 래퍼 (Windows 예약 작업용)
REM 체크포인트가 남아있을 때만 실행 → 완료(체크포인트 삭제) 후엔 자동 no-op.
REM 느린 딜레이(DUR_DELAY)로 API 속도제한(429) 회피.

cd /d "C:\Users\main\yaksaro-care"

if not exist ".etl-dur-ingr-checkpoint.json" (
  echo [%date% %time%] checkpoint 없음 - ETL 완료/미시작, 건너뜀 >> dur-etl-cron.log
  exit /b 0
)

echo [%date% %time%] DUR ETL 재개 시작 >> dur-etl-cron.log
set DUR_DELAY=400
"C:\Program Files\nodejs\node.exe" scripts\etl-dur-ingredient.mjs >> dur-etl-cron.log 2>&1
echo [%date% %time%] DUR ETL 종료 (exit %errorlevel%) >> dur-etl-cron.log
