#!/usr/bin/env python3
"""
Конвертер тестів з медичної біології (txt/pdf) у JSON для фронтенду.

Використання:
    python3 scripts/convert_bio.py [--src ПАПКА] [--dry-run]

ПАПКА — «Тести з біології (Крок)» (за замовчуванням
~/Стільниця/фігня/тані/2026-11-16/Тести з біології (Крок), або змінна BIO_SRC).
Скрипт лише читає джерела; пише тільки свої файли:

    public/data/bio-*.json         – питання категорій біології
    public/data/img/bio-*.jpg      – рисунки
    public/data/index.json         – записи bio-* оновлюються, решта (хімія) лишається
    scripts/conversion-report-bio.txt – звіт: що пропущено і чому, дублі, розбіжності ключів

Увага: scripts/convert.py (хімія) очищає public/data повністю, тож після нього
потрібно ще раз запустити цей скрипт (npm run convert:bio).

Джерела й розбір:
  Розділ «Медична біологія — ТНМУ»:
    bio-tnmu-book  – «Тести з біології — повний текст.txt» (✓ у кінці правильного варіанта)
                     + питання бази пре-кроку кафедри, яких немає в книжці (ANSWER: X)
    bio-tnmu-ct    – Банк тестів Центру тестування (укр, ANSWER: X), без дублів з попередніми
    bio-tnmu-prof  – Банк тестів професійного спрямування (англ, ANSWER: X), без дублів
  Розділ «Медична біологія — бази Крок»: ХНМУ укр/англ, ОНМедУ 1–3 (зірочка *),
  СумДУ англ (OCR, «Correct answer»). Без дублів з розділом ТНМУ і між собою.

Питання потрапляє в базу, лише якщо розібрано рівно 5 непорожніх варіантів A–E
і рівно одну правильну відповідь. Усе інше — у звіт.
"""
from __future__ import annotations

import argparse
import difflib
import hashlib
import html
import json
import os
import re
import subprocess
import sys
import tempfile
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data"
IMG_OUT = OUT / "img"
REPORT = ROOT / "scripts" / "conversion-report-bio.txt"
DEFAULT_SRC = Path.home() / "Стільниця/фігня/тані/2026-11-16/Тести з біології (Крок)"

LETTERS = "ABCDE"
# кирилиця, схожа на латинські літери варіантів
LOOKALIKE = {"А": "A", "В": "B", "С": "C", "Е": "E", "Д": "D"}

SECTION_TNMU = "Медична біологія — ТНМУ"
SECTION_EXTRA = "Медична біологія — бази Крок"

CATEGORIES = [
    # id, назва (main у дужках показується на картці), опис
    ("bio-tnmu-book", f"{SECTION_TNMU} (практикум і пре-крок)",
     "Лабораторний практикум ТНМУ, заняття 1–13, + база пре-кроку кафедри"),
    ("bio-tnmu-ct", f"{SECTION_TNMU} (банк Центру тестування)", "База кафедри ТНМУ, укр."),
    ("bio-tnmu-prof", f"{SECTION_TNMU} (банк професійного спрямування)", "База кафедри ТНМУ, англ."),
    ("bio-knmu-uk", f"{SECTION_EXTRA} (ХНМУ, укр.)", "Збірник Крок-1 ХНМУ"),
    ("bio-knmu-en", f"{SECTION_EXTRA} (ХНМУ, англ.)", "Krok-1 test base ХНМУ 2016–2017"),
    ("bio-onmedu", f"{SECTION_EXTRA} (ОНМедУ, розділи 1–3)", "Тести Крок ОНМедУ"),
    ("bio-sumdu-en", f"{SECTION_EXTRA} (СумДУ, англ.)", "Test Items on Medical Biology Krok-1 (2001–2019)"),
]


# --------------------------------------------------------------------------
# Загальне
# --------------------------------------------------------------------------
class Q:
    __slots__ = ("text", "options", "correct", "note", "img", "src", "where", "cat", "warn")

    def __init__(self, text, options, correct, src, where, note="", img=None):
        self.text: str = text            # вже HTML-безпечний (<br> між рядками)
        self.options: list[str] = options
        self.correct: int = correct
        self.note = note
        self.img = img
        self.src = src
        self.where = where
        self.cat = ""
        self.warn: list[str] = []


class Report:
    def __init__(self):
        self.lines: list[str] = []

    def __call__(self, s=""):
        self.lines.append(s)


def esc(s: str) -> str:
    return html.escape(s, quote=False)


def clean_line(s: str) -> str:
    s = unicodedata.normalize("NFC", s).replace(" ", " ").replace("­", "")
    return re.sub(r"[ \t]+", " ", s).strip()


