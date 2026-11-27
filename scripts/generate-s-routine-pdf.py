#!/usr/bin/env python3
"""
Generate S-CATEGORY-ROUTINE.pdf — one S-category chapter per study day,
Fridays off, Saturday recall test, ending when all 39 chapters are covered.

Data is read straight from src/data.ts (chapters, effort, focus) and
src/chapterImportance.ts (star ratings), so the PDF can never drift from the app.

Usage:
    python3 scripts/generate-s-routine-pdf.py --fonts /path/to/fonts \
        --start 2026-11-27 --out S-CATEGORY-ROUTINE.pdf

--fonts must contain HindSiliguri-{Regular,Medium,SemiBold,Bold}.ttf
(https://fonts.google.com/specimen/Hind+Siliguri). Needs: fpdf2 + uharfbuzz.
"""
from __future__ import annotations

import argparse
import datetime as dt
import re
from dataclasses import dataclass
from pathlib import Path

from fpdf import FPDF

ROOT = Path(__file__).resolve().parent.parent
OFF_WEEKDAY = 4          # Friday — no new chapter
TEST_WEEKDAY = 5         # Saturday — weekly recall test in the evening

# ---------------------------------------------------------------- data loading


@dataclass
class Chapter:
    id: str
    subject: str
    paper: int
    number: str
    title: str
    priority: str
    effort: int
    focus: str


SUBJECT_ORDER = ['physics', 'chemistry', 'biology', 'math', 'bangla', 'english', 'ict']
SUBJECT_NAME = {
    'physics': 'পদার্থবিজ্ঞান', 'chemistry': 'রসায়ন', 'biology': 'জীববিজ্ঞান',
    'math': 'উচ্চতর গণিত', 'bangla': 'বাংলা', 'english': 'English', 'ict': 'ICT',
}
# same palette as the app (src/styles.css)
SUBJECT_COLOR = {
    'physics': (44, 94, 138), 'chemistry': (139, 87, 31), 'biology': (40, 107, 75),
    'math': (100, 82, 140), 'bangla': (158, 71, 86), 'english': (44, 112, 122),
    'ict': (78, 93, 115),
}
SUBJECT_TINT = {
    'physics': (233, 242, 250), 'chemistry': (250, 241, 229), 'biology': (231, 244, 236),
    'math': (240, 236, 248), 'bangla': (250, 236, 239), 'english': (229, 243, 245),
    'ict': (236, 239, 245),
}


def load_chapters() -> list[Chapter]:
    src = (ROOT / 'src/data.ts').read_text('utf8')
    pattern = re.compile(
        r"chapter\('(\w+)', (\d), '([^']*)', '([^']*)', '(\w)', (\d+), '([^']*)'")
    out = []
    for m in pattern.finditer(src):
        num = re.sub(r'[^\w]+', '-', m[3])
        cid = f'{m[1]}-{m[2]}-{num}'
        out.append(Chapter(cid, m[1], int(m[2]), m[3], m[4], m[5], int(m[6]), m[7]))
    return out


def load_stars() -> dict[str, int]:
    src = (ROOT / 'src/chapterImportance.ts').read_text('utf8')
    return {m[1]: int(m[2]) for m in re.finditer(r'"([^"]+)": \{ star: (\d) \}', src)}


# --------------------------------------------------------------- small helpers

BN = '০১২৩৪৫৬৭৮৯'


def bn(n) -> str:
    return ''.join(BN[int(ch)] if ch.isdigit() else ch for ch in str(n))


MONTHS = {11: 'নভেম্বর', 12: 'ডিসেম্বর', 1: 'জানুয়ারি', 2: 'ফেব্রুয়ারি'}
WEEK_SHORT = ['সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র', 'শনি', 'রবি']


def date_bn(d: dt.date, with_year: bool = False) -> str:
    s = f'{bn(d.day)} {MONTHS[d.month]}'
    return f'{s}, {bn(d.year)}' if with_year else s


def paper_bn(p: int) -> str:
    return '১ম পত্র' if p == 1 else '২য় পত্র'


CHEM_ORGANIC_TOPICS = [
    'নামকরণ, সমাণুতা ও কার্যকরী মূলক — ক্লাস + নোট',
    'হাইড্রোকার্বন ও মৌলিক বিক্রিয়া অনুশীলন',
    'অ্যারোমেটিক যৌগ ও বিক্রিয়া কৌশল',
    'অ্যালকোহল, ফেনল ও ইথার — বোর্ড প্রশ্ন',
    'অ্যালডিহাইড, কিটোন ও কার্বক্সিলিক এসিড',
    'অ্যামিন এবং পাঠ্যবইয়ের বাকি অংশ',
    'রূপান্তর ও শনাক্তকরণ — না দেখে লিখে অনুশীলন',
    'বিগত বোর্ডের বাছাইকৃত CQ ও MCQ',
]


