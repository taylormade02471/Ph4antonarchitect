from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]

required = [
    ROOT / "README.md",
    ROOT / "gpt" / "config.json",
    ROOT / "gpt" / "instructions.md",
    ROOT / "knowledge" / "taylormade-fragrance-gpt-operator-handoff.md",
]

missing = [str(path.relative_to(ROOT)) for path in required if not path.exists()]

try:
    config = json.loads((ROOT / "gpt" / "config.json").read_text(encoding="utf-8"))
except Exception as exc:
    print(f"FAIL: invalid config.json: {exc}")
    sys.exit(1)

if missing:
    print("INCOMPLETE: missing required files:")
    for item in missing:
        print(f" - {item}")
    print("\nCopy the canonical handoff into knowledge/ before treating the repo as a complete backup.")
    sys.exit(2)

print("PASS: required repository files are present.")
print(f"GPT: {config.get('name')}")
