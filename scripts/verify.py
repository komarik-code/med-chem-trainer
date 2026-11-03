#!/usr/bin/env python3
"""
Незалежна звірка public/data/*.json з вихідними RTF.

RTF конвертується LibreOffice у звичайний текст (інший шлях, ніж у convert.py),
після чого для кожного питання порівнюються: номер, текст питання, текст усіх
варіантів (без форматування) і позначка правильної відповіді (*).
"""
from __future__ import annotations

import html
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data"


def norm(s: str) -> str:
    s = re.sub(r"<img[^>]*>", "", s)
    s = html.unescape(re.sub(r"<[^>]+>", "", s))
    return re.sub(r"\s+", "", s.replace(" ", " "))


def norm_src(s: str) -> str:
    return re.sub(r"\s+", "", s.replace("\u00a0", " "))


def parse_txt(path: Path) -> dict[int, dict]:
    t = path.read_text(encoding="utf-8-sig")
    t = t[t.index("Перелік питань:") + len("Перелік питань:"):]
    out: dict[int, dict] = {}
    for m in re.finditer(r"^(\d+)\.\t(.*?)(?=^\d+\.\t|\Z)", t, re.M | re.S):
        num, body = int(m.group(1)), m.group(2)
        parts = re.split(r"^([A-Z])\. ?\t?(\*?)", body, flags=re.M)
        q = {"text": norm_src(parts[0]), "options": []}
        for i in range(1, len(parts), 3):
            q["options"].append((parts[i], parts[i + 1] == "*", norm_src(parts[i + 2])))
        out[num] = q
    return out


def main() -> int:
    index = json.loads((DATA / "index.json").read_text(encoding="utf-8"))
    errors, total_src, total_json = [], 0, 0
    with tempfile.TemporaryDirectory() as td:
        for cat in index["categories"]:
            rtf = ROOT / "sources" / f"{cat['id']}.rtf"
            subprocess.run(["soffice", "--headless", "--convert-to", "txt:Text", "--outdir", td, str(rtf)],
                           check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            src = parse_txt(Path(td) / f"{cat['id']}.txt")
            data = json.loads((ROOT / "public" / cat["file"]).read_text(encoding="utf-8"))
            qs = {q["number"]: q for q in data["questions"]}
            ids = [q["id"] for q in data["questions"]]
            if len(ids) != len(set(ids)):
                errors.append(f"[{cat['id']}] неунікальні id")
            if cat["count"] != len(data["questions"]):
                errors.append(f"[{cat['id']}] count в index.json не збігається")
            total_src += len(src)
            total_json += len(qs)
            missing = sorted(set(src) - set(qs))
            for n in missing:
                usable = sum(1 for o in src[n]["options"] if o[2]) >= 2 and any(o[1] for o in src[n]["options"])
                if usable:
                    errors.append(f"[{cat['id']}] №{n} відсутнє в JSON, хоча в джерелі коректне")
                else:
                    print(f"[{cat['id']}] №{n}: у джерелі некоректне (немає варіантів/відповіді) — пропущено свідомо")
            for n, q in qs.items():
                s = src.get(n)
                if s is None:
                    errors.append(f"[{cat['id']}] №{n} є в JSON, але немає в джерелі")
                    continue
                if norm(q["text"]) != s["text"]:
                    errors.append(f"[{cat['id']}] №{n}: текст питання відрізняється")
                src_opts = [o for o in s["options"] if o[2] or o[1] or True]
                json_opts = {o["id"]: o for o in q["options"]}
                for letter, correct, text in src_opts:
                    jo = json_opts.get(letter)
                    if jo is None:
                        if text:
                            errors.append(f"[{cat['id']}] №{n}: втрачено варіант {letter}")
                        elif "<img" not in "".join(o["html"] for o in q["options"]):
                            errors.append(f"[{cat['id']}] №{n}: порожній варіант {letter} відсутній")
                        continue
                    if norm(jo["html"]) != text:
                        errors.append(f"[{cat['id']}] №{n}{letter}: текст варіанта відрізняється")
                    if text == "" and "<img" not in jo["html"]:
                        errors.append(f"[{cat['id']}] №{n}{letter}: порожній варіант без картинки")
                    if correct != (letter in q["correct"]):
                        errors.append(f"[{cat['id']}] №{n}{letter}: не збігається позначка правильності")
                if len(q["correct"]) == 0:
                    errors.append(f"[{cat['id']}] №{n}: немає правильної відповіді")
            print(f"[{cat['id']}] {cat['title']}: у джерелі {len(src)}, у JSON {len(qs)}")
    print(f"РАЗОМ: у джерелах {total_src}, у JSON {total_json}")
    if errors:
        print("\nПОМИЛКИ:")
        print("\n".join(errors))
        return 1
    print("OK: усі питання, варіанти і правильні відповіді збігаються з джерелом")
    return 0


if __name__ == "__main__":
    sys.exit(main())