def chapter_steps(c: Chapter) -> list[tuple[str, str, str]]:
    """The chapter's own steps (its `effort`), each with a one-line job."""
    n = c.effort
    if n == 1:
        return [('এক সেশন',
                 'ওয়ান-শট ক্লাস → নিজের নোট → ২টি CQ ও ২৫টি MCQ ঘড়ি ধরে, না দেখে।',
                 'ক্লাস ও নোট · বোর্ড CQ–MCQ')]
    if c.subject == 'chemistry' and n == 8:
        return [(f'ধাপ {bn(i + 1)}/{bn(n)}', f'{t}। শেষে না দেখে ২টি CQ ও ১৫টি MCQ।',
                 t.split(' — ')[0].split(' ও ')[0])
                for i, t in enumerate(CHEM_ORGANIC_TOPICS)]
    family = {
        'physics': 'সূত্র, গাণিতিক সমস্যা ও চিত্র',
        'chemistry': 'সমীকরণ, বিক্রিয়া ও গাণিতিক হিসাব',
        'biology': 'চিত্র, পার্থক্য ও শ্রেণিবিন্যাস',
        'math': 'সূত্র প্রমাণ ও অঙ্ক',
        'bangla': 'পাঠ, শব্দার্থ ও সৃজনশীল',
        'english': 'প্যাসেজ, নিয়ম ও timed writing',
        'ict': 'ধারণা, কোড ও ডায়াগ্রাম',
    }[c.subject]
    steps = [(f'ধাপ ১/{bn(n)}',
              f'{c.focus}। ওয়ান-শট ক্লাস দেখো, তারপর মূল বই থেকে সূত্র ও সংজ্ঞা '
              'নিজের খাতায় গুছিয়ে লেখো।',
              f'{family} — ক্লাস + নোট')]
    for i in range(2, n):
        steps.append((f'ধাপ {bn(i)}/{bn(n)}',
                      f'{c.focus}। পাঠ্যবইয়ের উদাহরণ ও চিত্র হাতে-কলমে অনুশীলন করো।',
                      f'{family} — অনুশীলন {bn(i - 1)}'))
    steps.append((f'ধাপ {bn(n)}/{bn(n)}',
                  f'{c.focus}। বিগত বোর্ডের অন্তত ৩টি CQ ও ২৫টি MCQ ঘড়ি ধরে সমাধান করো।',
                  'বোর্ড CQ ও MCQ — ঘড়ি ধরে'))
    return steps


# ------------------------------------------------------------------ the plan


def order_chapters(chapters: list[Chapter]) -> list[Chapter]:
    """Round-robin across subjects so consecutive days never repeat a subject."""
    queue = {s: [c for c in chapters if c.subject == s] for s in SUBJECT_ORDER}
    ordered, rot = [], 0
    while any(queue.values()):
        for k in range(len(SUBJECT_ORDER)):
            s = SUBJECT_ORDER[(rot + k) % len(SUBJECT_ORDER)]
            if queue[s]:
                ordered.append(queue[s].pop(0))
        rot += 1
    return ordered


def build_schedule(start: dt.date, chapters: list[Chapter]):
    """One chapter per working day, Fridays off, Saturday test. Ends when done."""
    ordered = order_chapters(chapters)
    schedule = []
    day = start
    idx = 0
    while idx < len(ordered) or not schedule:
        if day.weekday() == OFF_WEEKDAY:
            schedule.append({'date': day, 'kind': 'off', 'chapter': None,
                             'index': idx, 'test': False})
            day += dt.timedelta(days=1)
            continue
        if idx >= len(ordered):
            break
        c = ordered[idx]
        test = day.weekday() == TEST_WEEKDAY and idx >= 5
        schedule.append({'date': day, 'kind': 'study', 'chapter': c,
                         'index': idx + 1, 'test': test})
        idx += 1
        day += dt.timedelta(days=1)
    # the last study day doubles as the final recap
    for entry in reversed(schedule):
        if entry['kind'] == 'study':
            entry['final'] = True
            break
    return schedule, ordered


def week_summaries(schedule):
    """Calendar weeks from the start date, for the cover overview."""
    chunks, current = [], []
    for entry in schedule:
        current.append(entry)
        if len(current) == 7:
            chunks.append(current)
            current = []
    if current:
        chunks.append(current)

    out = []
    for i, chunk in enumerate(chunks, 1):
        study = [e for e in chunk if e['kind'] == 'study']
        first, last = chunk[0]['date'], chunk[-1]['date']
        done = list(dict.fromkeys(e['chapter'].title for e in study))
        steps = sum(len(chapter_steps(e['chapter'])) for e in study)
        out.append({
            'label': f'সপ্তাহ {bn(i)} · {bn(first.day)} {MONTHS[first.month]} – '
                     f'{bn(last.day)} {MONTHS[last.month]}',
            'steps': steps, 'done': done,
            'first_index': study[0]['index'] if study else None,
            'last_index': study[-1]['index'] if study else None,
        })
    return out


# --------------------------------------------------------------------- the PDF

INK = (33, 46, 38)
MUTED = (94, 112, 100)
SOFT = (140, 154, 143)
LINE = (223, 231, 218)
GREEN = (35, 97, 73)
GREEN_LIGHT = (231, 242, 236)
LIME = (220, 232, 196)
AMBER = (154, 103, 34)
AMBER_LIGHT = (252, 245, 232)