def join_wrapped(parts: list[str]) -> str:
    """З'єднує рядки, розірвані версткою PDF (зі зняттям переносів слів)."""
    out = ""
    for p in parts:
        p = p.strip()
        if not p:
            continue
        if out.endswith("-") and len(out) > 1 and out[-2].isalpha() and p[:1].islower():
            out = out[:-1] + p
        else:
            out = f"{out} {p}" if out else p
    return re.sub(r"\s+", " ", out).strip()


def strip_opt_tail(s: str) -> str:
    s = s.strip()
    return re.sub(r"\s*[;,]$", "", s)


# кирилиця, схожа на латиницю → латиниця (однаково для обох сторін порівняння)
_HOMO = str.maketrans("асеіорхукАСЕІОРХКМНТВ", "aceiopxykACEIOPXKMHTB")


def norm(s: str) -> str:
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s).lower().replace("ё", "е")
    return re.sub(r"[^\w]+", "", s.translate(_HOMO))


def norm_opt(s: str) -> str:
    s = html.unescape(re.sub(r"<[^>]+>", " ", s)).replace("–", "-").replace("−", "-")
    return re.sub(r"[\s.,;:'’`\"«»()]+", "", s.translate(_HOMO))


def digits(s: str) -> list[str]:
    return sorted(re.findall(r"\d+", html.unescape(re.sub(r"<[^>]+>", " ", s))))


def words(s: str) -> set[str]:
    s = re.sub(r"<[^>]+>", " ", html.unescape(s)).lower()
    return {w for w in re.findall(r"\w{5,}", s)}


def short_hash(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:10]


# --------------------------------------------------------------------------
# Розбір рядків з варіантами A–E (спільне для баз)
# --------------------------------------------------------------------------
OPT_RE = re.compile(r"^(\*?)\s*([A-EАВСЕ])\s*(\*?)\s*[.,)]\s*(\*?)\s*(.*)$")
INLINE_OPT_RE = re.compile(r"\s([A-EАВСЕ])\s*(\*?)\s*\.\s*(\*?)\s*(?=\S)")


def letter_of(ch: str) -> str:
    return LOOKALIKE.get(ch, ch)


def split_lettered(lines: list[str], star: bool):
    """Повертає (stem_lines, options[[text_parts, starred]], problems[])."""
    stem: list[str] = []
    opts: list[list] = []
    tail: list[str] = []
    problems: list[str] = []
    for raw in lines:
        s = clean_line(raw)
        if not s:
            continue
        exp = LETTERS[len(opts)] if len(opts) < 5 else None
        # «A. D.Golgi apparatus» — зайва літера перед справжньою
        mi = re.match(r"^([A-EАВСЕ])\s*\.\s*([A-EАВСЕ])\s*\.\s*(.*)$", s)
        if mi and stem and exp and letter_of(mi.group(2)) == exp and letter_of(mi.group(1)) != exp:
            s = f"{exp}. {mi.group(3)}"
            problems.append(f"виправлено: «{mi.group(1)}. {mi.group(2)}.» → {exp}")
        m = OPT_RE.match(s)
        # останній варіант з повтореною літерою («D.» двічі) → E
        if (m and stem and exp == "E" and letter_of(m.group(2)) == "D"):
            problems.append("виправлено: другий «D.» → E")
            s = "E" + s[s.index(m.group(2)) + 1:]
            m = OPT_RE.match(s)
        if m and stem and exp and letter_of(m.group(2)) == exp:
            starred = bool(m.group(1) or m.group(3) or m.group(4))
            body = m.group(5)
            # подвійна літера: «A. A. Рибосоми»
            body = re.sub(rf"^{exp}\s*\.\s*", "", body) if re.match(rf"^{exp}\s*\.\s+\S", body) else body
            if body.startswith("*"):
                starred, body = True, body[1:].strip()
            body = re.sub(r"^[A-EАВСЕ]\.(?=\S)", "", body)  # «B.Pleiotropy»
            opts.append([[body], starred])
            # приклеєні варіанти в одному рядку: «C. foo D. bar»
            while len(opts) < 5:
                nxt = LETTERS[len(opts)]
                cur = " ".join(opts[-1][0])
                mm = next((x for x in INLINE_OPT_RE.finditer(" " + cur) if letter_of(x.group(1)) == nxt), None)
                if not mm:
                    break
                before = (" " + cur)[: mm.start()].strip()
                after = (" " + cur)[mm.end():].strip()
                if not before or not after:
                    break
                opts[-1][0] = [before]
                opts.append([[after], bool(mm.group(2) or mm.group(3))])
                problems.append("приклеєні варіанти розділено")
            continue
        if m and opts and len(opts) < 5 and letter_of(m.group(2)) in LETTERS:
            problems.append(f"варіант «{m.group(2)}.» не на своєму місці (очікувався {exp})")
        if m and len(opts) == 5 and letter_of(m.group(2)) in LETTERS:
            problems.append(f"зайвий варіант «{m.group(2)}.»")
        if len(opts) == 5:
            tail.append(s)
        elif opts:
            opts[-1][0].append(s)
        else:
            stem.append(s)
    # хвіст після E: продовження варіанта лише якщо починається з малої літери
    for s in tail:
        if s[:1].islower() and not problems:
            opts[-1][0].append(s)
        else:
            break
    return stem, [[join_wrapped(p), st] for p, st in opts], problems


