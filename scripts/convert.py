#!/usr/bin/env python3
"""
Конвертер баз тестів (RTF) у JSON для фронтенду.

Використання:
    python3 scripts/convert.py            # усі файли з sources/*.rtf

Кожен RTF у sources/ = одна категорія. Ідентифікатор категорії = ім'я файлу
без розширення (наприклад, 6902.rtf -> "6902"). Назва категорії береться з
заголовка самого файлу (рядок після "Назва наукового напрямку (модуля)").

Пайплайн: RTF --(LibreOffice headless)--> HTML --(цей скрипт)--> JSON.
HTML потрібен, щоб зберегти верхні/нижні індекси (<sup>/<sub>) і картинки.

Результат:
    public/data/index.json        – список категорій
    public/data/<id>.json         – питання категорії
    public/data/img/*             – картинки з питань
    scripts/conversion-report.txt – звіт перевірки
"""
from __future__ import annotations

import hashlib
import html
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "sources"
OUT = ROOT / "public" / "data"
IMG_OUT = OUT / "img"
REPORT = ROOT / "scripts" / "conversion-report.txt"

ALLOWED_INLINE = {"sub", "sup", "b", "strong", "i", "em", "u"}
LETTER_RE = re.compile(r"^([A-ZА-Я])\.\s*(\*?)\s*$")
NUMBER_RE = re.compile(r"^(\d+)\.\s*$")