class RoutinePDF(FPDF):
    STYLE_FAMILY = {'': 'HS', 'M': 'HSM', 'S': 'HSS', 'B': 'HSB'}

    def __init__(self, fonts: Path):
        super().__init__(format='A4', unit='mm')
        self.set_auto_page_break(False)
        self.set_margins(13, 13, 13)
        self.set_text_shaping(True)
        # fpdf2 only accepts B/I styles, so each weight is its own family.
        for family, file in (('HS', 'HindSiliguri-Regular.ttf'),
                             ('HSM', 'HindSiliguri-Medium.ttf'),
                             ('HSS', 'HindSiliguri-SemiBold.ttf'),
                             ('HSB', 'HindSiliguri-Bold.ttf')):
            self.add_font(family, '', str(fonts / file))

    def f(self, style: str = '', size: float = 9):
        self.set_font(self.STYLE_FAMILY[style], '', size)

    def rounded(self, x, y, w, h, r=2.4, fill=None, stroke=None, lw=0.3):
        if fill:
            self.set_fill_color(*fill)
        if stroke:
            self.set_draw_color(*stroke)
            self.set_line_width(lw)
        self.rect(x, y, w, h,
                  style='DF' if (fill and stroke) else ('F' if fill else 'D'),
                  round_corners=True, corner_radius=r)

    def text(self, x, y, txt, size=9, style='', color=INK, align='L', width=0):
        self.f(style, size)
        self.set_text_color(*color)
        self.set_xy(x, y)
        self.cell(width, self.font_size * 1.55, txt, align=align)

    def wrap(self, x, y, w, txt, size=8.5, style='', color=MUTED, lh=4.4):
        self.f(style, size)
        self.set_text_color(*color)
        self.set_xy(x, y)
        self.multi_cell(w, lh, txt, new_x='LEFT', new_y='NEXT', align='L')
        return self.get_y()

    def wrap_height(self, w, txt, size=8.5, style='', lh=4.4) -> float:
        self.f(style, size)
        return len(self.multi_cell(w, lh, txt, dry_run=True, output='LINES')) * lh

    def checkbox(self, x, y, s=3.6, color=(150, 168, 152)):
        self.set_draw_color(*color)
        self.set_line_width(0.3)
        self.rect(x, y, s, s, style='D', round_corners=True, corner_radius=0.9)

    def header_bar(self, label: str):
        self.f('M', 8)
        self.set_text_color(*SOFT)
        self.set_xy(13, 9)
        self.cell(90, 5, 'HSC 27 · S ক্যাটাগরি রুটিন')
        self.set_xy(13, 9)
        self.cell(184, 5, label, align='R')
        self.set_draw_color(*LINE)
        self.set_line_width(0.3)
        self.line(13, 15.2, 197, 15.2)

    def footer_bar(self):
        self.set_y(-13)
        self.f('', 7.5)
        self.set_text_color(*SOFT)
        self.cell(0, 5, 'S ক্যাটাগরি = priority A + importance ★৫ · প্রতিদিন ১টি অধ্যায় · শুক্রবার বন্ধ',
                  align='L')
        self.set_y(-13)
        self.cell(0, 5, f'পৃষ্ঠা {bn(self.page_no())}', align='R')


# ---------------------------------------------------------------- day cards

TEST_LINE = 'সন্ধ্যায় ৩০ মিনিট: এই সপ্তাহের অধ্যায় থেকে ২৫টি MCQ + ২টি CQ, না দেখে।'


def day_height(pdf: RoutinePDF, entry) -> float:
    if entry['kind'] == 'off':
        return 22
    c = entry['chapter']
    inner_w = 184 - 4.2 * 2 - 3.8
    h = 10.4 + 4.6 + 5.2 + pdf.wrap_height(inner_w - 6, c.focus, 8.2, lh=4.4) + 3.4
    for label, detail, summary in chapter_steps(c):
        h += 4.6 + pdf.wrap_height(inner_w - 18, summary, 8.2, lh=4.4) + 1.6
    if entry.get('test'):
        h += 4.2 + pdf.wrap_height(inner_w - 18, TEST_LINE, 8, lh=4.3) + 1.6
    if entry.get('final'):
        h += 8.4
    return h + 2.6


