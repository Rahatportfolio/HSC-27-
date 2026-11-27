#!/usr/bin/env python3
"""
Compose the seven subject wallpapers.

Reads the generated backgrounds (wallpapers/bg-<subject>.png), lays the subject
name, its S-chapter count and the chapter list on top with proper Bengali
shaping, then rasterises to 1440x2576 phone wallpapers.

Needs: fpdf2, uharfbuzz, pypdfium2 and Hind Siliguri TTFs in --fonts.
    python3 scripts/make-subject-wallpapers.py --fonts /tmp
"""
from __future__ import annotations

import argparse
from pathlib import Path

import pypdfium2 as pdfium
from fpdf import FPDF

ROOT = Path(__file__).resolve().parent.parent
WALL = ROOT / 'wallpapers'

PAGE_W, PAGE_H = 108.0, 193.2          # mm — 9:16, renders to 1440x2576
SCALE = 1440 / (PAGE_W / 25.4 * 72)    # render scale to hit 1440 px wide

CREAM = (247, 246, 232)
LIME = (220, 232, 196)
WHITE = (255, 255, 255)
DIM = (214, 226, 208)

SUBJECTS = [
    # file, Bengali name, English name, chapter lines for the footer block
    ('physics', 'পদার্থবিজ্ঞান', None,
     ['গতিবিদ্যা', 'নিউটনিয়ান বলবিদ্যা', 'কাজ, শক্তি ও ক্ষমতা', 'মহাকর্ষ ও অভিকর্ষ',
      'পর্যাবৃত্ত গতি', 'আদর্শ গ্যাস ও গতিতত্ত্ব', 'তাপগতিবিদ্যা', 'চলতড়িৎ',
      'তড়িৎচুম্বকীয় আবেশ', 'জ্যামিতিক আলোকবিজ্ঞান']),
    ('chemistry', 'রসায়ন', None,
     ['মৌলের পর্যাবৃত্ত ধর্ম ও রাসায়নিক বন্ধন', 'রাসায়নিক পরিবর্তন',
      'জৈব রসায়ন', 'পরিমাণগত রসায়ন']),
    ('biology', 'জীববিজ্ঞান', None,
     ['কোষ ও এর গঠন', 'কোষ বিভাজন', 'উদ্ভিদ শারীরতত্ত্ব', 'জীবপ্রযুক্তি',
      'রক্ত ও সঞ্চালন', 'সমন্বয় ও নিয়ন্ত্রণ', 'জিনতত্ত্ব ও বিবর্তন']),
    ('math', 'উচ্চতর গণিত', None,
     ['ম্যাট্রিক্স ও নির্ণায়ক', 'ত্রিকোণমিতিক অনুপাত',
      'সংযুক্ত কোণের ত্রিকোণমিতিক অনুপাত', 'অন্তরীকরণ', 'যোগজীকরণ']),
    ('bangla', 'বাংলা', None,
     ['গদ্য: পাঠ ১–৩', 'কবিতা: পাঠ ১–৩', 'সহপাঠ: উপন্যাস',
      'পদ, বাক্য, প্রয়োগ–অপপ্রয়োগ', 'সারাংশ, সারমর্ম ও ভাব-সম্প্রসারণ']),
    ('english', 'English', None,
     ['Reading: detail ও main idea', 'Paragraph ও description',
      'Tense, right form of verbs ও agreement', 'Modifiers ও sentence connectors']),
    ('ict', 'আইসিটি', None,
     ['সংখ্যা পদ্ধতি ও ডিজিটাল ডিভাইস', 'ওয়েব ডিজাইন পরিচিতি ও HTML',
      'প্রোগ্রামিং ভাষা', 'ডেটাবেজ ম্যানেজমেন্ট সিস্টেম']),
]

BN = '০১২৩৪৫৬৭৮৯'


def bn(n) -> str:
    return ''.join(BN[int(c)] if c.isdigit() else c for c in str(n))


def apply_scrim(image):
    """Smooth darkening from 40% height downwards, so cream type stays readable."""
    from PIL import Image
    w, h = image.size
    start = int(h * 0.40)
    ramp = Image.linear_gradient('L').resize((w, h - start))
    # linear_gradient runs 0 at the top -> 255 at the bottom; scale to max 0.55
    ramp = ramp.point(lambda v: int(v * 0.55))
    shade = Image.new('L', (w, h), 0)
    shade.paste(ramp, (0, start))
    overlay = Image.new('RGB', (w, h), (10, 32, 24))
    return Image.composite(overlay, image, shade)