def is_soft(p: str) -> bool:
    return p.startswith("виправлено") or p == "приклеєні варіанти розділено"


def finish(stem_lines, opts, correct_letter, problems, src, where, rep_fail, star_mode=False, stem_html=None):
    """Перевірка й побудова Q. correct_letter=None → брати з зірочок."""
    text = stem_html if stem_html is not None else esc(join_wrapped(stem_lines))
    if star_mode:
        stars = [i for i, (_, st) in enumerate(opts) if st]
        correct = stars[0] if len(stars) == 1 else None
        if len(stars) != 1:
            problems = problems + [f"позначених правильних: {len(stars)}"]
    else:
        correct = LETTERS.index(correct_letter) if correct_letter in LETTERS else None
        if correct is None:
            problems = problems + [f"незрозуміла відповідь «{correct_letter}»"]
        if any(st for _, st in opts):
            problems = problems + ["зайва зірочка у варіанті"]
    if len(opts) != 5:
        problems = problems + [f"варіантів: {len(opts)}"]
    elif any(not t.strip() for t, _ in opts):
        problems = problems + ["порожній варіант"]
    elif len({norm_opt(t) for t, _ in opts}) < 5:
        problems = problems + ["однакові варіанти"]
    if not norm(text):
        problems = problems + ["порожня умова"]
    hard = [p for p in problems if not is_soft(p)]
    if hard:
        rep_fail(src, where, text, hard)
        return None
    q = Q(text, [esc(strip_opt_tail(t)) for t, _ in opts], correct, src, where)
    q.warn = [p for p in problems if is_soft(p)]
    return q


# --------------------------------------------------------------------------
# Книжка (повний текст з ✓)
# --------------------------------------------------------------------------
KEEP_NOTE = re.compile(r"кафедри ТНМУ|ключ")


book_warn: list[str] = []


def parse_book(path: Path, img_map: dict[str, str], rep_fail) -> list[Q]:
    lines = path.read_text(encoding="utf-8").splitlines()
    out: list[Q] = []
    lesson = 0
    cur = None  # dict(num, stem[], opts[], notes[], img)

    def flush():
        nonlocal cur
        if not cur:
            return
        opts = cur["opts"]
        marks = [i for i, o in enumerate(opts) if o[1]]
        problems = []
        if len(marks) != 1:
            problems.append(f"позначок ✓: {len(marks)}")
        letters = "".join(o[2] for o in opts)
        if letters == "ABCDD":  # друкарська помилка книжки: «D.» двічі
            opts[4] = (opts[4][0], opts[4][1], "E")
            letters = LETTERS
            book_warn.append(f"заняття {lesson}, №{cur['num']}: другий «D.» прочитано як E")
        if letters == "ABCD":
            book_warn.append(f"заняття {lesson}, №{cur['num']}: лише 4 варіанти (E у книжці відсутній) — додано")
        elif letters != LETTERS:
            problems.append(f"літери варіантів: {letters}")
        where = f"заняття {lesson}, №{cur['num']}"
        stem_html = "<br>".join(esc(s) for s in cur["stem"])
        if cur["img"]:
            stem_html += f'<br><img src="{cur["img"]}" alt="Рисунок">'
        if problems or len(opts) not in (4, 5):
            rep_fail("книжка", where, stem_html, problems or [f"варіантів: {len(opts)}"])
        else:
            q = Q(stem_html, [esc(t) for t, _, _ in opts], marks[0], "книжка", where)
            notes = cur["expl"] + [n for n in cur["notes"] if KEEP_NOTE.search(n)]
            q.note = "<br>".join(esc(n) for n in notes)
            out.append(q)
        cur = None

    for raw in lines:
        s = raw.strip()
        if not s:
            continue
        m = re.match(r"^ЗАНЯТТЯ\s*№\s*(\d+)", s)
        if m:
            flush()
            lesson = int(m.group(1))
            continue
        m = re.match(r"^(\d+)\.\s+(.*)$", s)
        if m and (cur is None or len(cur["opts"]) >= 4) and lesson:
            flush()
            cur = {"num": int(m.group(1)), "stem": [m.group(2)], "opts": [], "notes": [], "expl": [], "img": None}
            continue
        if cur is None:
            continue
        m = re.match(r"^\[РИСУНОК\s+\d+:.*—\s*(рисунки/[^\]]+)\]$", s)
        if m:
            cur["img"] = img_map[m.group(1)]
            continue
        if s.startswith("(") and s.endswith(")"):
            cur["notes"].append(s[1:-1])
            continue
        if s.startswith("===="):
            continue
        m = re.match(r"^([A-E])\.\s*(.*)$", s)
        if m and len(cur["opts"]) == 4 and m.group(1) == "D":
            m = re.match(r"^(D)\.\s*(.*)$", s)
        elif m and not (len(cur["opts"]) < 5 and m.group(1) == LETTERS[len(cur["opts"])]):
            m = None
        if m:
            body = m.group(2)
            ok = body.endswith("✓")
            body = body.rstrip("✓ ").strip()
            body = re.sub(r"\.$", "", body) if not re.search(r"\d\.$", body) else body
            cur["opts"].append((body, ok, m.group(1)))
            continue
        if len(cur["opts"]) >= 4:
            cur["expl"].append(s)  # розв'язок під варіантами → пояснення
        elif cur["opts"]:
            rep_fail("книжка", f"заняття {lesson}, №{cur['num']}", s, ["рядок між варіантами не розпізнано"])
        else:
            cur["stem"].append(s)
    flush()
    return out