def day_card(pdf: RoutinePDF, x, y, w, entry) -> float:
    date = entry['date']
    pad = 4.2
    inner_x = x + pad + 3.8
    inner_w = w - pad * 2 - 3.8
    height = day_height(pdf, entry)
    off = entry['kind'] == 'off'

    pdf.rounded(x, y, w, height, r=3,
                fill=(246, 248, 244) if off else (255, 255, 255), stroke=LINE, lw=0.35)
    head_fill = (243, 245, 241) if off else (243, 247, 240)
    pdf.set_fill_color(*head_fill)
    pdf.rect(x, y, w, 10.4, style='F', round_corners=True, corner_radius=3)
    pdf.rect(x, y + 6, w, 4.4, style='F')
    pdf.text(x + pad, y + 1.5, f'{WEEK_SHORT[date.weekday()]}, {bn(date.day)} {MONTHS[date.month]}',
             10, 'S', SOFT if off else INK)

    right = ('শুক্রবার · বন্ধ' if off
             else f'দিন {bn(entry["index"])}/{bn(TOTAL_CHAPTERS)}')
    pdf.f('M', 7.8)
    pdf.set_text_color(*SOFT)
    pdf.set_xy(x, y + 2.9)
    pdf.cell(w - pad, 4.5, right, align='R')

    cy = y + 10.4 + 2.4
    if off:
        pdf.f('M', 8.4)
        pdf.set_text_color(*MUTED)
        pdf.set_xy(inner_x - 1, cy)
        pdf.multi_cell(inner_w + 1, 4.7,
                       'বন্ধ। তবু ২০ মিনিট আগের সপ্তাহের ভুল খাতা দেখে নিলে রবিবার শুরুটা সহজ হয়।',
                       new_x='LEFT', new_y='NEXT')
        return height

    c = entry['chapter']
    accent = SUBJECT_COLOR[c.subject]
    pdf.set_fill_color(*accent)
    pdf.rect(x + pad - 1.3, cy + 1.4, 1.8, 10.4, style='F', round_corners=True, corner_radius=0.8)
    pdf.f('M', 7.4)
    pdf.set_text_color(*accent)
    pdf.set_xy(inner_x, cy)
    pdf.cell(0, 4.6, f'{SUBJECT_NAME[c.subject]} · {paper_bn(c.paper)} · অধ্যায় {c.number}')
    chapter_title = f'{c.title}'
    pdf.f('S', 11)
    pdf.set_text_color(*INK)
    pdf.set_xy(inner_x, cy + 4.5)
    pdf.cell(0, 5.4, chapter_title)
    # time hint on the right
    pdf.f('', 7.4)
    pdf.set_text_color(*SOFT)
    pdf.set_xy(x, cy + 5.0)
    n_steps = len(chapter_steps(c))
    pdf.cell(w - pad, 4.4, f'{bn(n_steps)} ব্লক · {bn(n_steps * 50)} মিনিট', align='R')
    cy = pdf.wrap(inner_x, cy + 10.2, inner_w - 5, c.focus, 8.2, '', MUTED, lh=4.4) + 1.6

    for label, detail, summary in chapter_steps(c):
        pdf.set_draw_color(*LINE)
        pdf.line(inner_x, cy - 0.6, x + w - pad, cy - 0.6)
        pdf.checkbox(inner_x, cy + 1.2, 3.6, accent)
        pdf.f('M', 8)
        pdf.set_text_color(*accent)
        pdf.set_xy(inner_x + 5.8, cy + 0.4)
        pdf.cell(0, 4.6, label)
        pdf.f('', 8.2)
        pdf.set_text_color(*INK)
        pdf.set_xy(inner_x + 20, cy + 0.4)
        pdf.cell(0, 4.6, summary)
        cy = max(pdf.wrap(inner_x + 20, cy + 5.2, inner_w - 20, detail, 7.6, '', MUTED, lh=4.0),
                 cy + 9.4) + 1.8

    if entry.get('test'):
        pdf.rounded(inner_x - 1.4, cy - 1.0, inner_w + 1.4, 12.4, r=2.2,
                    fill=AMBER_LIGHT, stroke=(235, 215, 178))
        pdf.checkbox(inner_x, cy + 0.6, 3.6, AMBER)
        pdf.f('M', 8)
        pdf.set_text_color(*AMBER)
        pdf.set_xy(inner_x + 5.8, cy - 0.2)
        pdf.cell(0, 4.4, 'টেস্ট')
        cy = pdf.wrap(inner_x + 17, cy - 0.2, inner_w - 17, TEST_LINE, 8, '', (138, 90, 27), lh=4.3) + 1.4

    if entry.get('final'):
        pdf.rounded(inner_x - 1.4, cy - 0.4, inner_w + 1.4, 9.2, r=2.2, fill=GREEN_LIGHT)
        pdf.f('S', 8.4)
        pdf.set_text_color(*GREEN)
        pdf.set_xy(inner_x, cy + 1.6)
        pdf.cell(0, 4.6, 'শেষ ধাপ — এরপর ফুল রিভিউ (পরের পৃষ্ঠার প্ল্যান দেখো)।')
    return height


def after_block(pdf: RoutinePDF, y, chapters):
    """The A/B remainder, straight from the app data."""
    allch = load_chapters()
    stars = load_stars()
    pdf.text(13, y, 'এরপর কী · S-এর বাইরে বাকি অধ্যায়', 10.5, 'S', INK)
    y += 7.4
    pdf.set_fill_color(*GREEN_LIGHT)
    pdf.rect(13, y, 184, 8, style='F', round_corners=True, corner_radius=2)
    pdf.text(15, y + 1.4, 'বিষয়', 7.8, 'S', GREEN)
    pdf.text(70, y + 1.4, 'S (এই রুটিনে)', 7.8, 'S', GREEN)
    pdf.text(108, y + 1.4, 'বাকি A', 7.8, 'S', GREEN)
    pdf.text(140, y + 1.4, 'B', 7.8, 'S', GREEN)
    pdf.text(166, y + 1.4, 'C', 7.8, 'S', GREEN)
    y += 9.4
    for sub in SUBJECT_ORDER:
        group = [c for c in allch if c.subject == sub]
        counts = [sum(1 for c in group if c.priority == 'A' and stars.get(c.id) == 5),
                  sum(1 for c in group if c.priority == 'A' and stars.get(c.id) != 5),
                  sum(1 for c in group if c.priority == 'B'),
                  sum(1 for c in group if c.priority == 'C')]
        pdf.set_draw_color(*LINE)
        pdf.line(15, y + 8.4, 195, y + 8.4)
        pdf.text(15, y + 1.0, SUBJECT_NAME[sub], 8.6, 'S', SUBJECT_COLOR[sub])
        for value, xx, style, color in zip(counts, (70, 108, 140, 166),
                                           ('M', 'M', '', ''),
                                           (GREEN, INK, MUTED, MUTED)):
            pdf.text(xx, y + 1.0, bn(value), 8.6, style, color)
        y += 9.6
    y += 1
    pdf.rounded(13, y, 184, 13, r=2.6, fill=(249, 251, 248), stroke=LINE)
    pdf.f('', 7.8)
    pdf.set_text_color(*MUTED)
    pdf.set_xy(17, y + 2.6)
    pdf.multi_cell(176, 4.2,
                   'S শেষ হলে একই ছন্দে বাকি A অধ্যায়, তারপর B — C অধ্যায় সংস্করণভেদে বাদ দেওয়া যায়। '
                   'অ্যাপের Syllabus পেজে প্রতিটি অধ্যায়ের ধাপ টিক দিয়ে এগোবে।', align='L')
    return y + 13