class Wallpaper(FPDF):
    def __init__(self, fonts: Path):
        super().__init__(format=(PAGE_W, PAGE_H), unit='mm')
        self.set_auto_page_break(False)
        self.set_margins(0, 0, 0)
        self.set_text_shaping(True)
        for family, file in (('HS', 'HindSiliguri-Regular.ttf'),
                             ('HSM', 'HindSiliguri-Medium.ttf'),
                             ('HSS', 'HindSiliguri-SemiBold.ttf'),
                             ('HSB', 'HindSiliguri-Bold.ttf')):
            self.add_font(family, '', str(fonts / file))


# fpdf2 accepts only B/I as style letters, so each weight is its own family.
FAMILY = {'': 'HS', 'M': 'HSM', 'S': 'HSS', 'B': 'HSB'}


def setf(pdf: Wallpaper, style: str, size: float, color=CREAM):
    pdf.set_font(FAMILY[style], '', size)
    pdf.set_text_color(*color)


def build_one(fonts: Path, slug: str, name: str, chapters: list[str]) -> Path:
    pdf = Wallpaper(fonts)
    pdf.add_page()
    pdf.image(str(WALL / f'bg-{slug}.png'), x=0, y=0, w=PAGE_W, h=PAGE_H)


    left = 14.0
    # ---- top eyebrow
    setf(pdf, 'M', 8.4, LIME)
    pdf.set_xy(left, 15)
    pdf.cell(0, 4.6, 'HSC 27 · S ক্যাটাগরি')

    # ---- subject title block, sits in the calm middle
    title_size = 34 if slug != 'english' else 33
    setf(pdf, 'B', title_size, CREAM)
    title_y = 86
    pdf.set_xy(left, title_y)
    pdf.cell(0, 16, name)

    # thin rule
    pdf.set_draw_color(*LIME)
    pdf.set_line_width(0.5)
    pdf.line(left, title_y + 17.0, left + 20, title_y + 17.0)

    # ---- chapter count
    setf(pdf, 'M', 11.5, LIME)
    pdf.set_xy(left, title_y + 20)
    pdf.cell(0, 6, f'{bn(len(chapters))}টি S অধ্যায়')

    # ---- chapter list
    y = title_y + 30
    for title in chapters:
        pdf.set_draw_color(*LIME)
        pdf.set_line_width(0.35)
        pdf.rect(left, y + 0.75, 2.4, 2.4, style='D', round_corners=True, corner_radius=0.6)
        setf(pdf, '', 8.2, DIM)
        pdf.set_xy(left + 4.4, y - 0.6)
        pdf.cell(0, 4.4, title)
        y += 5.6

    # ---- footer
    pdf.set_draw_color(*LIME)
    pdf.set_line_width(0.3)
    pdf.line(left, PAGE_H - 20, PAGE_W - left, PAGE_H - 20)
    setf(pdf, 'M', 8.2, LIME)
    pdf.set_xy(left, PAGE_H - 17.4)
    pdf.cell(0, 4.6, 'প্রতিদিন ১টি অধ্যায় · শুক্রবার বন্ধ')
    setf(pdf, '', 7.4, (188, 205, 190))
    pdf.set_xy(left, PAGE_H - 12.4)
    pdf.cell(0, 4.4, '২৭ নভেম্বর – ১১ জানুয়ারি · HSC 27')

    tmp_pdf = WALL / f'.{slug}.pdf'
    pdf.output(str(tmp_pdf))
    doc = pdfium.PdfDocument(str(tmp_pdf))
    page = doc[0]
    image = page.render(scale=SCALE).to_pil().convert('RGB')
    image = apply_scrim(image)
    out = WALL / f'HSC27-{slug}.png'
    image.save(out, optimize=True)
    doc.close()
    tmp_pdf.unlink()
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--fonts', default='/tmp')
    args = ap.parse_args()
    fonts = Path(args.fonts)
    for slug, name, _, chapters in SUBJECTS:
        out = build_one(fonts, slug, name, chapters)
        print(out.relative_to(ROOT))


if __name__ == '__main__':
    main()