def prepare_images(src: Path, dry: bool) -> dict[str, str]:
    """рисунки/рис-N → data/img/bio-<hash>.jpg (стиснуто до 1600 px)."""
    mapping = {}
    for f in sorted((src / "рисунки").glob("рис-*")):
        key = "рисунки/" + f.name.split(" ")[0]
        digest = hashlib.sha1(f.read_bytes()).hexdigest()[:12]
        name = f"bio-{digest}.jpg"
        mapping[key] = f"data/img/{name}"
        if not dry:
            IMG_OUT.mkdir(parents=True, exist_ok=True)
            subprocess.run(["magick", str(f), "-auto-orient", "-resize", "1600x1600>", "-strip",
                            "-quality", "82", str(IMG_OUT / name)], check=True)
    return mapping


# --------------------------------------------------------------------------
# Бази ТНМУ (ANSWER: X)
# --------------------------------------------------------------------------
def parse_answer_base(path: Path, src: str, rep_fail) -> list[Q]:
    text = path.read_text(encoding="utf-8").replace("\f", "\n")
    out: list[Q] = []
    block: list[str] = []
    n = 0
    for raw in text.splitlines():
        s = clean_line(raw)
        if re.fullmatch(r"\d{1,3}", s) or re.match(r"^ЗАНЯТТЯ\s*№", s):
            continue
        m = re.match(r"^ANSWER\s*:\s*(\S*)", s)
        if m:
            n += 1
            ans = letter_of(m.group(1).strip(".").upper()[:2])
            stem, opts, problems = split_lettered(block, star=False)
            q = finish(stem, opts, ans, problems, src, f"блок {n}", rep_fail)
            if q:
                out.append(q)
            block = []
            continue
        block.append(s)
    if any(clean_line(b) for b in block):
        rep_fail(src, "кінець файлу", esc(join_wrapped(block))[:200], ["блок без ANSWER"])
    return out


# --------------------------------------------------------------------------
# Бази з зірочкою (ХНМУ, ОНМедУ)
# --------------------------------------------------------------------------
NUM_RE = re.compile(r"^(\d{1,4})\s*\.\s*(.*)$")
PAGE_RE = re.compile(r"^[-–~\s]*\d{1,4}[-–~\s]*$")


def parse_star_text(text: str, src: str, rep_fail) -> list[Q]:
    out: list[Q] = []
    cur: list[str] | None = None
    num = ""

    def flush():
        if cur is None:
            return
        stem, opts, problems = split_lettered(cur, star=True)
        q = finish(stem, opts, None, problems, src, f"№{num}", rep_fail, star_mode=True)
        if q:
            out.append(q)

    for raw in text.replace("\f", "\n").splitlines():
        s = clean_line(raw)
        if not s or PAGE_RE.match(s):
            continue
        m = NUM_RE.match(s)
        if m:
            opts_now = sum(1 for x in (cur or []) if OPT_RE.match(clean_line(x)))
            if cur is None or opts_now >= 5:
                flush()
                cur, num = [m.group(2)], m.group(1)
                continue
        if cur is not None:
            cur.append(s)
    flush()
    return out


def pdf_text(pdf: Path, tmp: Path) -> str:
    dst = tmp / (short_hash(str(pdf)) + ".txt")
    subprocess.run(["pdftotext", "-enc", "UTF-8", str(pdf), str(dst)], check=True)
    return dst.read_text(encoding="utf-8")