def section_title(pdf: RoutinePDF, y, title, sub=''):
    pdf.text(13, y, title, 14, 'B', INK)
    if sub:
        pdf.f('', 8.4)
        pdf.set_text_color(*MUTED)
        pdf.set_xy(13, y + 6.4)
        pdf.cell(0, 4.6, sub)
        return y + 13.5
    return y + 9.5


# ---------------------------------------------------------------- front pages


def cover(pdf: RoutinePDF, schedule, chapters, start, end, weeks):
    pdf.add_page()
    pdf.set_fill_color(*GREEN)
    pdf.rect(0, 0, 210, 58, style='F')
    pdf.set_fill_color(*LIME)
    pdf.rect(0, 58, 210, 2.2, style='F')

    pdf.text(15, 12, 'HSC 27 · প্রস্তুতি', 9.5, 'M', LIME)
    pdf.text(15, 19, 'S ক্যাটাগরি রুটিন', 30, 'B', (255, 255, 255))
    pdf.f('', 10.6)
    pdf.set_text_color(226, 238, 220)
    pdf.set_xy(15, 38)
    pdf.cell(0, 5.6, 'প্রতিদিন ঠিক ১টি অধ্যায় · শুক্রবার বন্ধ · ৩৯ অধ্যায় শেষ হলেই শেষ')
    pdf.set_xy(15, 45)
    pdf.f('M', 10)
    pdf.set_text_color(*LIME)
    pdf.cell(0, 5.6, f'{date_bn(start, True)}  →  {date_bn(end, True)}   ·   '
                     f'{bn(sum(1 for e in schedule if e["kind"] == "study"))} পড়ার দিন')

    study = [e for e in schedule if e['kind'] == 'study']
    offs = sum(1 for e in schedule if e['kind'] == 'off')
    tests = sum(1 for e in schedule if e.get('test'))
    y = 65
    stats = [(bn(len(chapters)), 'S অধ্যায়'), (bn(len({c.subject for c in chapters})), 'বিষয়'),
             (bn(len(study)), 'পড়ার দিন'), (bn(offs), 'শুক্রবার বন্ধ'), (bn(tests), 'টেস্ট')]
    w = 184 / len(stats)
    for i, (num, label) in enumerate(stats):
        x = 13 + i * w
        pdf.rounded(x, y, w - 3, 19, r=3, fill=(247, 250, 246), stroke=LINE)
        pdf.text(x + 3, y + 2.2, num, 15.5, 'B', GREEN)
        pdf.f('', 7.6)
        pdf.set_text_color(*MUTED)
        pdf.set_xy(x + 3, y + 12)
        pdf.cell(w - 6, 4.4, label)

    y = 90
    pdf.text(13, y, 'সপ্তাহে কী কী', 11, 'S', INK)
    y += 7.4
    row_h = min(30.5, (268 - y) / len(weeks))
    for wk in weeks:
        pdf.rounded(13, y, 184, row_h - 2.4, r=2.6, fill=(252, 253, 251), stroke=LINE)
        pdf.set_fill_color(*GREEN)
        pdf.rect(13, y, 1.6, row_h - 2.4, style='F', round_corners=True, corner_radius=0.8)
        pdf.text(17.5, y + 1.2, wk['label'], 8.6, 'S', INK)
        tag = (f"অধ্যায় {bn(wk['first_index'])}–{bn(wk['last_index'])}"
               if wk['first_index'] else 'শুক্রবার · বন্ধ')
        pdf.f('M', 7.2)
        tw = pdf.get_string_width(tag) + 5
        pdf.rounded(197 - tw, y + 1.6, tw, 5, r=1.6, fill=GREEN_LIGHT)
        pdf.set_text_color(*GREEN)
        pdf.set_xy(197 - tw, y + 2.4)
        pdf.cell(tw, 4, tag, align='C')
        detail = ' · '.join(wk['done'])
        pdf.wrap(17.5, y + 7.6, 172, detail, 7.6, lh=4.0)
        y += row_h

    pdf.set_draw_color(*LINE)
    pdf.line(13, 272, 197, 272)
    pdf.f('', 7.2)
    pdf.set_text_color(*SOFT)
    pdf.set_xy(13, 273.4)
    pdf.multi_cell(184, 4.0,
                   'S ক্যাটাগরি মানে “আগে পড়ো” — বোর্ডের অফিসিয়াল ক্যাটাগরি বা প্রশ্নের prediction নয়। '
                   'তালিকা, ধাপ ও সময় (effort) নেওয়া হয়েছে অ্যাপের src/data.ts ও '
                   'src/chapterImportance.ts থেকে।', align='C')


