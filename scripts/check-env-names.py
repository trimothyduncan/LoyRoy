"""Print environment variable names referenced by common source files.
Does not print values. Run from repository root.
"""
import re
from pathlib import Path

patterns = [
    re.compile(r"\bprocess\.env\.([A-Z][A-Z0-9_]*)"),
    re.compile(r"\bimport\.meta\.env\.([A-Z][A-Z0-9_]*)"),
    re.compile(r"\bos\.environ(?:\.get)?\(\s*[\"']([A-Z][A-Z0-9_]*)"),
]
found = set()
for path in Path(".").rglob("*"):
    if not path.is_file() or any(part in {".git","node_modules","dist","build",".next"} for part in path.parts):
        continue
    try:
        text = path.read_text(errors="ignore")
    except Exception:
        continue
    for pattern in patterns:
        found.update(pattern.findall(text))
for name in sorted(found):
    print(name)
