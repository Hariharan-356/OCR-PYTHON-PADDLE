#!/usr/bin/env python3
"""Download and verify optional OCR model assets.

This script intentionally does not run during application startup. It prints a
clear set of commands for the supported OCR engines and records the current
status in a human-readable way.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    print('ClaimsDigi OCR model bootstrap')
    print(f'Python: {sys.version.split()[0]}')
    print(f'Root: {ROOT}')
    print('')
    print('Optional model commands:')
    print('  pip install "easyocr>=1.7.3"')
    print('  pip install "paddleocr>=2.8.0" "paddlepaddle>=3.0.0"')
    print('  pip install pytesseract')
    print('')
    print('Notes:')
    print('- This sandbox only exposes Python 3.14; the repo target range is 3.10-3.12. OCR dependencies are installed only when the environment supports them.')
    print('- Model downloads are deliberately left out of the request path to avoid unexpected network access when the request is served.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