def rules_page(pdf: RoutinePDF, schedule, chapters, start, end):
    pdf.add_page()
    pdf.header_bar('কীভাবে ব্যবহার করবে')
    y = 21
    y = section_title(pdf, y, 'ছয়টি নিয়ম',
                      f'প্রতিদিন ১টি অধ্যায় — {bn(len(chapters))} অধ্যায়, '
                      f'শেষ {date_bn(end)}।')

    test_days = [e['date'] for e in schedule if e.get('test')]
    rules = [
        ('১', 'এক দিনে ঠিক একটি অধ্যায়',
         'অধ্যায়ের সব ধাপ (ক্লাস, নোট, অনুশীলন, বোর্ড প্রশ্ন) ওই একদিনেই, ৫০ মিনিটের ব্লকে। '
         'ছোট অধ্যায়ে কম সময়, ভারী অধ্যায়ে বেশি।'),
        ('২', 'শুক্রবার পুরো বন্ধ',
         f'{bn(sum(1 for e in schedule if e["kind"] == "off"))}টি শুক্রবার খালি রাখা আছে। '
         'কোনো দিন মিস হলে শুক্রবারেই ধরে নাও — অন্য অধ্যায় কেটে দিও না।'),
        ('৩', 'শনিবার সন্ধ্যায় টেস্ট',
         'শনিবারের কার্ডে আলাদা টেস্ট লাইন আছে — সেটা ওই দিনের অধ্যায়ের বাইরে, ৩০ মিনিটের কাজ।'),
        ('৪', 'ধাপ শেষ না হলে “আধা” নয়',
         'অধ্যায়ের কোনো ধাপ বাদ দিলে পুরো অধ্যায় “হয়নি” ধরে নাও — ট্র্যাকারে এক লাইনও টিক দিও না।'),
        ('৫', 'শেষ ৩ মিনিট',
         'প্রতিদিন শেষে খাতায় লেখো: আজ কোন ধাপ শেষ, কাল কোনটা, কোন প্রশ্নটা আবার দেখতে হবে।'),
        ('৬', 'একদিনে এক অধ্যায় বেশি হলে',
         f'কোনো দিন সময় বেশি পেলে {date_bn(end)}-এর তারিখ এগিয়ে আসবে — ট্র্যাকারে নতুন তারিখ লিখে নাও, '
         'রুটিনের ক্রম বদলাবে না।'),
    ]
    for num, title, body in rules:
        h = 19.5
        pdf.rounded(13, y, 184, h, r=3, fill=(252, 253, 251), stroke=LINE)
        pdf.rounded(17, y + 3.8, 12, 12, r=3, fill=GREEN_LIGHT)
        pdf.text(17, y + 5.2, num, 10, 'B', GREEN, align='C', width=12)
        pdf.text(32, y + 3.0, title, 10.2, 'S', INK)
        pdf.wrap(32, y + 9.4, 160, body, 8.4, lh=4.4)
        y += h + 3.4

    # milestone table
    y += 3
    pdf.text(13, y, 'মাইলস্টোন', 11, 'S', INK)
    y += 7
    pdf.set_fill_color(*GREEN_LIGHT)
    pdf.rect(13, y, 184, 8, style='F', round_corners=True, corner_radius=2)
    pdf.text(15, y + 1.4, 'কখন', 8, 'S', GREEN)
    pdf.text(45, y + 1.4, 'কী শেষ থাকবে', 8, 'S', GREEN)
    pdf.f('S', 8)
    pdf.set_text_color(*GREEN)
    pdf.set_xy(13, y + 1.4)
    pdf.cell(182, 4.4, 'অধ্যায়', align='R')
    y += 9.8

    def at(day_limit):
        study = [e for e in schedule if e['kind'] == 'study' and e['date'] <= day_limit]
        books = {(e['chapter'].subject, e['chapter'].paper) for e in study}
        return study, books

    checks = [schedule[i]['date'] for i in range(6, len(schedule) - 1, 7)][:4]
    checks.append(schedule[-1]['date'])
    for d in checks:
        study, books = at(d)
        groups = {}
        for sub, pp in books:
            groups[sub] = groups.get(sub, 0) + 1
        names = ' · '.join(f'{SUBJECT_NAME[sub].split()[0]} {bn(groups[sub])}'
                           for sub in sorted(groups, key=SUBJECT_ORDER.index)) if books else 'শুরু'
        h = max(9.6, pdf.wrap_height(100, names, 8, lh=4.2) + 3.4)
        pdf.set_draw_color(*LINE)
        pdf.line(13, y + h - 0.6, 197, y + h - 0.6)
        pdf.text(15, y + 1.2, date_bn(d), 8, 'M', INK)
        pdf.wrap(45, y + 1.2, 100, names, 8, '', MUTED, lh=4.2)
        pdf.f('M', 8)
        pdf.set_text_color(*GREEN)
        pdf.set_xy(13, y + 1.2)
        pdf.cell(182, 4.4, f'{bn(len(study))}/{bn(len(chapters))}', align='R')
        y += h

    heavy = max(chapters, key=lambda c: c.effort)
    y += 3
    pdf.rounded(13, y, 184, 17, r=3, fill=AMBER_LIGHT, stroke=(235, 215, 178))
    pdf.f('M', 8.6)
    pdf.set_text_color(*AMBER)
    pdf.set_xy(17, y + 4.2)
    pdf.multi_cell(176, 4.8,
                   f'সতর্কতা: {heavy.title} ({SUBJECT_NAME[heavy.subject]} {paper_bn(heavy.paper)}, '
                   f'অধ্যায় {heavy.number}) সবচেয়ে ভারী — {bn(heavy.effort)} ধাপ। ওই দিনটা '
                   'সকাল-বিকেল ভাগ করে নাও, অন্য কিছু যোগ কোরো না।', align='L')