# --------------------------------------------------------------------------
# СумДУ (OCR): маркери без літер, відповідь після «Correct answer»
# --------------------------------------------------------------------------
BULLET_RE = re.compile(r"^[*«»•o°=+\-©®·eс]\s+(\S.*)$")
SUMDU_PAGE_RE = re.compile(r"^[-–~»«*.\s]*\d{1,4}[\s\-–~.,'\"]*$")
JUNK_RE = re.compile(r"^(k|kok|krok|кгок)\b.*(biology|blology|biolog)", re.I)


EN_WORD = re.compile(r"[A-Za-z]+")
ALLOWED_CHARS = re.compile(r"^[A-Za-z0-9 .,;:'’\"“”()%/+\-–—?!\[\]×=<>°µ]*$")


def find_en_dict(explicit: str | None) -> Path:
    cands = [explicit] if explicit else []
    cands += ["/usr/share/hunspell/en_US.dic", "/usr/share/myspell/en_US.dic"]
    cands += sorted(str(p) for p in Path("/var/lib/flatpak/runtime").glob("*/*/*/*/files/share/hunspell/en_US.dic"))
    for c in cands:
        if c and Path(c).exists():
            return Path(c)
    raise SystemExit("Не знайдено англійський словник hunspell (en_US.dic). Вкажіть --en-dict ШЛЯХ")


SUFFIXES = [("est", ""), ("ies", "y"), ("ied", "y"), ("es", ""), ("s", ""), ("ed", ""), ("ed", "e"), ("ing", ""),
            ("ing", "e"), ("ly", ""), ("er", ""), ("ers", ""), ("al", ""), ("ic", ""), ("ous", ""), ("ion", "e")]


def in_vocab(lw: str, vocab: set[str]) -> bool:
    if lw in vocab:
        return True
    return any(lw.endswith(a) and len(lw) - len(a) >= 3 and lw[: len(lw) - len(a)] + b in vocab
               for a, b in SUFFIXES)


def build_vocab(texts: list[str], sumdu_text: str, en_dict: Path) -> set[str]:
    """Словник: hunspell en_US + слова інших англ. баз + часті (≥5) слова самого СумДУ."""
    vocab = {w.lower() for t in texts for w in EN_WORD.findall(t)}
    for line in en_dict.read_text(encoding="utf-8", errors="ignore").splitlines()[1:]:
        w = line.split("/")[0].strip()
        if w.isalpha():
            vocab.add(w.lower())
    freq: dict[str, int] = defaultdict(int)
    for w in EN_WORD.findall(sumdu_text):
        freq[w.lower()] += 1
    vocab |= {w for w, c in freq.items() if c >= 3}
    return vocab


def ocr_fix(s: str, vocab: set[str], fixes: list[str]) -> tuple[str, list[str]]:
    """Склеює переноси «chromo- some», виправляє однозначні c↔e; повертає (рядок, невідомі слова)."""
    s = re.sub(r"([A-Za-z]+)- ([a-z]+)",
               lambda m: m[1] + m[2] if (m[1] + m[2]).lower() in vocab else m[0], s)
    bad: list[str] = []

    def word(m: re.Match) -> str:
        w = m.group(0)
        lw = w.lower()
        if in_vocab(lw, vocab) or len(w) == 1:
            return w
        pos = [i for i, ch in enumerate(lw) if ch in "ce"]
        cands = set()
        if 0 < len(pos) <= 6:
            for mask in range(1, 1 << len(pos)):
                t = list(lw)
                for b, i in enumerate(pos):
                    if mask >> b & 1:
                        t[i] = "e" if t[i] == "c" else "c"
                cand = "".join(t)
                if in_vocab(cand, vocab):
                    cands.add(cand)
        if len(cands) == 1:
            c = cands.pop()
            fixed = "".join(cc.upper() if wc.isupper() else cc for wc, cc in zip(w, c))
            fixes.append(f"{w}→{fixed}")
            return fixed
        bad.append(w)
        return w

    s = EN_WORD.sub(word, s)
    if not ALLOWED_CHARS.match(s):
        bad.append("символи: " + "".join(sorted({ch for ch in s if not ALLOWED_CHARS.match(ch)})))
    return s, bad


