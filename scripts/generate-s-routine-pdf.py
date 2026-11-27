#!/usr/bin/env python3
"""
Generate S-CATEGORY-ROUTINE.pdf — a dated, printable study routine for every
S-category chapter (priority A + editorial star 5) from today until 1 January.

Data is read straight from src/data.ts (chapters, effort, focus) and
src/chapterImportance.ts (star ratings), so the PDF can never drift from the app.

Usage:
    python3 scripts/generate-s-routine-pdf.py --fonts /path/to/fonts \
        --start 2026-11-27 --end 2027-01-01 --out S-CATEGORY-ROUTINE.pdf

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


MONTHS = {11: 'নভেম্বর', 12: 'ডিসেম্বর', 1: 'জানুয়ারি'}
WEEKDAYS = ['সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার', 'রবিবার']
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


def part_task(c: Chapter, part: int, total: int) -> str:
    """Same wording logic as learnDetail() in src/planner.ts, but generic."""
    if c.effort == 8 and c.subject == 'chemistry':
        return CHEM_ORGANIC_TOPICS[part - 1] + '। শেষে না দেখে ২টি CQ ও ১৫টি MCQ।'
    if total == 1:
        return (f'{c.focus}। এক সেশনেই ক্লাস → নোট → বোর্ড CQ ও MCQ; '
                'না দেখে ২টি CQ + ২৫টি MCQ দিয়ে নিজেকে যাচাই করো।')
    if part == 1:
        return (f'{c.focus}। আগে ওয়ান-শট ক্লাস দেখো, তারপর মূল বই থেকে সূত্র ও '
                'সংজ্ঞা নিজের খাতায় গুছিয়ে লেখো।')
    if part == total:
        return (f'{c.focus}। সলভিং ক্লাস দেখে বিগত বোর্ডের অন্তত ৩টি CQ ও '
                '২৫টি MCQ ঘড়ি ধরে সমাধান করো।')
    return f'{c.focus}। পাঠ্যবইয়ের উদাহরণ, গাণিতিক সমস্যা ও চিত্র হাতে-কলমে অনুশীলন করো।'


# ------------------------------------------------------------------ the plan

def build_schedule(start: dt.date, end: dt.date, chapters: list[Chapter]):
    """Spread every S chapter (part by part) across the days between start and end.

    Rules:
      * chapters are visited in app order and split into their effort "steps";
        a chapter's steps land on consecutive days so nothing is left half-done,
      * after every chapter the subject pointer jumps to the next unfinished
        subject, so a day normally carries 3 different subjects,
      * the heaviest chapter (জৈব রসায়ন, effort 8) gets its own focus day,
      * the day before the deadline is a buffer and the deadline is a full recap.
    """
    days = []
    d = start
    while d <= end:
        days.append(d)
        d += dt.timedelta(days=1)

    study_days = days[:-1]           # deadline day = final recap
    buffer_day = study_days[-1]      # day before it = buffer
    plan_days = [d for d in study_days if d != buffer_day]

    heavy = max(chapters, key=lambda c: c.effort)          # জৈব রসায়ন, effort 8
    normal = [c for c in chapters if c is not heavy]

    # one step of every chapter, round-robin across subjects => 3+ subjects a day,
    # and each chapter's steps sit on consecutive days instead of one long block
    per_subject = {s: [(c, p, c.effort) for c in normal if c.subject == s
                       for p in range(1, c.effort + 1)] for s in SUBJECT_ORDER}
    ordered = []
    rot = 0
    while any(per_subject.values()):
        for k in range(len(SUBJECT_ORDER)):
            s = SUBJECT_ORDER[(rot + k) % len(SUBJECT_ORDER)]
            if per_subject[s]:
                ordered.append(per_subject[s].pop(0))
        rot += 1

    heavy_day = plan_days[len(plan_days) // 2]
    fill_days = [d for d in plan_days if d != heavy_day]

    load = {d: [] for d in fill_days}
    per_day = max(1, round(len(ordered) / len(fill_days)))
    idx = 0
    for d in fill_days:
        load[d] = ordered[idx:idx + per_day]
        idx += per_day
    for i, unit in enumerate(ordered[idx:]):
        load[fill_days[i % len(fill_days)]].append(unit)

    schedule = []
    for d in days:
        if d == buffer_day:
            schedule.append({'date': d, 'entries': [{'kind': 'buffer'}]})
        elif d == heavy_day or d == end:
            source = heavy if d == heavy_day else None
            entries = ([{'kind': 'heavy', 'chapter': heavy, 'part': p, 'total': heavy.effort}
                        for p in range(1, heavy.effort + 1)] if source else
                       [{'kind': 'final'}])
            schedule.append({'date': d, 'entries': entries})
        elif d not in load:
            continue
        else:
            entries = [{'kind': 'chapter', 'chapter': c, 'part': p, 'total': t}
                       for (c, p, t) in load[d]]
            schedule.append({'date': d, 'entries': entries})

    # one recall test a week: the last study day on/after every 7th day from start
    test_dates, next_test = [], start + dt.timedelta(days=6)
    for day in schedule:
        if day['date'] == buffer_day or day['date'] == end:
            continue
        if day['date'] >= next_test and any(e['kind'] in ('chapter', 'heavy')
                                            for e in day['entries']):
            test_dates.append(day['date'])
            next_test = day['date'] + dt.timedelta(days=7)
    for day in schedule:
        if day['date'] in test_dates:
            day['entries'].append({'kind': 'test'})
    return schedule


def week_summaries(schedule):
    """Seven-day blocks from the start date, for the cover overview."""
    chunks, current = [], []
    for day in schedule[:-2]:                 # buffer + final day handled separately
        current.append(day)
        if len(current) == 7:
            chunks.append(current)
            current = []
    if current:
        chunks.append(current)

    out = []
    for i, chunk in enumerate(chunks, 1):
        first, last = chunk[0]['date'], chunk[-1]['date']
        steps = sum(1 for d in chunk for e in d['entries']
                    if e['kind'] in ('chapter', 'heavy'))
        last_part, partial = {}, set()
        for d in chunk:
            for e in d['entries']:
                if e['kind'] in ('chapter', 'heavy'):
                    last_part[e['chapter'].title] = e['part']
                    if e['part'] < e['total']:
                        partial.add(e['chapter'].title)
        done = list(last_part)
        out.append({
            'label': f'সপ্তাহ {bn(i)} · {bn(first.day)} {MONTHS[first.month]} – '
                     f'{bn(last.day)} {MONTHS[last.month]}',
            'steps': steps, 'done': done, 'partial': partial,
        })
    tail = schedule[-2:]
    out.append({
        'label': f'{bn(tail[0]["date"].day)} {MONTHS[tail[0]["date"].month]} – '
                 f'{bn(tail[1]["date"].day)} {MONTHS[tail[1]["date"].month]}',
        'steps': 0, 'done': ['বাফার দিন, তারপর ফাইনাল রিভিউ'], 'partial': set(),
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
PAPER = (255, 255, 255)


class RoutinePDF(FPDF):
    def __init__(self, fonts: Path):
        super().__init__(format='A4', unit='mm')
        self.font_dir = fonts
        self.set_auto_page_break(False)
        self.set_margins(13, 13, 13)
        self.set_text_shaping(True)
        # fpdf2 only accepts B/I styles, so each weight is registered as its own family.
        for family, file in (('HS', 'HindSiliguri-Regular.ttf'),
                             ('HSM', 'HindSiliguri-Medium.ttf'),
                             ('HSS', 'HindSiliguri-SemiBold.ttf'),
                             ('HSB', 'HindSiliguri-Bold.ttf')):
            self.add_font(family, '', str(fonts / file))
        self.page_titles: list[str] = []

    STYLE_FAMILY = {'': 'HS', 'M': 'HSM', 'S': 'HSS', 'B': 'HSB'}

    def f(self, style: str = '', size: float = 9):
        self.set_font(self.STYLE_FAMILY[style], '', size)

    # -- primitives ------------------------------------------------
    def rounded(self, x, y, w, h, r=2.4, fill=None, stroke=None, lw=0.3):
        if fill:
            self.set_fill_color(*fill)
        if stroke:
            self.set_draw_color(*stroke)
            self.set_line_width(lw)
        self.rect(x, y, w, h, style='DF' if (fill and stroke) else ('F' if fill else 'D'),
                  round_corners=True, corner_radius=r)

    def text(self, x, y, txt, size=9, style='', color=INK, align='L', width=0):
        self.f(style, size)
        self.set_text_color(*color)
        if align == 'R':
            self.set_xy(x, y)
            self.cell(width, self.font_size * 1.55, txt, align='R')
        elif align == 'C':
            self.set_xy(x, y)
            self.cell(width, self.font_size * 1.55, txt, align='C')
        else:
            self.set_xy(x, y)
            self.cell(0, self.font_size * 1.55, txt)

    def wrap(self, x, y, w, txt, size=8.5, style='', color=MUTED, lh=4.4):
        self.f(style, size)
        self.set_text_color(*color)
        self.set_xy(x, y)
        self.multi_cell(w, lh, txt, new_x='LEFT', new_y='NEXT', align='L')
        return self.get_y()

    def wrap_height(self, w, txt, size=8.5, style='', lh=4.4) -> float:
        self.f(style, size)
        lines = self.multi_cell(w, lh, txt, dry_run=True, output='LINES')
        return len(lines) * lh

    def checkbox(self, x, y, s=3.4, color=(150, 168, 152)):
        self.set_draw_color(*color)
        self.set_line_width(0.3)
        self.rect(x, y, s, s, style='D', round_corners=True, corner_radius=0.8)

    def chip(self, x, y, txt, size=7.6, fg=GREEN, bg=GREEN_LIGHT):
        self.f('M', size)
        w = self.get_string_width(txt) + 4.4
        self.rounded(x, y, w, size * 0.62, r=1.6, fill=bg)
        self.set_text_color(*fg)
        self.set_xy(x, y + 0.35)
        self.cell(w, size * 0.5, txt, align='C')
        return w

    # -- chrome ----------------------------------------------------
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
        self.cell(0, 5, 'S ক্যাটাগরি = priority A + importance ★৫ · অ্যাপের ডেটা থেকেই তৈরি', align='L')
        self.set_y(-13)
        self.cell(0, 5, f'পৃষ্ঠা {bn(self.page_no())}', align='R')


# ---------------------------------------------------------------- page blocks

TEST_LINE = 'নিজেকে যাচাই: এই সপ্তাহের অধ্যায় থেকে ২৫টি MCQ + ২টি CQ ঘড়ি ধরে, না দেখে।'


def day_rows(pdf: RoutinePDF, day, inner_w):
    """(entry, head, title, task, height) for every row of a date card."""
    rows = []
    for e in day['entries']:
        if e['kind'] in ('chapter', 'heavy'):
            c, part, total = e['chapter'], e['part'], e['total']
            head = f'{SUBJECT_NAME[c.subject]} · {paper_bn(c.paper)}'
            title = f'অধ্যায় {c.number} — {c.title}'
            task = part_task(c, part, total)
            h = 4.4 + 4.9 + pdf.wrap_height(inner_w - 12, task, 8, lh=4.3) + 2.4
            rows.append((e, head, title, task, max(h, 16.2)))
        elif e['kind'] == 'test':
            rows.append((e, 'সাপ্তাহিক টেস্ট', 'পুরো সপ্তাহের রিভিশন টেস্ট', TEST_LINE, 17))
    return rows


def day_card(pdf: RoutinePDF, x, y, w, day) -> float:
    """Draw one date card, return its height."""
    date = day['date']
    kind = day['entries'][0]['kind']
    pad = 4.2
    inner_x = x + pad + 3.8
    inner_w = w - pad * 2 - 3.8

    rows = day_rows(pdf, day, inner_w)
    height = 10.4 + sum(r[4] for r in rows) + 3.6
    if kind == 'buffer':
        height = 27
    if kind == 'final':
        height = 34

    fill = {'chapter': (255, 255, 255), 'heavy': AMBER_LIGHT, 'buffer': (246, 248, 244),
            'final': GREEN_LIGHT}[kind]
    pdf.rounded(x, y, w, height, r=3, fill=fill, stroke=LINE, lw=0.35)

    # date header strip
    head_fill = LIME if kind == 'final' else (243, 247, 240)
    pdf.set_fill_color(*head_fill)
    pdf.rect(x, y, w, 10.4, style='F', round_corners=True, corner_radius=3)
    pdf.rect(x, y + 6, w, 4.4, style='F')
    day_num = bn(date.day)
    pdf.text(x + pad, y + 1.5, f'{WEEK_SHORT[date.weekday()]}, {day_num} {MONTHS[date.month]}',
             10, 'S', INK)
    right = {'chapter': 'পড়ার দিন', 'heavy': 'ফোকাস ডে', 'buffer': 'বাফার',
             'final': 'ফাইনাল রিভিউ'}[kind]
    pdf.f('M', 7.8)
    pdf.set_text_color(*SOFT)
    pdf.set_xy(x, y + 2.9)
    pdf.cell(w - pad, 4.5, right, align='R')

    cy = y + 10.4 + 2.4
    tx = inner_x - 1

    if kind == 'buffer':
        pdf.f('M', 8.6)
        pdf.set_text_color(*MUTED)
        pdf.set_xy(tx, cy)
        pdf.multi_cell(inner_w + 1, 4.7,
                       'বাফার দিন — পিছিয়ে থাকা অধ্যায় বা টেস্টের ভুলগুলো ঠিক করার জন্য খোলা। '
                       'সব শেষ থাকলে বিশ্রাম নাও।', new_x='LEFT', new_y='NEXT')
        return height
    if kind == 'final':
        pdf.f('S', 9)
        pdf.set_text_color(*GREEN)
        pdf.set_xy(tx, cy)
        pdf.multi_cell(inner_w + 1, 4.9,
                       'ফাইনাল রিভিউ — ৩৯টি S অধ্যায়ের নোট একবার পড়ে প্রতিটার ২টি CQ + ১৫টি MCQ '
                       'না দেখে সমাধান করো।', new_x='LEFT', new_y='NEXT')
        pdf.f('M', 8)
        pdf.set_text_color(*MUTED)
        pdf.set_xy(tx, cy + 8.6)
        pdf.cell(0, 5, 'ভুলগুলো আলাদা খাতায় লিখে রাখো — ১ জানুয়ারি সেগুলোই সবচেয়ে দামি।')
        return height

    for e, head, title, task, h in rows:
        if e['kind'] == 'test':
            pdf.rounded(x + pad - 1.4, cy - 0.4, w - pad * 2 + 1.4, h - 2.2, r=2.2,
                        fill=(252, 245, 232), stroke=(235, 215, 178))
            pdf.checkbox(inner_x - 4.4, cy + 1.4, 3.6, AMBER)
            pdf.f('M', 7.2)
            pdf.set_text_color(*AMBER)
            pdf.set_xy(inner_x + 1.4, cy)
            pdf.cell(0, 4.6, head)
            pdf.f('S', 9.2)
            pdf.set_text_color(*AMBER)
            pdf.set_xy(inner_x + 1.4 + pdf.get_string_width(head) + 2.4, cy)
            pdf.cell(0, 4.6, title)
            pdf.wrap(inner_x + 4.2, cy + 5.2, inner_w - 7, task, 8, 'M', (138, 90, 27), lh=4.3)
            cy += h
            continue

        c = e['chapter']
        accent = SUBJECT_COLOR[c.subject]
        pdf.set_fill_color(*accent)
        pdf.rect(x + pad - 1.3, cy + 1.0, 1.6, h - 4.2, style='F',
                 round_corners=True, corner_radius=0.7)
        pdf.checkbox(inner_x - 4.4, cy + 1.2, 3.6, accent)
        pdf.f('M', 7.2)
        pdf.set_text_color(*accent)
        pdf.set_xy(inner_x + 1.4, cy)
        pdf.cell(0, 4.6, head)
        pdf.f('S', 9.2)
        pdf.set_text_color(*INK)
        pdf.set_xy(inner_x + 1.4 + pdf.get_string_width(head) + 2.4, cy)
        pdf.cell(0, 4.6, title)
        # step chip: ধাপ ২/৩
        if e['total'] > 1:
            chip_txt = f'ধাপ {bn(e["part"])}/{bn(e["total"])}'
            pdf.f('M', 6.9)
            cw = pdf.get_string_width(chip_txt) + 4.2
            pdf.rounded(x + w - pad - cw, cy + 0.6, cw, 4.4, r=1.5, fill=SUBJECT_TINT[c.subject])
            pdf.set_text_color(*accent)
            pdf.set_xy(x + w - pad - cw, cy + 1.4)
            pdf.cell(cw, 3.6, chip_txt, align='C')
        pdf.wrap(inner_x + 4.2, cy + 5.3, inner_w - 7, task, 8, '', MUTED, lh=4.3)
        cy += h
    return height


def after_block(pdf: RoutinePDF, y):
    """What comes after 1 January — the A/B remainder, still from the app data."""
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
        s_count = sum(1 for c in group if c.priority == 'A' and stars.get(c.id) == 5)
        a_left = sum(1 for c in group if c.priority == 'A' and stars.get(c.id) != 5)
        b_count = sum(1 for c in group if c.priority == 'B')
        c_count = sum(1 for c in group if c.priority == 'C')
        pdf.set_draw_color(*LINE)
        pdf.line(15, y + 8.4, 195, y + 8.4)
        pdf.text(15, y + 1.0, SUBJECT_NAME[sub], 8.6, 'S', SUBJECT_COLOR[sub])
        pdf.text(70, y + 1.0, bn(s_count), 8.6, 'M', GREEN)
        pdf.text(108, y + 1.0, bn(a_left), 8.6, 'M', INK)
        pdf.text(140, y + 1.0, bn(b_count), 8.6, '', MUTED)
        pdf.text(166, y + 1.0, bn(c_count), 8.6, '', MUTED)
        y += 9.6
    y += 1
    pdf.rounded(13, y, 184, 13, r=2.6, fill=(249, 251, 248), stroke=LINE)
    pdf.f('', 7.8)
    pdf.set_text_color(*MUTED)
    pdf.set_xy(17, y + 2.6)
    pdf.multi_cell(176, 4.2,
                   '১ জানুয়ারির পর একই ছন্দে বাকি A অধ্যায়, তারপর B — C অধ্যায় সংস্করণভেদে বাদ দেওয়া যায়। '
                   'অ্যাপের Syllabus পেজে প্রতিটি অধ্যায়ের ধাপ টিক দিয়ে এগোবে।', align='L')
    return y + 13


def final_recap_block(pdf: RoutinePDF, y):
    """Seven-subject recap table that fills the last page."""
    pdf.rounded(13, y, 184, 9.4, r=2.6, fill=GREEN)
    pdf.text(17, y + 1.2, 'ফাইনাল রিভিউ প্ল্যান · ১ জানুয়ারি', 9.6, 'S', (255, 255, 255))
    pdf.f('', 7.6)
    pdf.set_text_color(*LIME)
    pdf.set_xy(13, y + 1.6)
    pdf.cell(181, 4.4, 'প্রতি বিষয়ে ৪৫–৬০ মিনিট', align='R')
    y += 9.4

    rows = [
        ('পদার্থবিজ্ঞান', '১০ অধ্যায় · সূত্রের শিট + ২৫ MCQ'),
        ('রসায়ন', '৪ অধ্যায় · বিক্রিয়া/সমীকরণ + ২০ MCQ'),
        ('জীববিজ্ঞান', '৭ অধ্যায় · চিত্র ও পার্থক্য + ২৫ MCQ'),
        ('উচ্চতর গণিত', '৫ অধ্যায় · ৫টি অঙ্ক + ১০ MCQ'),
        ('বাংলা', '৫ অধ্যায় · ২টি CQ + ব্যাকরণের নিয়ম'),
        ('English', '৪ অধ্যায় · ১টি paragraph + grammar ২০টি'),
        ('ICT', '৪ অধ্যায় · HTML কোড + ২০ MCQ'),
    ]
    for name, detail in rows:
        pdf.rounded(13, y, 184, 11.4, r=2.4, fill=(252, 253, 251), stroke=LINE)
        pdf.checkbox(17, y + 3.6, 4, GREEN)
        pdf.text(24, y + 2.2, name, 9, 'S', INK)
        pdf.f('', 8)
        pdf.set_text_color(*MUTED)
        pdf.set_xy(78, y + 2.4)
        pdf.cell(0, 4.6, detail)
        pdf.f('M', 7)
        pdf.set_text_color(*SOFT)
        pdf.set_xy(13, y + 2.4)
        pdf.cell(181, 4.6, 'টিক দাও', align='R')
        y += 12.4
    return y


def section_title(pdf: RoutinePDF, y, title, sub=''):
    pdf.text(13, y, title, 14, 'B', INK)
    if sub:
        pdf.f('', 8.4)
        pdf.set_text_color(*MUTED)
        pdf.set_xy(13, y + 6.4)
        pdf.cell(0, 4.6, sub)
        return y + 13.5
    return y + 9.5


# ------------------------------------------------------------------- assembly

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
    pdf.cell(0, 5.6, 'সবচেয়ে গুরুত্বপূর্ণ ৩৯টি অধ্যায় · তারিখ ধরে ধরে · ১ জানুয়ারির মধ্যে শেষ')
    pdf.set_xy(15, 45)
    pdf.f('M', 10)
    pdf.set_text_color(*LIME)
    pdf.cell(0, 5.6, f'{date_bn(start, True)}  →  {date_bn(end, True)}   ·   {bn(len(schedule))} দিন')

    y = 65
    sessions = sum(1 for d in schedule for e in d['entries'] if e['kind'] in ('chapter', 'heavy'))
    tests = sum(1 for d in schedule for e in d['entries'] if e['kind'] == 'test')
    stats = [(bn(len(chapters)), 'S অধ্যায়'), (bn(len({c.subject for c in chapters})), 'বিষয়'),
             (bn(len(schedule)), 'দিন'), (bn(sessions), 'সেশন'), (bn(tests), 'টেস্ট')]
    w = 184 / len(stats)
    for i, (num, label) in enumerate(stats):
        x = 13 + i * w
        pdf.rounded(x, y, w - 3, 19, r=3, fill=(247, 250, 246), stroke=LINE)
        pdf.text(x + 3, y + 2.2, num, 15.5, 'B', GREEN)
        pdf.f('', 7.8)
        pdf.set_text_color(*MUTED)
        pdf.set_xy(x + 3, y + 12, )
        pdf.cell(w - 6, 4.4, label)

    y = 90
    pdf.text(13, y, 'বিষয়ভিত্তিক ভাগ', 11, 'S', INK)
    y += 7.4
    per_subject = {s: [c for c in chapters if c.subject == s] for s in SUBJECT_ORDER}
    for i, sub in enumerate(SUBJECT_ORDER):
        x = 13 + (i % 4) * 46
        yy = y + (i // 4) * 23
        pdf.rounded(x, yy, 43, 20, r=3, fill=SUBJECT_TINT[sub], stroke=LINE)
        pdf.set_fill_color(*SUBJECT_COLOR[sub])
        pdf.rect(x, yy, 1.8, 20, style='F', round_corners=True, corner_radius=0.9)
        pdf.text(x + 4.6, yy + 2.2, SUBJECT_NAME[sub], 8.6, 'S', SUBJECT_COLOR[sub])
        pdf.text(x + 4.6, yy + 8.6, bn(len(per_subject[sub])), 15, 'B', SUBJECT_COLOR[sub])
        pdf.f('', 7)
        pdf.set_text_color(*MUTED)
        pdf.set_xy(x + 15.4, yy + 12.4)
        pdf.cell(24, 4.4, 'অধ্যায়')

    y = y + 2 * 23 + 3
    pdf.text(13, y, 'সপ্তাহে কী কী', 11, 'S', INK)
    y += 7.4
    bottom = 270
    avail = bottom - y
    row_h = min(18.5, avail / len(weeks))
    for wk in weeks:
        pdf.rounded(13, y, 184, row_h - 2, r=2.6, fill=(252, 253, 251), stroke=LINE)
        pdf.set_fill_color(*GREEN)
        pdf.rect(13, y, 1.6, row_h - 2, style='F', round_corners=True, corner_radius=0.8)
        pdf.text(17.5, y + 1.1, wk['label'], 8.5, 'S', INK)
        if wk['steps']:
            tag = f"{bn(wk['steps'])} ধাপ · {bn(len(wk['done']))}টি অধ্যায় শেষ"
            pdf.f('M', 7.2)
            tw = pdf.get_string_width(tag) + 5
            pdf.rounded(197 - tw, y + 1.4, tw, 5, r=1.6, fill=GREEN_LIGHT)
            pdf.set_text_color(*GREEN)
            pdf.set_xy(197 - tw, y + 2.2)
            pdf.cell(tw, 4, tag, align='C')
        detail = ' · '.join(f'{t} ✓' if t not in wk['partial'] else f'{t} (চলমান)'
                            for t in wk['done'])
        pdf.wrap(17.5, y + 7.2, 172, detail, 7.5, lh=4.0)
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


def rules_page(pdf: RoutinePDF, schedule, chapters):
    pdf.add_page()
    pdf.header_bar('কীভাবে ব্যবহার করবে')
    y = 21
    y = section_title(pdf, y, 'চারটি নিয়ম',
                      'এই চারটা ধরে চললে ১ জানুয়ারির মধ্যে ৩৯টি অধ্যায় শেষ হবে।')
    test_days = [d['date'] for d in schedule if any(e['kind'] == 'test' for e in d['entries'])]
    rules = [
        ('১', 'এক দিনে ৩–৪টি বিষয়, একটানা নয়',
         'প্রতিটি অধ্যায়ের ধাপ আলাদা দিনে ভাগ করা আছে, যাতে একই বিষয় টানা না হয়। '
         'এক সেশন ৫০ মিনিট — ১০ মিনিট বিরতি।'),
        ('২', 'ধাপ মানে আলাদা কাজ',
         'ধাপ ১ = ওয়ান-শট ক্লাস + নিজের নোট। মাঝের ধাপ = বইয়ের উদাহরণ ও গণিত হাতে-কলমে। '
         'শেষ ধাপ = বিগত বোর্ডের CQ ও MCQ ঘড়ি ধরে।'),
        ('৩', 'পিছিয়ে গেলে বাফার ব্যবহার করো',
         f'{date_bn(schedule[-2]["date"])} খালি রাখা আছে। কোনো দিন মিস হলে সেখানে ধরে নাও — '
         'অন্য অধ্যায় কেটে দিও না।'),
        ('৪', 'সপ্তাহে একদিন টেস্ট',
         'টেস্টের দিন: ' + ' · '.join(date_bn(d) for d in test_days) +
         f'। {date_bn(schedule[-1]["date"])} ফাইনাল রিভিউ। স্কোর লগ শেষে আছে।'),
    ]
    for num, title, body in rules:
        h = 20.5
        pdf.rounded(13, y, 184, h, r=3, fill=(252, 253, 251), stroke=LINE)
        pdf.rounded(17, y + 4, 12, 12, r=3, fill=GREEN_LIGHT)
        pdf.text(17, y + 5.4, num, 10, 'B', GREEN, align='C', width=12)
        pdf.text(32, y + 3.2, title, 10.2, 'S', INK)
        pdf.wrap(32, y + 9.6, 160, body, 8.4, lh=4.4)
        y += h + 3.6

    y += 3
    pdf.text(13, y, 'মাইলস্টোন', 11, 'S', INK)
    y += 7
    heads = ['কখন', 'কী শেষ থাকবে', 'টার্গেট']
    pdf.set_fill_color(*GREEN_LIGHT)
    pdf.rect(13, y, 184, 8, style='F', round_corners=True, corner_radius=2)
    pdf.text(15, y + 1.4, heads[0], 8, 'S', GREEN)
    pdf.text(45, y + 1.4, heads[1], 8, 'S', GREEN)
    pdf.f('S', 8)
    pdf.set_text_color(*GREEN)
    pdf.set_xy(13, y + 1.4)
    pdf.cell(182, 4.4, heads[2], align='R')
    y += 9.8

    total_units = sum(c.effort for c in chapters)

    def progress_at(day_limit):
        done, books = 0, set()
        for day in schedule:
            if day['date'] > day_limit:
                break
            for e in day['entries']:
                if e['kind'] in ('chapter', 'heavy'):
                    done += 1
                    books.add((e['chapter'].subject, e['chapter'].paper))
        return books, done

    checks = [schedule[i]['date'] for i in range(0, len(schedule) - 2, 7)] + [schedule[-2]['date']]
    for d in checks:
        books, done = progress_at(d)
        groups = {}
        for sub, pp in books:
            groups.setdefault(sub, []).append(pp)
        names = ' · '.join(
            f"{SUBJECT_NAME[sub].split()[0]} {bn(sub_sum := sum(groups[sub]))}"
            for sub in sorted(groups, key=SUBJECT_ORDER.index)) if books else 'কিছুই না — শুরু'
        target = f'{bn(done)}/{bn(total_units)} ধাপ · {bn(len(books))} বই'
        h = max(9.4, pdf.wrap_height(102, 'শেষ: ' + names, 8, lh=4.2) + 3.2)
        pdf.set_draw_color(*LINE)
        pdf.line(13, y + h - 0.6, 197, y + h - 0.6)
        pdf.text(15, y + 1.2, date_bn(d), 8, 'M', INK)
        pdf.wrap(45, y + 1.2, 100, 'শেষ: ' + names, 8, '', MUTED, lh=4.2)
        pdf.f('M', 8)
        pdf.set_text_color(*GREEN)
        pdf.set_xy(13, y + 1.2)
        pdf.cell(182, 4.4, target, align='R')
        y += h

    heavy = max(chapters, key=lambda c: c.effort)
    y += 2
    pdf.rounded(13, y, 184, 17, r=3, fill=AMBER_LIGHT, stroke=(235, 215, 178))
    pdf.f('M', 8.6)
    pdf.set_text_color(*AMBER)
    pdf.set_xy(17, y + 4.2)
    pdf.multi_cell(176, 4.8,
                   f'সতর্কতা: {heavy.title} ({SUBJECT_NAME[heavy.subject]} {paper_bn(heavy.paper)}, '
                   f'অধ্যায় {heavy.number}) সবচেয়ে ভারী — {bn(heavy.effort)} ধাপ। এই অধ্যায়ের জন্য '
                   'আলাদা “ফোকাস ডে” রাখা আছে; ওই দিন অন্য কিছু যোগ কোরো না।', align='L')
    return y


def routine_pages(pdf: RoutinePDF, schedule):
    """Auto-flowing date cards down the page."""
    label = f'{date_bn(schedule[0]["date"])} – {date_bn(schedule[-1]["date"])}'
    pdf.add_page()
    pdf.header_bar(label)
    pdf.footer_bar()
    y = 21
    y = section_title(pdf, y, 'দিনভিত্তিক রুটিন',
                      'প্রতিটি বাক্সে টিক দাও — অধ্যায়ের ধাপ শেষ হলেই। বাদামি বাক্স = সাপ্তাহিক টেস্ট।')
    for day in schedule:
        h = day_height(pdf, day)
        if y + h > 272:
            pdf.add_page()
            pdf.header_bar(label)
            pdf.footer_bar()
            y = 21
        if day['entries'][0]['kind'] == 'final':
            h = 34
        day_card(pdf, 13, y, 184, day)
        y += h + 4.2
        if day['entries'][0]['kind'] == 'final':
            y = final_recap_block(pdf, y + 2)
            y = after_block(pdf, y + 5)


def day_height(pdf: RoutinePDF, day) -> float:
    kind = day['entries'][0]['kind']
    if kind == 'buffer':
        return 27
    if kind == 'final':
        return 34
    return 10.4 + sum(r[4] for r in day_rows(pdf, day, 184 - 4.2 * 2 - 3.8)) + 3.6


def checklist_section(pdf: RoutinePDF, chapters):
    pdf.add_page()
    pdf.header_bar('পুরো S চেকলিস্ট')
    pdf.footer_bar()
    y = 21
    y = section_title(pdf, y, 'সব S অধ্যায় · এক পাতায় ট্র্যাকার',
                      'বাঁ দিকের বড় বাক্স = অধ্যায় পুরো শেষ · তারপর পাঁচটি ধাপ আলাদা করে টিক দাও।')
    stages = ['ক্লাস', 'নোট', 'অনুশীলন', 'রিভিশন', 'টেস্ট']
    col_start, col_w = 149.5, 9.6      # 5 columns inside 149.5–197

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


def log_page(pdf: RoutinePDF, schedule):
    pdf.add_page()
    pdf.header_bar('টেস্ট লগ ও শেষ কথা')
    pdf.footer_bar()
    y = 21
    y = section_title(pdf, y, 'সাপ্তাহিক টেস্ট লগ', 'প্রতি টেস্টের পর খাতায় হাতে লিখে রাখো।')

    pdf.set_fill_color(*GREEN_LIGHT)
    pdf.rect(13, y, 184, 8.4, style='F', round_corners=True, corner_radius=2)
    pdf.text(15, y + 1.6, 'তারিখ', 8, 'S', GREEN)
    pdf.text(39, y + 1.6, 'কী ছিল', 8, 'S', GREEN)
    pdf.text(146, y + 1.6, 'MCQ /২৫', 8, 'S', GREEN)
    pdf.text(168, y + 1.6, 'CQ /১০', 8, 'S', GREEN)
    y += 10.4
    # what each weekly test actually covers = chapters studied since the previous test
    tests, covered = [], []
    for day in schedule:
        if any(e['kind'] == 'test' for e in day['entries']):
            recent = covered[-3:]
            tests.append((date_bn(day['date']), f'সাম্প্রতিক: {" · ".join(recent)}'))
            covered = []
        covered += [e['chapter'].title for e in day['entries']
                    if e['kind'] in ('chapter', 'heavy')]
    covered = []
    for day in schedule:
        if not any(e['kind'] == 'test' for e in day['entries']):
            covered += [e['chapter'].title for e in day['entries']
                        if e['kind'] in ('chapter', 'heavy')]
    tests.append((date_bn(schedule[-1]['date']), 'ফুল সিলেবাস — ৩৯টি S অধ্যায় (১ জানুয়ারি)'))

    for date, chapter_list in tests[:5]:
        pdf.rounded(13, y, 184, 12, r=2, fill=(255, 255, 255), stroke=LINE)
        pdf.text(15, y + 1.4, date, 8.4, 'M', INK)
        pdf.wrap(39, y + 1.4, 104, chapter_list, 7.8, '', MUTED, lh=4.2)
        pdf.set_draw_color(*LINE)
        for i in range(2):
            pdf.line(146 + i * 22, y + 3.4, 164 + i * 22, y + 3.4)
        pdf.line(173, y + 3.4, 140 + 55, y + 3.4)
        y += 13.4

    y += 6
    pdf.text(13, y, 'শেষ কথা', 11, 'S', INK)
    y += 8
    notes = [
        'S তালিকা শেষ মানে সিলেবাস শেষ নয় — বাকি A ও B অধ্যায়গুলো এরপরে একই ছন্দে ধরবে।',
        'প্রতিদিন শেষে ৩ মিনিট: আজ কী শেষ হলো, কাল কী, কোনটা আবার দেখতে হবে — অ্যাপে টিক দিয়ে রাখো।',
        'ঘুম ৭ ঘণ্টা আর সপ্তাহে একদিন পুরো বিশ্রাম — এটাও রুটিনের অংশ, বাদ দিলে ৩৯ অধ্যায় টিকবে না।',
    ]
    for n in notes:
        pdf.rounded(13, y, 184, 15, r=2.6, fill=(249, 251, 248), stroke=LINE)
        pdf.set_fill_color(*GREEN)
        pdf.circle(19.5, y + 7.5, 1.4, style='F')
        pdf.wrap(24, y + 2.6, 168, n, 8.4, lh=4.6)
        y += 17

    y += 2
    pdf.rounded(13, y, 184, 22, r=3, fill=GREEN)
    pdf.f('S', 11)
    pdf.set_text_color(255, 255, 255)
    pdf.set_xy(17, y + 3.6)
    pdf.cell(0, 6, '১ জানুয়ারি: ৩৯টি অধ্যায়, ৫টি স্টেজ — সব টিক পড়বে।')
    pdf.f('', 8.2)
    pdf.set_text_color(*LIME)
    pdf.set_xy(17, y + 11.6)
    pdf.cell(0, 5, 'HSC 27 · S ক্যাটাগরি রুটিন · অ্যাপের নিজের ডেটা থেকে তৈরি')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--fonts', default='/tmp')
    ap.add_argument('--start', default='2026-11-27')
    ap.add_argument('--end', default='2027-01-01')
    ap.add_argument('--out', default='S-CATEGORY-ROUTINE.pdf')
    args = ap.parse_args()

    start = dt.date.fromisoformat(args.start)
    end = dt.date.fromisoformat(args.end)

    chapters_all = load_chapters()
    stars = load_stars()
    s_chapters = [c for c in chapters_all if c.priority == 'A' and stars.get(c.id) == 5]
    s_chapters.sort(key=lambda c: SUBJECT_ORDER.index(c.subject))

    schedule = build_schedule(start, end, s_chapters)

    pdf = RoutinePDF(Path(args.fonts))
    pdf.set_title('HSC 27 · S ক্যাটাগরি রুটিন')
    pdf.set_author('HSC 27 · প্রস্তুতি')
    weeks = week_summaries(schedule)
    cover(pdf, schedule, s_chapters, start, end, weeks)
    rules_page(pdf, schedule, s_chapters)
    routine_pages(pdf, schedule)
    checklist_section(pdf, s_chapters)
    log_page(pdf, schedule)
    pdf.output(args.out)
    print(f'{args.out}: {len(s_chapters)} S chapters, {len(schedule)} days, {pdf.page_no()} pages')


if __name__ == '__main__':
    main()
