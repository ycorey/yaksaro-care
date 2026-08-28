@echo off
REM DUR 성분쌍 ETL 자동 재개 래퍼 (Windows 예약 작업용)
REM
REM 왜 필요한가: getUsjntTabooInfoList03 은 797,416건이고 페이지 상한이 500 이라 1,595콜이다.
REM 개발계정 일일 한도가 1,000콜이라 한 번에 못 끝낸다 — 한도에 걸리면 스크립트가
REM 체크포인트를 남기고 정상 종료하므로, 이 래퍼가 다음 날 이어서 돌린다.
REM
REM 체크포인트가 남아있을 때만 실행 -> 전량 완료(체크포인트 삭제) 후엔 자동 no-op.
REM DUR_DELAY 를 늘려 속도제한(429)을 피한다.
REM
REM 2026-08-28: 대상을 etl-dur-ingredient.mjs -> etl-dur-ingredient-pairs.mjs 로 교체.
REM   옛 스크립트는 성분쌍을 제품쌍으로 전개해 interactions 에 썼는데, 그 테이블은
REM   068 적용 시점부터 동결이다. 래퍼를 그대로 두면 예약 작업이 동결을 깬다.

cd /d "E:\Projects\yaksaro-care"

if not exist ".etl-dur-ingr-pairs-checkpoint.json" (
  echo [%date% %time%] checkpoint 없음 - ETL 완료/미시작, 건너뜀 >> dur-etl-cron.log
  exit /b 0
)

echo [%date% %time%] DUR 성분쌍 ETL 재개 시작 >> dur-etl-cron.log
set DUR_DELAY=400
"C:\Program Files\nodejs\node.exe" --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts\etl-dur-ingredient-pairs.mjs >> dur-etl-cron.log 2>&1
echo [%date% %time%] DUR 성분쌍 ETL 종료 (exit %errorlevel%) >> dur-etl-cron.log