def parse_sumdu(path: Path, src: str, rep_fail, vocab: set[str], fixes: list[str]) -> list[Q]:
    lines = [clean_line(x) for x in path.read_text(encoding="utf-8").splitlines()]
    out: list[Q] = []
    i, n = 0, len(lines)
    while i < n:
        m = NUM_RE.match(lines[i])
        if not m or not m.group(2):
            i += 1
            continue
        num = m.group(1)
        stem = [m.group(2)]
        j = i + 1
        opts: list[list[str]] = []
        state = "stem"
        answer: list[str] | None = None
        problems: list[str] = []
        prev_blank = False
        while j < n:
            s = lines[j]
            if not s:
                prev_blank = True
                if state == "answer" and answer:
                    break
                j += 1
                continue
            blank, prev_blank = prev_blank, False
            if SUMDU_PAGE_RE.match(s) or JUNK_RE.match(s):
                if state == "answer" and answer:
                    break
                state = "await" if state == "opts" else state
                j += 1
                continue
            if re.match(r"^correct\s+answer", s, re.I):
                state = "answer"
                answer = []
                j += 1
                continue
            if NUM_RE.match(s) and (opts or state == "answer"):
                if state != "answer":
                    problems.append("немає рядка Correct answer")
                break
            b = BULLET_RE.match(s)
            if state == "answer":
                answer.append(b.group(1) if b and not answer else s)
            elif b and state in ("stem", "opts"):
                state = "opts"
                opts.append([b.group(1)])
            elif state == "opts":
                # варіант без розпізнаного маркера: після порожнього рядка — новий варіант
                if blank:
                    opts.append([s])
                else:
                    opts[-1].append(s)
            elif state == "stem":
                stem.append(s)
            j += 1
        # сміттєві «варіанти» з однієї літери (залишки маркерів/номерів сторінок)
        opts = [o for o in opts if not re.fullmatch(r"[A-Za-z|!.,~]{1,2}", " ".join(o).strip())]
        answer = join_wrapped(answer) if answer else None
        i = j
        where = f"№{num}"
        text = esc(join_wrapped(stem))
        if answer is None:
            rep_fail(src, where, text, problems or ["немає відповіді"])
            continue
        opts = [join_wrapped(o) for o in opts]
        hits = [k for k, o in enumerate(opts) if norm(o) == norm(answer)]
        if len(hits) != 1:
            close = [k for k, o in enumerate(opts)
                     if difflib.SequenceMatcher(None, norm(o), norm(answer)).ratio() >= 0.9]
            hits = close if len(close) == 1 else hits
        if len(opts) != 5:
            problems.append(f"варіантів: {len(opts)}")
        elif len(hits) != 1:
            problems.append(f"відповідь «{answer[:40]}» не збігається рівно з одним варіантом")
        elif len({norm_opt(o) for o in opts}) < 5:
            problems.append("однакові варіанти")
        if problems:
            rep_fail(src, where, text, problems)
            continue
        local_fixes: list[str] = []
        stem_s, bad = ocr_fix(join_wrapped(stem), vocab, local_fixes)
        opts_s = []
        for o in opts:
            o2, b2 = ocr_fix(strip_opt_tail(o), vocab, local_fixes)
            opts_s.append(o2)
            bad += b2
        if bad:
            rep_fail(src, where, text, ["OCR-сміття: " + ", ".join(sorted(set(bad))[:6])])
            continue
        if len({norm_opt(o) for o in opts_s}) < 5:
            rep_fail(src, where, text, ["однакові варіанти"])
            continue
        fixes += [f"{where}: {x}" for x in local_fixes]
        out.append(Q(esc(stem_s), [esc(o) for o in opts_s], hits[0], src, where))
    return out


# --------------------------------------------------------------------------
# Дедуплікація
# --------------------------------------------------------------------------
class Index:
    def __init__(self):
        self.items: list[tuple[Q, str, set[str], list[str]]] = []
        self.digits: list[list[str]] = []
        self.by_word: dict[str, list[int]] = defaultdict(list)

    def add(self, q: Q):
        k = len(self.items)
        w = words(q.text)
        self.items.append((q, norm(q.text), w, [norm_opt(o) for o in q.options]))
        self.digits.append(digits(q.text))
        for x in w:
            self.by_word[x].append(k)

    def find(self, q: Q):
        """Повертає (схоже питання, однакова_відповідь) або None."""
        nt, w = norm(q.text), words(q.text)
        no = [norm_opt(o) for o in q.options]
        my_digits = digits(q.text)
        cnt: dict[int, int] = defaultdict(int)
        for x in w:
            for k in self.by_word.get(x, ()):
                cnt[k] += 1
        best = None
        for k, c in cnt.items():
            other, ot, ow, oo = self.items[k]
            if c < 0.5 * max(len(w), len(ow), 1):
                continue
            if self.digits[k] != my_digits:  # напр. каріотипи 45,X0 і 47,XX,21+ — різні питання
                continue
            r = difflib.SequenceMatcher(None, nt, ot, autojunk=False).ratio()
            if r < 0.75:
                continue
            same_opts = sum(1 for a in no if any(a == b or difflib.SequenceMatcher(None, a, b).ratio() >= 0.85 for b in oo))
            if r >= 0.9 or same_opts >= 3:
                if best is None or r > best[1]:
                    best = (k, r)
        if not best:
            return None
        other, ot, ow, oo = self.items[best[0]]
        mine = no[q.correct]
        theirs = oo[other.correct]
        genetic = len(mine) <= 12 or len(theirs) <= 12 or re.search(r"[+−\d]|Rh", mine + theirs)
        same = mine == theirs or (not genetic and difflib.SequenceMatcher(
            None, mine.lower(), theirs.lower()).ratio() >= 0.85)
        return other, same


