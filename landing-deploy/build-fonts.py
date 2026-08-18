# 폰트 서브셋 빌드 — fonts/*.ttf → fonts/w2/*.woff2
#
# 왜: 배포된 Paperlogy 7벌은 한글 전체 글리프(14,198자)를 담은 TTF 라 브로틀리 압축 후에도
# 벌당 약 600KB, /ter 진입 시 합계 4.00MB 였다. 페이지가 쓰는 글자는 400자 남짓이다.
#
# 글리프 선정: **실제 HTML 에 들어 있는 문자 전부** + KS X 1001 완성형 2,350자 + ASCII.
# "KS X 1001 만" 으로 자르면 그 밖의 음절(예: 뷁)이 들어간 순간 글자가 깨진다 —
# 지금 카피에 없더라도 나중에 문구를 고치면 조용히 깨지므로, 현재 문서 전량을 먼저 넣고
# 완성형을 여유분으로 얹는다.
#
# 문구를 고친 뒤에는 이 스크립트를 다시 돌릴 것. 안 돌리면 새로 쓴 글자가 빠진다.
#   python build-fonts.py

import os, glob, re
from fontTools import subset

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "fonts", "w2")

FACES = [
    "Paperlogy-3Light", "Paperlogy-4Regular", "Paperlogy-5Medium",
    "Paperlogy-6SemiBold", "Paperlogy-7Bold", "Paperlogy-9Black",
    "Pretendard-Regular",
]
# 파일명 대소문자가 이것만 다르다. 출력은 다른 이름과 형태를 맞춘다.
SPECIAL = [("PAPERLOGY-8EXTRABOLD.TTF", "Paperlogy-8ExtraBold")]


def charset() -> str:
    chars = set()
    # 1) 실제 문서에 등장하는 모든 문자
    for path in glob.glob(os.path.join(HERE, "*.html")):
        with open(path, encoding="utf-8") as fh:
            chars |= set(fh.read())
    # 2) ASCII 인쇄 가능 영역
    chars |= {chr(c) for c in range(0x20, 0x7F)}
    # 3) 자주 쓰는 문장부호·기호 (문구 수정 대비)
    chars |= set("—–·…‘’“”₩※→←↑↓○●△▲□■◆★☆©®™±×÷≤≥≠∙〜「」『』【】")
    chars |= set("✓✔✕✖√×○◯☑︎№㎡㎏℃€$¥")
    # 4) 브랜드에 쓰는 한자 — 藥은 두 원본 폰트 어디에도 없어 시스템 폴백으로 나간다(원래부터 그랬다).
    #    있는 글자만 넣어 두면 서브셋터가 알아서 가진 것만 담는다.
    chars |= set("藥師路")
    # 4) KS X 1001 완성형 2,350자 상당의 여유분 (연속 구간으로 근사)
    chars |= {chr(c) for c in range(0xAC00, 0xAC00 + 2350)}
    # 5) 한글 자모 (ㄱ~ㅣ) — 단독으로 쓰이는 경우
    chars |= {chr(c) for c in range(0x3131, 0x3164)}
    chars.discard("\n"); chars.discard("\r"); chars.discard("\t")
    return "".join(sorted(chars))


def build(src_name: str, out_stem: str, text: str) -> tuple[int, int]:
    src = os.path.join(HERE, "fonts", src_name)
    dst = os.path.join(OUT, out_stem + ".woff2")
    subset.main([
        src, f"--output-file={dst}", "--flavor=woff2",
        f"--text={text}",
        "--layout-features=*",      # 커닝·합자 유지
        "--no-hinting",             # 힌팅은 woff2 에서 이득 대비 용량이 크다
        "--desubroutinize",
    ])
    return os.path.getsize(src), os.path.getsize(dst)


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    text = charset()
    print(f"글리프 {len(text)}자로 서브셋\n")
    before = after = 0
    for stem in FACES:
        b, a = build(stem + ".ttf", stem, text)
        before += b; after += a
        print(f"  {stem:<22} {b:>9,} → {a:>7,} B")
    for src, stem in SPECIAL:
        b, a = build(src, stem, text)
        before += b; after += a
        print(f"  {stem:<22} {b:>9,} → {a:>7,} B")
    print(f"\n  {'합계':<22} {before:>9,} → {after:>7,} B  ({(1-after/before)*100:.1f}% 감소)")


if __name__ == "__main__":
    main()