def routine_pages(pdf: RoutinePDF, schedule):
    label = f'{date_bn(schedule[0]["date"])} – {date_bn(schedule[-1]["date"])}'
    pdf.add_page()
    pdf.header_bar(label)
    pdf.footer_bar()
    y = 21
    y = section_title(pdf, y, 'দিনভিত্তিক রুটিন',
                      'প্রতিটি ব্লকে টিক দাও। শুক্রবার বন্ধ, শনিবারে টেস্ট।')
    for entry in schedule:
        h = day_height(pdf, entry)
        if y + h > 272:
            pdf.add_page()
            pdf.header_bar(label)
            pdf.footer_bar()
            y = 21
        day_card(pdf, 13, y, 184, entry)
        y += h + 4


def final_recap_block(pdf: RoutinePDF, y, chapters):
    """Full-revision plan for after the last chapter."""
    pdf.rounded(13, y, 184, 9.4, r=2.6, fill=GREEN)
    pdf.text(17, y + 1.2, '৩৯ অধ্যায় শেষ — এরপর ফুল রিভিউ', 9.6, 'S', (255, 255, 255))
    pdf.f('', 7.6)
    pdf.set_text_color(*LIME)
    pdf.set_xy(13, y + 1.6)
    pdf.cell(181, 4.4, '৩–৪ দিন, প্রতিদিন ২ বিষয়', align='R')
    y += 9.4

    plan = {
        'physics': 'সূত্রের শিট + ২৫ MCQ', 'chemistry': 'বিক্রিয়া/সমীকরণ + ২০ MCQ',
        'biology': 'চিত্র ও পার্থক্য + ২৫ MCQ', 'math': '৫টি অঙ্ক + ১০ MCQ',
        'bangla': '২টি CQ + ব্যাকরণের নিয়ম', 'english': '১টি paragraph + grammar ২০',
        'ict': 'HTML কোড + ২০ MCQ',
    }
    for sub in SUBJECT_ORDER:
        n = sum(1 for c in chapters if c.subject == sub)
        pdf.rounded(13, y, 184, 11.4, r=2.4, fill=(252, 253, 251), stroke=LINE)
        pdf.checkbox(17, y + 3.6, 4, GREEN)
        pdf.text(24, y + 2.2, SUBJECT_NAME[sub], 9, 'S', INK)
        pdf.f('', 8)
        pdf.set_text_color(*MUTED)
        pdf.set_xy(70, y + 2.4)
        pdf.cell(0, 4.6, f'{bn(n)} অধ্যায় · {plan[sub]}')
        y += 12.4
    return y


def checklist_section(pdf: RoutinePDF, chapters):
    pdf.add_page()
    pdf.header_bar('পুরো S চেকলিস্ট')
    pdf.footer_bar()
    y = 21
    y = section_title(pdf, y, 'সব S অধ্যায় · এক পাতায় ট্র্যাকার',
                      'বাঁ দিকের বড় বাক্স = অধ্যায় পুরো শেষ · তারপর পাঁচটি ধাপ আলাদা করে টিক দাও।')
    stages = ['ক্লাস', 'নোট', 'অনুশীলন', 'রিভিশন', 'টেস্ট']
    col_start, col_w = 149.5, 9.6

    for sub in SUBJECT_ORDER:
        group = [c for c in chapters if c.subject == sub]
        block = 10.6 + 9.7 * len(group) + 3.2
        if y + block > 282:
            pdf.add_page()
            pdf.header_bar('পুরো S চেকলিস্ট')
            pdf.footer_bar()
            y = 21
        accent = SUBJECT_COLOR[sub]
        pdf.rounded(13, y, 184, 9.2, r=2.4, fill=SUBJECT_TINT[sub])
        pdf.text(17, y + 1.1, f'{SUBJECT_NAME[sub]}  ·  {bn(len(group))}টি অধ্যায়', 9.2, 'S', accent)
        for i, st in enumerate(stages):
            pdf.f('M', 6.4)
            pdf.set_text_color(*accent)
            pdf.set_xy(col_start + i * col_w - 2.2, y + 2.3)
            pdf.cell(col_w + 2.2, 4, st, align='C')
        y += 10.6
        for c in group:
            pdf.set_draw_color(*LINE)
            pdf.line(15, y + 9.2, 195, y + 9.2)
            pdf.checkbox(15.4, y + 2.4, 3.8, accent)
            pdf.text(21.4, y + 0.9, f'{paper_bn(c.paper)} · {c.number}', 7.6, 'M', accent)
            pdf.text(52, y + 0.9, c.title, 8.8, 'S', INK)
            pdf.wrap(52.4, y + 5.0, 92, c.focus, 6.8, lh=3.7)
            for i in range(len(stages)):
                pdf.checkbox(col_start + i * col_w + 2.6, y + 2.4, 3.8, (176, 190, 176))
            y += 9.7
        y += 3.2


