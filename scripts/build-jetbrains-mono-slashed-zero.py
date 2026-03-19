from pathlib import Path

from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "fonts" / "JetBrainsMono.ttf"
TARGET = ROOT / "fonts" / "JetBrainsMonoSlashedZero.ttf"
ZERO_CODEPOINT = 0x30
SLASHED_ZERO_GLYPH = "zero.zero"


def main() -> None:
    font = TTFont(SOURCE)

    for table in font["cmap"].tables:
        if ZERO_CODEPOINT in table.cmap:
            table.cmap[ZERO_CODEPOINT] = SLASHED_ZERO_GLYPH

    font.save(TARGET)
    print(f"Built {TARGET.relative_to(ROOT)} from {SOURCE.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