# --------------------------------------------------------------------------
def plain(s: str, n=90) -> str:
    t = html.unescape(re.sub(r"<[^>]+>", " ", s))
    t = re.sub(r"\s+", " ", t).strip()
    return t[:n] + ("…" if len(t) > n else "")


def known_bad_key(q: Q) -> str | None:
    """Відомі помилки ключів баз (див. ДЖЕРЕЛА.md)."""
    corr = plain(q.options[q.correct], 200).lower()
    if "genocop" in corr or "генокоп" in corr:
        return "ключ «Genocopy/генокопія» (за змістом — фенокопія)"
    t = plain(q.text, 500).lower()
    if ("turner" in t or "тернер" in t or "шерешевськ" in t) and ("autosom" in t or "аутосом" in t) and "45" in corr:
        return "Тернер: «45 пар аутосом» (правильно 22)"
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=os.environ.get("BIO_SRC", str(DEFAULT_SRC)))
    ap.add_argument("--en-dict", help="шлях до hunspell en_US.dic (фільтр OCR-сміття СумДУ)")
    ap.add_argument("--dry-run", action="store_true", help="лише звіт, без запису файлів")
    args = ap.parse_args()
    src = Path(args.src).expanduser()
    bases = src / "бази кроку"
    if not (src / "Тести з біології — повний текст.txt").exists():
        print(f"Не знайдено джерел у {src}", file=sys.stderr)
        return 1

    def one(pattern: str) -> Path:
        found = sorted(bases.glob(pattern))
        if len(found) != 1:
            raise SystemExit(f"Очікувався один файл «{pattern}», знайдено {len(found)}")
        return found[0]

    rep = Report()
    fails: dict[str, list[str]] = defaultdict(list)

    def rep_fail(source, where, text, problems):
        fails[source].append(f"  ✗ {where}: {'; '.join(problems)} — «{plain(text, 80)}»")

    img_map = prepare_images(src, args.dry_run)
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        parsed = {
            "книжка": parse_book(src / "Тести з біології — повний текст.txt", img_map, rep_fail),
            "пре-крок ТНМУ": parse_answer_base(one("ТНМУ*пре-кроку*.txt"), "пре-крок ТНМУ", rep_fail),
            "Центр тестування ТНМУ": parse_answer_base(one("ТНМУ*Центру тестування*.txt"), "Центр тестування ТНМУ", rep_fail),
            "проф. спрямування ТНМУ": parse_answer_base(one("ТНМУ*професійного*.txt"), "проф. спрямування ТНМУ", rep_fail),
            "ХНМУ укр": parse_star_text(pdf_text(one("ХНМУ*укр*.pdf"), tmp), "ХНМУ укр", rep_fail),
            "ХНМУ англ": parse_star_text(pdf_text(one("ХНМУ*англ*.pdf"), tmp), "ХНМУ англ", rep_fail),
            "ОНМедУ": [q for k in (1, 2, 3)
                       for q in parse_star_text(pdf_text(one(f"ОНМедУ*розділ {k} *.pdf"), tmp), f"ОНМедУ розд. {k}", rep_fail)],
        }
        en_texts = [plain(q.text, 10**6) + " " + " ".join(q.options)
                    for key in ("книжка", "пре-крок ТНМУ", "проф. спрямування ТНМУ", "ХНМУ англ")
                    for q in parsed[key]]
        sumdu_path = one("СумДУ*Test Items*.txt")
        vocab = build_vocab(en_texts, sumdu_path.read_text(encoding="utf-8"), find_en_dict(args.en_dict))
        ocr_fixes: list[str] = []
        parsed["СумДУ англ"] = parse_sumdu(sumdu_path, "СумДУ англ", rep_fail, vocab, ocr_fixes)

    plan = [
        ("книжка", "bio-tnmu-book", "tnmu"),
        ("пре-крок ТНМУ", "bio-tnmu-book", "tnmu"),
        ("Центр тестування ТНМУ", "bio-tnmu-ct", "tnmu"),
        ("проф. спрямування ТНМУ", "bio-tnmu-prof", "tnmu"),
        ("ХНМУ укр", "bio-knmu-uk", "extra"),
        ("ХНМУ англ", "bio-knmu-en", "extra"),
        ("ОНМедУ", "bio-onmedu", "extra"),
        ("СумДУ англ", "bio-sumdu-en", "extra"),
    ]
    idx = Index()
    tnmu_count = 0
    result: dict[str, list[Q]] = defaultdict(list)
    rep("ЗВІТ КОНВЕРТАЦІЇ ТЕСТІВ З МЕДИЧНОЇ БІОЛОГІЇ")
    rep(f"Джерело: {src}")
    rep("")
    for source, cat, section in plan:
        qs = parsed[source]
        kept, dups, conflicts, bad, fixed = 0, 0, [], [], []
        if source == "книжка":
            fixed += [f"  ! {w}" for w in book_warn]
        for q in qs:
            if source == "книжка":
                hit = None  # книжка — еталон, усі питання
            else:
                hit = idx.find(q)
            if hit:
                other, same = hit
                dups += 1
                if not same:
                    in_tnmu = other.cat.startswith("bio-tnmu")
                    conflicts.append(
                        f"  ≠ {q.where}: «{plain(q.text, 60)}» — тут «{plain(q.options[q.correct], 40)}», "
                        f"у {other.src} ({other.where}) «{plain(other.options[other.correct], 40)}»"
                        + (" — пропущено (розходиться з ТНМУ)" if in_tnmu and section == "extra" else " — пропущено як дубль"))
                continue
            if section == "extra":
                why = known_bad_key(q)
                if why:
                    bad.append(f"  ✗ {q.where}: {why} — «{plain(q.text, 70)}»")
                    continue
            q.cat = cat
            for w in q.warn:
                fixed.append(f"  ! {q.where}: {w} — «{plain(q.text, 60)}»")
            idx.add(q)
            result[cat].append(q)
            kept += 1
        rep(f"[{source}] → {cat}")
        rep(f"  розібрано: {len(qs)}; додано: {kept}; дублів (уже є вище): {dups}; не розібрано: {len(fails[source]) if source != 'ОНМедУ' else sum(len(v) for k, v in fails.items() if k.startswith('ОНМедУ'))}")
        for line in conflicts:
            rep(line)
        for line in bad + fixed:
            rep(line)
        rep("")

    rep(f"OCR СумДУ: автоматично виправлено c↔e у {len(ocr_fixes)} словах (лише однозначні збіги зі словником інших баз):")
    for i in range(0, len(ocr_fixes), 6):
        rep("  " + "; ".join(ocr_fixes[i:i + 6]))
    rep("")
    rep("НЕ РОЗІБРАНО (не додано в базу):")
    for source, lst in fails.items():
        rep(f"[{source}] — {len(lst)}")
        rep_lines = lst
        for line in rep_lines:
            rep(line)
        rep("")

    # ---- запис ----
    titles = {c[0]: c for c in CATEGORIES}
    index_entries = []
    rep("ПІДСУМОК:")
    for cat_id, title, desc in CATEGORIES:
        qs = result.get(cat_id, [])
        out_qs, seen = [], {}
        for num, q in enumerate(qs, 1):
            key = unicodedata.normalize("NFC", re.sub(r'<img src="([^"]+)"[^>]*>', r"[img:\1]", q.text)
                                        + "||" + "||".join(q.options))
            base = f"{cat_id}-{short_hash(key)}"
            seen[base] = seen.get(base, 0) + 1
            qid = base if seen[base] == 1 else f"{base}-{seen[base]}"
            item = {"id": qid, "number": num, "text": q.text,
                    "options": [{"id": LETTERS[k], "html": o} for k, o in enumerate(q.options)],
                    "correct": [LETTERS[q.correct]], "multiple": False}
            if q.note:
                item["explanation"] = q.note
            out_qs.append(item)
        rep(f"  {cat_id:15} {len(out_qs):5}  {title}")
        if not out_qs:
            continue
        index_entries.append({"id": cat_id, "title": title, "description": desc,
                              "count": len(out_qs), "file": f"data/{cat_id}.json"})
        if not args.dry_run:
            (OUT / f"{cat_id}.json").write_text(json.dumps(
                {"id": cat_id, "title": title, "description": desc, "questions": out_qs},
                ensure_ascii=False, indent=1), encoding="utf-8")
    total = sum(e["count"] for e in index_entries)
    rep(f"  РАЗОМ біологія: {total}")

    if not args.dry_run:
        idx_path = OUT / "index.json"
        cur = json.loads(idx_path.read_text(encoding="utf-8")) if idx_path.exists() else {"categories": []}
        cats = [c for c in cur["categories"] if not c["id"].startswith("bio-")] + index_entries
        idx_path.write_text(json.dumps({"categories": cats}, ensure_ascii=False, indent=1), encoding="utf-8")
        for old in OUT.glob("bio-*.json"):
            if old.stem not in titles:
                old.unlink()
        used = {Path(v).name for v in img_map.values()}
        for old in IMG_OUT.glob("bio-*"):
            if old.name not in used:
                old.unlink()
        REPORT.write_text("\n".join(rep.lines) + "\n", encoding="utf-8")
    print("\n".join(rep.lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())