def log_page(pdf: RoutinePDF, schedule, chapters):
    pdf.add_page()
    pdf.header_bar('টেস্ট লগ ও শেষ কথা')
    pdf.footer_bar()
    y = 21
    y = section_title(pdf, y, 'টেস্ট লগ',
                      'প্রতি টেস্টের পর খাতায় হাতে লিখে রাখো; দুর্বল অধ্যায় পরে ঝালিয়ে নাও।')
    pdf.set_fill_color(*GREEN_LIGHT)
    pdf.rect(13, y, 184, 8.4, style='F', round_corners=True, corner_radius=2)
    pdf.text(15, y + 1.6, 'তারিখ', 8, 'S', GREEN)
    pdf.text(39, y + 1.6, 'কী রিভিশন দিয়ে টেস্ট', 8, 'S', GREEN)
    pdf.text(146, y + 1.6, 'MCQ /২৫', 8, 'S', GREEN)
    pdf.text(168, y + 1.6, 'CQ /১০', 8, 'S', GREEN)
    y += 10.4

    rows, recent = [], []
    for e in schedule:
        if e['kind'] == 'study':
            recent.append(e['chapter'].title)
        if e.get('test'):
            rows.append((e['date'], recent[-3:]))
            recent = []
    rows.append((schedule[-1]['date'], []))
    row_h = 11.4 if len(rows) > 5 else 12
    for d, titles in rows:
        pdf.rounded(13, y, 184, row_h, r=2, fill=(255, 255, 255), stroke=LINE)
        pdf.text(15, y + 1.2, date_bn(d), 8.4, 'M', INK)
        what = ' · '.join(titles) if titles else 'ফুল সিলেবাস — ৩৯টি S অধ্যায়'
        pdf.wrap(39, y + 1.2, 104, what, 7.8, '', MUTED, lh=4.2)
        pdf.set_draw_color(*LINE)
        pdf.line(146, y + 3.2, 164, y + 3.2)
        pdf.line(168, y + 3.2, 186, y + 3.2)
        y += row_h + 1.4

    y += 5
    pdf.text(13, y, 'শেষ কথা', 11, 'S', INK)
    y += 8
    notes = [
        f'S তালিকা শেষ মানে সিলেবাস শেষ নয় — বাকি A ও B অধ্যায়গুলো এরপরে একই ছন্দে ধরবে '
        f'(S-এর বাইরে {bn(sum(1 for c in load_chapters() if not (c.priority == "A" and load_stars().get(c.id) == 5)))}টি অধ্যায়)।',
        'শুক্রবার বন্ধ মানে পড়া পুরো বন্ধ নয় — মিস হওয়া ধাপ ধরার একমাত্র জায়গা ওটাই।',
        'ঘুম ৭ ঘণ্টা, সপ্তাহে একদিন পুরো বিশ্রাম, আর প্রতিদিন ৩ মিনিটের রিভিউ — এটাও রুটিনের অংশ।',
    ]
    for n in notes:
        h = max(15, pdf.wrap_height(168, n, 8.4, lh=4.6) + 5)
        pdf.rounded(13, y, 184, h, r=2.6, fill=(249, 251, 248), stroke=LINE)
        pdf.set_fill_color(*GREEN)
        pdf.circle(19.5, y + h / 2, 1.4, style='F')
        pdf.wrap(24, y + 2.6, 168, n, 8.4, lh=4.6)
        y += h + 2

    y += 3
    pdf.rounded(13, y, 184, 20, r=3, fill=GREEN)
    pdf.f('S', 10.6)
    pdf.set_text_color(255, 255, 255)
    pdf.set_xy(17, y + 3.2)
    pdf.cell(0, 6, '৩৯ অধ্যায় · প্রতিদিন একটি · শুক্রবার বন্ধ — শেষ দিনে সব টিক পড়বে।')
    pdf.f('', 8)
    pdf.set_text_color(*LIME)
    pdf.set_xy(17, y + 10.8)
    pdf.cell(0, 5, 'HSC 27 · S ক্যাটাগরি রুটিন · অ্যাপের নিজের ডেটা থেকে তৈরি')


def main():
    global TOTAL_CHAPTERS
    ap = argparse.ArgumentParser()
    ap.add_argument('--fonts', default='/tmp')
    ap.add_argument('--start', default='2026-11-27')
    ap.add_argument('--out', default='S-CATEGORY-ROUTINE.pdf')
    args = ap.parse_args()

    start = dt.date.fromisoformat(args.start)
    chapters_all = load_chapters()
    stars = load_stars()
    s_chapters = [c for c in chapters_all if c.priority == 'A' and stars.get(c.id) == 5]
    s_chapters.sort(key=lambda c: SUBJECT_ORDER.index(c.subject))
    TOTAL_CHAPTERS = len(s_chapters)

    schedule, ordered = build_schedule(start, s_chapters)
    end = schedule[-1]['date']
    weeks = week_summaries(schedule)

    pdf = RoutinePDF(Path(args.fonts))
    pdf.set_title('HSC 27 · S ক্যাটাগরি রুটিন')
    pdf.set_author('HSC 27 · প্রস্তুতি')
    cover(pdf, schedule, s_chapters, start, end, weeks)
    rules_page(pdf, schedule, s_chapters, start, end)
    routine_pages(pdf, schedule)

    pdf.add_page()
    pdf.header_bar('ফুল রিভিউ প্ল্যান')
    pdf.footer_bar()
    y = section_title(pdf, 21, '৩৯ অধ্যায় শেষ — এখন ফুল রিভিউ',
                      'নোট + বোর্ড প্রশ্ন মিলিয়ে ৩–৪ দিনের রিভিউ।')
    y = final_recap_block(pdf, y, s_chapters)
    after_block(pdf, y + 5, s_chapters)

    checklist_section(pdf, s_chapters)
    log_page(pdf, schedule, s_chapters)
    pdf.output(args.out)
    print(f'{args.out}: {len(s_chapters)} chapters, {sum(1 for e in schedule if e["kind"] == "study")} '
          f'study days, {sum(1 for e in schedule if e["kind"] == "off")} Fridays off, '
          f'{start} → {end}, {pdf.page_no()} pages')


if __name__ == '__main__':
    main()