# --------------------------------------------------------------------------
# HTML -> рядки таблиці
# --------------------------------------------------------------------------
class TableParser(HTMLParser):
    """Збирає всі <tr> як список комірок. Кожна комірка = очищений HTML."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.rows: list[list[str]] = []
        self._row: list[str] | None = None
        self._cell: list[str] | None = None
        self._paras: list[str] = []
        self._depth = 0

    # Комірка може містити кілька <p>; збираємо їх окремо і з'єднуємо <br>.
    def _flush_para(self) -> None:
        if self._cell is not None:
            self._paras.append("".join(self._cell))
            self._cell = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "tr":
            self._row = []
        elif tag == "td" and self._row is not None:
            self._cell = []
            self._paras = []
        elif self._cell is None:
            return
        elif tag == "p":
            self._flush_para()
        elif tag == "br":
            self._cell.append("<br>")
        elif tag in ALLOWED_INLINE:
            t = {"strong": "b", "em": "i"}.get(tag, tag)
            self._cell.append(f"<{t}>")
        elif tag == "img":
            src = unquote(a.get("src", ""))
            self._cell.append(f"\x00IMG:{src}:{a.get('width','')}:{a.get('height','')}\x00")

    def handle_endtag(self, tag):
        if tag == "td" and self._cell is not None and self._row is not None:
            self._flush_para()
            self._row.append(self._paras)
            self._cell = None
        elif tag == "tr" and self._row is not None:
            self.rows.append(self._row)
            self._row = None
        elif self._cell is not None and tag in ALLOWED_INLINE:
            t = {"strong": "b", "em": "i"}.get(tag, tag)
            self._cell.append(f"</{t}>")

    def handle_data(self, data):
        if self._cell is not None:
            self._cell.append(html.escape(data, quote=False))


def clean_fragment(s: str) -> str:
    """Нормалізує пробіли, прибирає порожні/зайві теги. Текст не змінюється."""
    s = s.replace(" ", " ")
    s = re.sub(r"\s+", " ", s)
    # порожні теги типу <sup></sup> або <sup> </sup>
    for _ in range(3):
        s = re.sub(r"<(sub|sup|b|i|u)>(\s*)</\1>", r"\2", s)
        # злиття сусідніх однакових тегів: </sup><sup> -> ''
        s = re.sub(r"</(sub|sup|b|i|u)>(\s*)<\1>", r"\2", s)
    s = re.sub(r"(<br>\s*)+$", "", s)
    s = re.sub(r"^(\s*<br>)+", "", s)
    return s.strip()


def cell_html(paras: list[str]) -> str:
    parts = [clean_fragment(p) for p in paras]
    parts = [p for p in parts if re.sub(r"<[^>]+>", "", p).strip() or "\x00IMG" in p]
    return "<br>".join(parts)


def has_content(s: str) -> bool:
    return bool(plain(s)) or "<img" in s or "\x00IMG" in s


def plain(s: str) -> str:
    s = re.sub(r"\x00IMG:[^\x00]*\x00", "[img]", s)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s))).strip()


# --------------------------------------------------------------------------
# Обробка одного файлу
# --------------------------------------------------------------------------
# Таблиця кодування шрифту Symbol → Unicode (Adobe Symbol encoding, найуживаніші символи)
SYMBOL_MAP = {
    **dict(zip("ABGDEZHQIKLMNXOPRSTUFCYW", "ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ")),
    **dict(zip("abgdezhqiklmnxoprstufcyw", "αβγδεζηθικλμνξοπρστυφχψω")),
    "J": "ϑ", "j": "φ", "v": "ϖ", "V": "ς",
    0xA3: "≤", 0xA5: "∞", 0xAB: "↔", 0xAC: "←", 0xAD: "↑", 0xAE: "→", 0xAF: "↓",
    0xB0: "°", 0xB1: "±", 0xB3: "≥", 0xB4: "×", 0xB5: "∝", 0xB6: "∂", 0xB7: "•", 0xB8: "÷",
    0xB9: "≠", 0xBA: "≡", 0xBB: "≈", 0xBC: "…", 0xD6: "√", 0xD7: "⋅", 0xD5: "∏", 0xE5: "∑",
    0xDB: "⇔", 0xDC: "⇐", 0xDD: "⇑", 0xDE: "⇒", 0xDF: "⇓", 0xF2: "∫",
}
_RTF_TOKEN = re.compile(rb"\\'[0-9a-fA-F]{2}|\\[a-zA-Z]+-?\d* ?|\\.|[{}]|[^\\{}]", re.S)


def _u(ch: str) -> bytes:
    return f"\\u{ord(ch)}?".encode()


def _symbol_runs_to_unicode(raw: bytes) -> bytes:
    """Текст, набраний шрифтом Symbol (\\fcharset2), LibreOffice відкидає. Переводимо його в \\uNNNN."""
    fonts = re.findall(rb"\{\\f(\d+)\\fcharset2 Symbol\}", raw)
    if not fonts:
        return raw
    sym = {f"\\f{n.decode()}".encode() for n in fonts}
    # таблицю шрифтів не чіпаємо — обробляємо лише текст після неї
    i = raw.find(b"{\\fonttbl")
    head_end = raw.find(b"}}", i) + 2 if i >= 0 else 0
    head, body = raw[:head_end], raw[head_end:]
    out, in_sym = [head], False
    for m in _RTF_TOKEN.finditer(body):
        tok = m.group(0)
        word = re.match(rb"\\f\d+", tok)
        if word and re.fullmatch(rb"\\f\d+ ?", tok):
            in_sym = word.group(0) in sym
            out.append(tok)
        elif tok in (b"{", b"}"):
            in_sym = False
            out.append(tok)
        elif in_sym and tok.startswith(b"\\'"):
            ch = SYMBOL_MAP.get(int(tok[2:], 16))
            out.append(_u(ch) if ch else tok)
        elif in_sym and len(tok) == 1 and chr(tok[0]) in SYMBOL_MAP:
            out.append(_u(SYMBOL_MAP[chr(tok[0])]))
        else:
            out.append(tok)
    return b"".join(out)


def fix_font_charsets(raw: bytes) -> bytes:
    """
    Виправлення шрифтів у RTF перед конвертацією (оригінальний файл не змінюється):
    1) «Cambria Math» оголошено з \\fcharset1, хоча байти під ним — кирилиця cp1251
       («каталізатор», «(г)») — LibreOffice декодує їх як сміття (�). Ставимо кодування 204.
    2) Символи шрифту Symbol (⇔, →, Δ, υ…) LibreOffice відкидає — переводимо їх у Unicode.
    """
    raw = re.sub(rb"(\\f\d+)\\fcharset1( Cambria Math)", rb"\1\\fcharset204\2", raw)
    return _symbol_runs_to_unicode(raw)


def rtf_to_html(rtf: Path, tmp: Path) -> Path:
    patched = tmp / rtf.name
    patched.write_bytes(fix_font_charsets(rtf.read_bytes()))
    subprocess.run(
        ["soffice", "--headless", "--convert-to", "html", "--outdir", str(tmp), str(patched)],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    out = tmp / (rtf.stem + ".html")
    if not out.exists():
        raise RuntimeError(f"LibreOffice не створив {out}")
    return out


def short_hash(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:10]


def process(rtf: Path, tmp: Path, report: list[str]) -> dict:
    cat_id = rtf.stem
    html_path = rtf_to_html(rtf, tmp)
    parser = TableParser()
    parser.feed(html_path.read_text(encoding="utf-8", errors="replace"))
    rows = [[cell_html(c) for c in r] for r in parser.rows]

    # --- метадані категорії
    title, description = cat_id, ""
    for i, r in enumerate(rows):
        joined = plain(" ".join(r))
        if "Назва наукового напрямку" in joined and i + 1 < len(rows):
            title = plain(" ".join(rows[i + 1]))
        if joined.startswith("Опис") and i + 1 < len(rows):
            description = plain(" ".join(rows[i + 1]))

    # --- питання
    images_map: dict[str, str] = {}

    def resolve_images(s: str) -> str:
        def repl(m: re.Match) -> str:
            src, w, h = m.group(1), m.group(2), m.group(3)
            srcp = tmp / Path(src).name
            if not srcp.exists():
                report.append(f"  ! картинка не знайдена: {src}")
                return "[зображення відсутнє]"
            if src not in images_map:
                digest = hashlib.sha1(srcp.read_bytes()).hexdigest()[:12]
                name = f"{cat_id}-{digest}{srcp.suffix.lower()}"
                shutil.copyfile(srcp, IMG_OUT / name)
                images_map[src] = name
            # картинки з бази дрібні (≈60–140 px) — збільшуємо в 1.5 раза для читабельності на телефоні
            scale = lambda v: str(round(int(v) * 1.5)) if v.isdigit() else v
            size = (f' width="{scale(w)}"' if w else "") + (f' height="{scale(h)}"' if h else "")
            return f'<img src="data/img/{images_map[src]}"{size} alt="зображення з бази">'
        return re.sub(r"\x00IMG:([^:\x00]*):([^:\x00]*):([^:\x00]*)\x00", repl, s)

    raw: list[dict] = []
    cur: dict | None = None
    started = False
    for r in rows:
        if not started:
            if "Перелік питань" in plain(" ".join(r)):
                started = True
            continue
        if len(r) < 2:
            continue
        label, body = plain(r[0]), r[1]
        for extra in r[2:]:
            if extra:
                body = (body + "<br>" + extra) if body else extra
        m_num = NUMBER_RE.match(label)
        m_let = LETTER_RE.match(label)
        if m_num:
            cur = {"number": int(m_num.group(1)), "text": body, "options": []}
            raw.append(cur)
        elif m_let and cur is not None:
            cur["options"].append({"letter": m_let.group(1), "html": body, "correct": bool(m_let.group(2))})
        elif label or plain(body):
            report.append(f"  ? нерозпізнаний рядок: [{label}] {plain(body)[:80]}")

    report.append(f"[{cat_id}] {title}")
    report.append(f"  знайдено блоків питань: {len(raw)}")
    nums = [q["number"] for q in raw]
    if nums != list(range(1, len(nums) + 1)):
        report.append("  ! нумерація питань не послідовна")

    questions, skipped, seen = [], [], {}
    for q in raw:
        q["text"] = resolve_images(q["text"])
        for o in q["options"]:
            o["html"] = resolve_images(o["html"])
        valid_opts = [o for o in q["options"] if has_content(o["html"])]
        lost_correct = [o for o in q["options"] if o["correct"] and not has_content(o["html"])]
        if lost_correct and valid_opts and len(valid_opts) >= 2:
            raise RuntimeError(f"[{cat_id}] №{q['number']}: правильний варіант порожній — перевірте джерело")
        n_correct = sum(o["correct"] for o in q["options"])
        if len(valid_opts) < 2 or n_correct == 0:
            skipped.append(q)
            report.append(
                f"  ✗ пропущено №{q['number']}: варіантів з текстом={len(valid_opts)}, "
                f"правильних={n_correct} — «{plain(q['text'])[:70]}»"
            )
            continue
        if len(valid_opts) != len(q["options"]):
            report.append(f"  ! №{q['number']}: є порожні варіанти (прибрано)")
        # ключ для ID: текст + варіанти; у картинок лишаємо тільки ім'я файлу (ім'я = хеш вмісту),
        # щоб зміна відображення (розмір, alt) не змінювала ID і не губила історію відповідей
        strip_img = lambda h: re.sub(r'<img src="([^"]+)"[^>]*>', r"[img:\1]", h)
        key = unicodedata.normalize("NFC", strip_img(q["text"]) + "||" + "||".join(strip_img(o["html"]) for o in valid_opts))
        base_id = f"{cat_id}-{short_hash(key)}"
        seen[base_id] = seen.get(base_id, 0) + 1
        qid = base_id if seen[base_id] == 1 else f"{base_id}-{seen[base_id]}"
        if seen[base_id] > 1:
            report.append(f"  · №{q['number']}: дослівний дубль попереднього питання (збережено, id {qid})")
        questions.append({
            "id": qid,
            "number": q["number"],
            "text": q["text"],
            "options": [{"id": o["letter"], "html": o["html"]} for o in valid_opts],
            "correct": [o["letter"] for o in valid_opts if o["correct"]],
            "multiple": n_correct > 1,
        })

    broken = [q["number"] for q in questions if "\ufffd" in q["text"] or any("\ufffd" in o["html"] for o in q["options"])]
    if broken:
        raise RuntimeError(f"[{cat_id}] биті символи (�) у питаннях №{broken} — перевірте кодування шрифтів у RTF")
    multi = sum(q["multiple"] for q in questions)
    report.append(f"  збережено питань: {len(questions)}; пропущено: {len(skipped)}; "
                  f"з кількома правильними: {multi}; картинок: {len(images_map)}")
    return {"id": cat_id, "title": title, "description": description,
            "questions": questions, "skipped": len(skipped), "rawCount": len(raw)}


def main() -> int:
    if not shutil.which("soffice"):
        print("Потрібен LibreOffice (команда soffice).", file=sys.stderr)
        return 1
    files = sorted(SOURCES.glob("*.rtf"))
    if not files:
        print("У sources/ немає .rtf файлів", file=sys.stderr)
        return 1
    if IMG_OUT.exists():
        shutil.rmtree(IMG_OUT)
    IMG_OUT.mkdir(parents=True)
    for old in OUT.glob("*.json"):
        old.unlink()

    report: list[str] = []
    index = []
    with tempfile.TemporaryDirectory() as td:
        for f in files:
            sub = Path(td) / f.stem
            sub.mkdir()
            cat = process(f, sub, report)
            data = {"id": cat["id"], "title": cat["title"], "description": cat["description"],
                    "questions": cat["questions"]}
            (OUT / f"{cat['id']}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
            index.append({"id": cat["id"], "title": cat["title"], "description": cat["description"],
                          "count": len(cat["questions"]), "file": f"data/{cat['id']}.json"})
            report.append("")
    (OUT / "index.json").write_text(json.dumps({"categories": index}, ensure_ascii=False, indent=1), encoding="utf-8")
    total = sum(c["count"] for c in index)
    report.append(f"РАЗОМ: категорій {len(index)}, питань {total}")
    REPORT.write_text("\n".join(report) + "\n", encoding="utf-8")
    print("\n".join(report))
    return 0


if __name__ == "__main__":
    sys.exit(main())
