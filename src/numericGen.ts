import { chapterById } from './data';
import type { SubjectId } from './data';
import { isEnglish } from './i18n';
import { bn } from './planner';
import type { QuizQuestion } from './types';

/**
 * Numeric question engine — depth without hand-written answers.
 *
 * Every item here is *computed*, not remembered: a schema picks numbers, applies a
 * standard textbook formula, and derives the answer arithmetically. That means the
 * correctness check is exact and automatic (`verifyNumeric` recomputes from the same
 * seed), and the explanation can show the substitution step by step.
 *
 * Distractors are the classic slips (forgetting ½, dividing instead of multiplying,
 * ignoring a squared term) — never random noise, so a wrong option always teaches
 * something about the mistake.
 */

export const NUMERIC_PREFIX = 'num|';
export const NUMERIC_SOURCE = 'স্বয়ংক্রিয় · সূত্র-গণনা (যাচাইকৃত)';

type Vars = Record<string, number>;

interface Schema {
  id: string;
  chapterId: string;
  subject: SubjectId;
  /** Quantity the question asks for, in Bangla and English. */
  quantity: { bn: string; en: string };
  /** Formula shown in the explanation. */
  formula: { bn: string; en: string };
  /** How the prompt reads, given the seeded variables. */
  prompt: (vars: Vars) => { bn: string; en: string };
  /** The correct value. */
  solve: (vars: Vars) => number;
  unit: string;
  /** Classic wrong answers; each must differ from the right one. */
  slips: ((vars: Vars) => number)[];
  /** "Why" line shown after the answer. */
  note?: { bn: string; en: string };
}

const r2 = (value: number) => Math.round(value * 100) / 100;
/** Prompts are written with plain digits; Bangla mode converts them for display consistency. */
const localize = (text: string, english: boolean) => (english ? text : bn(text));
const n = (value: number) => (Number.isInteger(value) ? String(value) : String(r2(value)));

const SCHEMAS: Schema[] = [
  // ---------- Physics 1st paper ----------
  {
    id: 'p-f-ma', chapterId: 'physics-1-4', subject: 'physics',
    quantity: { bn: 'বল', en: 'force' }, formula: { bn: 'F = ma', en: 'F = ma' },
    prompt: v => ({ bn: `${n(v.m)} kg ভরের বস্তু ${n(v.a)} m/s² ত্বরণে চললে প্রযুক্ত বল কত?`, en: `A body of mass ${n(v.m)} kg accelerates at ${n(v.a)} m/s². What force acts on it?` }),
    solve: v => v.m * v.a, unit: 'N',
    slips: [v => v.m / v.a, v => v.m + v.a, v => v.m * v.a * 2],
    note: { bn: 'ভর × ত্বরণ = বল; একক নিউটন।', en: 'Mass × acceleration gives the force in newtons.' },
  },
  {
    id: 'p-kin-v', chapterId: 'physics-1-3', subject: 'physics',
    quantity: { bn: 'শেষ বেগ', en: 'final velocity' }, formula: { bn: 'v = u + at', en: 'v = u + at' },
    prompt: v => ({ bn: `একটি বস্তু ${n(v.u)} m/s প্রাথমিক বেগ নিয়ে ${n(v.a)} m/s² সমত্বরণে ${n(v.t)} s চললে শেষ বেগ কত?`, en: `A body starts at ${n(v.u)} m/s and accelerates uniformly at ${n(v.a)} m/s² for ${n(v.t)} s. Final velocity?` }),
    solve: v => v.u + v.a * v.t, unit: 'm/s',
    slips: [v => v.a * v.t, v => v.u - v.a * v.t, v => v.u + v.a],
    note: { bn: 'u + at; t সময়ে বেগ বেড়ে যায় at পরিমাণ।', en: 'u + at — velocity grows by at over time t.' },
  },
  {
    id: 'p-kin-s', chapterId: 'physics-1-3', subject: 'physics',
    quantity: { bn: 'সরণ', en: 'displacement' }, formula: { bn: 's = ut + ½at²', en: 's = ut + ½at²' },
    prompt: v => ({ bn: `স্থির অবস্থা থেকে ${n(v.a)} m/s² সমত্বরণে ${n(v.t)} s চললে বস্তুর সরণ কত?`, en: `Starting from rest, a body accelerates at ${n(v.a)} m/s² for ${n(v.t)} s. Displacement?` }),
    solve: v => 0.5 * v.a * v.t * v.t, unit: 'm',
    slips: [v => v.a * v.t * v.t, v => v.a * v.t, v => 0.5 * v.a * v.t],
    note: { bn: 'স্থির অবস্থায় u = ০, তাই s = ½at²।', en: 'From rest u = 0, so s = ½at².' },
  },
  {
    id: 'p-work', chapterId: 'physics-1-5', subject: 'physics',
    quantity: { bn: 'কৃত কাজ', en: 'work done' }, formula: { bn: 'W = Fs cosθ', en: 'W = Fs cosθ' },
    prompt: v => ({ bn: `${n(v.f)} N বল সরণের দিকে ${n(v.s)} m সরালে কৃত কাজ কত?`, en: `A force of ${n(v.f)} N moves a body ${n(v.s)} m along its own direction. Work done?` }),
    solve: v => v.f * v.s, unit: 'J',
    slips: [v => v.f / v.s, v => v.f + v.s, v => v.f * v.s * 0.5],
    note: { bn: 'বল ও সরণ একই দিকে হলে cos ০° = ১, তাই W = Fs।', en: 'Force along displacement means cos 0° = 1, so W = Fs.' },
  },
  {
    id: 'p-power', chapterId: 'physics-1-5', subject: 'physics',
    quantity: { bn: 'ক্ষমতা', en: 'power' }, formula: { bn: 'P = W/t', en: 'P = W/t' },
    prompt: v => ({ bn: `${n(v.w)} J কাজ ${n(v.t)} s-এ সম্পন্ন হলে ক্ষমতা কত?`, en: `${n(v.w)} J of work is done in ${n(v.t)} s. Power?` }),
    solve: v => v.w / v.t, unit: 'W',
    slips: [v => v.w * v.t, v => v.t / v.w, v => v.w / (v.t * 2)],
    note: { bn: 'ক্ষমতা = কাজ ÷ সময়, একক ওয়াট = জুল/সেকেন্ড।', en: 'Power = work ÷ time; 1 W = 1 J/s.' },
  },
  {
    id: 'p-ohm', chapterId: 'physics-2-3', subject: 'physics',
    quantity: { bn: 'বিভব পার্থক্য', en: 'potential difference' }, formula: { bn: 'V = IR', en: 'V = IR' },
    prompt: v => ({ bn: `${n(v.i)} A প্রবাহ ${n(v.r)} Ω রোধের ভেতর দিয়ে গেলে বিভব পার্থক্য কত?`, en: `A current of ${n(v.i)} A flows through ${n(v.r)} Ω. Potential difference?` }),
    solve: v => v.i * v.r, unit: 'V',
    slips: [v => v.i / v.r, v => v.i + v.r, v => v.r / v.i],
    note: { bn: 'ওহমের সূত্র: V = IR।', en: 'Ohm’s law: V = IR.' },
  },
  {
    id: 'p-ohm-i', chapterId: 'physics-2-3', subject: 'physics',
    quantity: { bn: 'প্রবাহ', en: 'current' }, formula: { bn: 'I = V/R', en: 'I = V/R' },
    prompt: v => ({ bn: `${n(v.v)} V বিভব ${n(v.r)} Ω রোধে প্রযুক্ত হলে প্রবাহ কত?`, en: `${n(v.v)} V is applied across ${n(v.r)} Ω. Current?` }),
    solve: v => v.v / v.r, unit: 'A',
    slips: [v => v.v * v.r, v => v.r / v.v, v => v.v / (2 * v.r)],
    note: { bn: 'I = V/R; রোধ বাড়লে প্রবাহ কমে।', en: 'I = V/R — more resistance means less current.' },
  },
  {
    id: 'p-series', chapterId: 'physics-2-3', subject: 'physics',
    quantity: { bn: 'তুল্য রোধ (শ্রেণি)', en: 'equivalent resistance (series)' }, formula: { bn: 'R = R₁ + R₂', en: 'R = R₁ + R₂' },
    prompt: v => ({ bn: `${n(v.r1)} Ω ও ${n(v.r2)} Ω রোধ শ্রেণিতে যুক্ত হলে তুল্য রোধ কত?`, en: `${n(v.r1)} Ω and ${n(v.r2)} Ω are joined in series. Equivalent resistance?` }),
    solve: v => v.r1 + v.r2, unit: 'Ω',
    slips: [v => (v.r1 * v.r2) / (v.r1 + v.r2), v => Math.abs(v.r1 - v.r2), v => v.r1 * v.r2],
    note: { bn: 'শ্রেণিতে রোধ যোগ হয়; সমান্তরালের সূত্রটি আলাদা (R = R₁R₂/(R₁+R₂))।', en: 'Series resistances add; the parallel formula is different (R₁R₂/(R₁+R₂)).' },
  },
  {
    id: 'p-graph', chapterId: 'physics-1-2', subject: 'physics',
    quantity: { bn: 'লব্ধির মান (লম্ব)', en: 'resultant of perpendicular vectors' }, formula: { bn: 'R = √(A² + B²)', en: 'R = √(A² + B²)' },
    prompt: v => ({ bn: `দুইটি লম্ব ভেক্টরের মান ${n(v.a)} ও ${n(v.b)} হলে লব্ধি কত?`, en: `Two perpendicular vectors have magnitudes ${n(v.a)} and ${n(v.b)}. Resultant?` }),
    solve: v => Math.sqrt(v.a * v.a + v.b * v.b), unit: '',
    slips: [v => v.a + v.b, v => Math.abs(v.a - v.b), v => Math.sqrt(v.a * v.b)],
    note: { bn: 'লম্ব হলে cos ৯০° = ০, তাই R = √(A² + B²)।', en: 'Perpendicular means cos 90° = 0, so R = √(A² + B²).' },
  },
  {
    id: 'p-pendulum', chapterId: 'physics-1-8', subject: 'physics',
    quantity: { bn: 'দোলনকাল', en: 'period' }, formula: { bn: 'T = 2π√(L/g)', en: 'T = 2π√(L/g)' },
    prompt: v => ({ bn: `L = ${n(v.l)} m দীর্ঘ সরল দোলকের দোলনকাল কত? (g = ৯.৮ m/s², π ≈ ৩.১৪)`, en: `A simple pendulum has L = ${n(v.l)} m. Its period? (g = 9.8 m/s², π ≈ 3.14)` }),
    solve: v => 2 * Math.PI * Math.sqrt(v.l / 9.8), unit: 's',
    slips: [v => Math.PI * Math.sqrt(v.l / 9.8), v => 2 * Math.PI * Math.sqrt(v.l * 9.8), v => 2 * Math.PI * (v.l / 9.8)],
    note: { bn: 'T = 2π√(L/g); ভরের ওপর নির্ভর করে না।', en: 'T = 2π√(L/g); mass does not matter.' },
  },
  {
    id: 'p-gpe', chapterId: 'physics-1-5', subject: 'physics',
    quantity: { bn: 'স্থিতিশক্তি', en: 'potential energy' }, formula: { bn: 'E = mgh', en: 'E = mgh' },
    prompt: v => ({ bn: `${n(v.m)} kg ভরের বস্তু ${n(v.h)} m উচ্চতায় থাকলে স্থিতিশক্তি কত? (g = ৯.৮ m/s²)`, en: `A ${n(v.m)} kg body is raised ${n(v.h)} m. Potential energy? (g = 9.8 m/s²)` }),
    solve: v => v.m * 9.8 * v.h, unit: 'J',
    slips: [v => v.m * v.h, v => 0.5 * v.m * 9.8 * v.h, v => v.m * 9.8 / v.h],
    note: { bn: 'E = mgh; উচ্চতা দ্বিগুণ হলে শক্তিও দ্বিগুণ।', en: 'E = mgh — double the height, double the energy.' },
  },
  {
    id: 'p-ke', chapterId: 'physics-1-5', subject: 'physics',
    quantity: { bn: 'গতিশক্তি', en: 'kinetic energy' }, formula: { bn: 'E = ½mv²', en: 'E = ½mv²' },
    prompt: v => ({ bn: `${n(v.m)} kg ভরের বস্তু ${n(v.v)} m/s বেগে চললে গতিশক্তি কত?`, en: `A ${n(v.m)} kg body moves at ${n(v.v)} m/s. Kinetic energy?` }),
    solve: v => 0.5 * v.m * v.v * v.v, unit: 'J',
    slips: [v => v.m * v.v * v.v, v => 0.5 * v.m * v.v, v => v.m * v.v],
    note: { bn: 'E = ½mv² — বেগ দ্বিগুণ হলে গতিশক্তি চার গুণ।', en: 'E = ½mv² — doubling speed quadruples the energy.' },
  },
  {
    id: 'p-pressure', chapterId: 'physics-1-7', subject: 'physics',
    quantity: { bn: 'চাপ', en: 'pressure' }, formula: { bn: 'P = F/A', en: 'P = F/A' },
    prompt: v => ({ bn: `${n(v.f)} N বল ${n(v.a)} m² ক্ষেত্রফলে প্রযুক্ত হলে চাপ কত?`, en: `A force of ${n(v.f)} N acts on an area of ${n(v.a)} m². Pressure?` }),
    solve: v => v.f / v.a, unit: 'Pa',
    slips: [v => v.f * v.a, v => v.a / v.f, v => v.f / (v.a * 2)],
    note: { bn: 'P = F/A; ক্ষেত্রফল কমলে চাপ বাড়ে।', en: 'P = F/A — smaller area means greater pressure.' },
  },
  {
    id: 'p-hooke', chapterId: 'physics-1-7', subject: 'physics',
    quantity: { bn: 'স্প্রিং ধ্রুবক', en: 'spring constant' }, formula: { bn: 'F = kx', en: 'F = kx' },
    prompt: v => ({ bn: `স্প্রিং ${n(v.x)} m প্রসারিত করতে ${n(v.f)} N বল লাগলে স্প্রিং ধ্রুবক কত?`, en: `A force of ${n(v.f)} N extends a spring by ${n(v.x)} m. Spring constant?` }),
    solve: v => v.f / v.x, unit: 'N/m',
    slips: [v => v.f * v.x, v => v.x / v.f, v => v.f / (v.x * 2)],
    note: { bn: 'হুকের সূত্র: F = kx (স্থিতিস্থাপক সীমার ভেতরে)।', en: 'Hooke’s law: F = kx, within the elastic limit.' },
  },
  {
    id: 'p-gas', chapterId: 'physics-1-10', subject: 'physics',
    quantity: { bn: 'তাপমাত্রা', en: 'temperature' }, formula: { bn: 'T = PV/nR', en: 'T = PV/nR' },
    prompt: v => ({ bn: `${n(v.n)} mol গ্যাস ${n(v.vol)} m³ আয়তনে ${n(v.p)} Pa চাপে থাকলে তাপমাত্রা কত? (R = ৮.৩১৪)`, en: `${n(v.n)} mol of gas occupies ${n(v.vol)} m³ at ${n(v.p)} Pa. Temperature? (R = 8.314)` }),
    solve: v => (v.p * v.vol) / (v.n * 8.314), unit: 'K',
    slips: [v => (v.p * v.vol) / 8.314, v => (v.p * v.vol) / v.n, v => (v.p * v.vol) / (v.n * 8.314 * 2)],
    note: { bn: 'PV = nRT; এখানে P প্যাসকেল, V ঘনমিটার, T কেলভিন।', en: 'PV = nRT with P in pascals, V in m³, T in kelvin.' },
  },
  {
    id: 'p-coulomb', chapterId: 'physics-2-2', subject: 'physics',
    quantity: { bn: 'ধারকত্ব', en: 'capacitance' }, formula: { bn: 'C = Q/V', en: 'C = Q/V' },
    prompt: v => ({ bn: `${n(v.q)} C চার্জে ${n(v.v)} V বিভব পার্থক্য হলে ধারকত্ব কত?`, en: `A charge of ${n(v.q)} C gives a potential difference of ${n(v.v)} V. Capacitance?` }),
    solve: v => v.q / v.v, unit: 'F',
    slips: [v => v.q * v.v, v => v.v / v.q, v => v.q / (v.v * 2)],
    note: { bn: 'C = Q/V, একক ফ্যারাড।', en: 'C = Q/V, measured in farads.' },
  },
  {
    id: 'p-torque', chapterId: 'physics-2-4', subject: 'physics',
    quantity: { bn: 'টর্ক', en: 'torque' }, formula: { bn: 'τ = F × d', en: 'τ = F × d' },
    prompt: v => ({ bn: `${n(v.f)} N বল ${n(v.d)} m বাহুতে লম্বভাবে প্রযুক্ত হলে টর্ক কত?`, en: `A force of ${n(v.f)} N acts perpendicularly at ${n(v.d)} m. Torque?` }),
    solve: v => v.f * v.d, unit: 'N·m',
    slips: [v => v.f / v.d, v => v.f + v.d, v => v.f * v.d * 0.5],
    note: { bn: 'τ = Fd (বল ও বাহু লম্ব হলে)।', en: 'τ = Fd when the force is perpendicular to the arm.' },
  },

  // ---------- Chemistry ----------
  {
    id: 'c-mole', chapterId: 'chemistry-1-2', subject: 'chemistry',
    quantity: { bn: 'মোল সংখ্যা', en: 'moles' }, formula: { bn: 'n = m/M', en: 'n = m/M' },
    prompt: v => ({ bn: `${n(v.m)} g পদার্থের মোলার ভর ${n(v.w)} g/mol হলে মোল সংখ্যা কত?`, en: `${n(v.m)} g of a substance has molar mass ${n(v.w)} g/mol. Moles?` }),
    solve: v => v.m / v.w, unit: 'mol',
    slips: [v => v.m * v.w, v => (v.m * v.w) / 2, v => v.w / v.m],
    note: { bn: 'n = m/M; ভর ÷ মোলার ভর।', en: 'n = m/M — mass divided by molar mass.' },
  },
  {
    id: 'c-mass', chapterId: 'chemistry-1-2', subject: 'chemistry',
    quantity: { bn: 'ভর', en: 'mass' }, formula: { bn: 'm = nM', en: 'm = nM' },
    prompt: v => ({ bn: `${n(v.n)} mol পদার্থের মোলার ভর ${n(v.w)} g/mol হলে ভর কত?`, en: `${n(v.n)} mol of a substance has molar mass ${n(v.w)} g/mol. Mass?` }),
    solve: v => v.n * v.w, unit: 'g',
    slips: [v => v.n / v.w, v => v.n + v.w, v => v.n * v.w * 2],
    note: { bn: 'm = nM; মোল সংখ্যা × মোলার ভর।', en: 'm = nM — moles times molar mass.' },
  },
  {
    id: 'c-molarity', chapterId: 'chemistry-1-2', subject: 'chemistry',
    quantity: { bn: 'মোলারিটি', en: 'molarity' }, formula: { bn: 'M = n/V(L)', en: 'M = n/V(L)' },
    prompt: v => ({ bn: `${n(v.n)} mol দ্রব ${n(v.vol)} L দ্রবণে থাকলে মোলারিটি কত?`, en: `${n(v.n)} mol of solute in ${n(v.vol)} L of solution. Molarity?` }),
    solve: v => v.n / v.vol, unit: 'mol/L',
    slips: [v => v.n * v.vol, v => v.vol / v.n, v => v.n / (v.vol * 2)],
    note: { bn: 'M = n/V; আয়তন লিটারে।', en: 'M = n/V with volume in litres.' },
  },
  {
    id: 'c-gas-mol', chapterId: 'chemistry-2-3', subject: 'chemistry',
    quantity: { bn: 'M-সংখ্যক মোলের আয়তন (STP)', en: 'volume at STP' }, formula: { bn: 'V = n × ২২.৪ L', en: 'V = n × 22.4 L' },
    prompt: v => ({ bn: `STP-তে ${n(v.n)} mol গ্যাসের আয়তন কত? (মোলার আয়তন ২২.৪ L)`, en: `Volume of ${n(v.n)} mol of gas at STP? (molar volume 22.4 L)` }),
    solve: v => v.n * 22.4, unit: 'L',
    slips: [v => v.n / 22.4, v => v.n * 11.2, v => v.n * 24],
    note: { bn: 'STP-তে ১ mol = ২২.৪ L।', en: 'At STP, 1 mol occupies 22.4 L.' },
  },
  {
    id: 'c-faraday', chapterId: 'chemistry-2-4', subject: 'chemistry',
    quantity: { bn: 'ফ্যারাডে সংখ্যা', en: 'faradays' }, formula: { bn: 'F = It/৯৬৫০০', en: 'F = It/96500' },
    prompt: v => ({ bn: `${n(v.i)} A প্রবাহ ${n(v.t)} s ধরে চললে কত ফ্যারাডে চার্জ যায়?`, en: `${n(v.i)} A flows for ${n(v.t)} s. How many faradays pass?` }),
    solve: v => (v.i * v.t) / 96500, unit: 'F',
    slips: [v => v.i * v.t, v => (v.i * v.t) / 1000, v => (v.i * v.t) / (96500 * 2)],
    note: { bn: 'Q = It; ১ ফ্যারাডে = ৯৬৫০০ C।', en: 'Q = It, and 1 faraday = 96 500 C.' },
  },
  {
    id: 'c-percent', chapterId: 'chemistry-2-3', subject: 'chemistry',
    quantity: { bn: 'শতকরা ফলন', en: 'percentage yield' }, formula: { bn: 'yield% = (প্রকৃত/তাত্ত্বিক) × ১০০', en: 'yield% = (actual/theoretical) × 100' },
    prompt: v => ({ bn: `তাত্ত্বিক ফলন ${n(v.th)} g, প্রকৃত ফলন ${n(v.ac)} g হলে শতকরা ফলন কত?`, en: `The theoretical yield is ${n(v.th)} g and the actual yield is ${n(v.ac)} g. Percentage yield?` }),
    solve: v => (v.ac / v.th) * 100, unit: '%',
    slips: [v => (v.th / v.ac) * 100, v => v.ac / v.th, v => (v.ac / v.th) * 10],
    note: { bn: 'শতকরা ফলন ১০০%-এর বেশি হতে পারে না।', en: 'Percentage yield can never exceed 100%.' },
  },
  {
    id: 'c-avogadro', chapterId: 'chemistry-1-2', subject: 'chemistry',
    quantity: { bn: 'অণুর সংখ্যা', en: 'number of molecules' }, formula: { bn: 'N = n × ৬.০২২×১০²³', en: 'N = n × 6.022×10²³' },
    prompt: v => ({ bn: `${n(v.n)} mol পদার্থে কতটি অণু থাকে? (অ্যাভোগাড্রো সংখ্যা ৬.০২২×১০²³)`, en: `How many molecules are in ${n(v.n)} mol? (Avogadro = 6.022×10²³)` }),
    solve: v => v.n * 6.022, unit: '×10²³',
    slips: [v => v.n * 6.022 * 2, v => v.n / 6.022, v => v.n * 3.14],
    note: { bn: 'N = n × Nₐ; অ্যাভোগাড্রো সংখ্যা প্রতি মোলে।', en: 'N = n × Nₐ — Avogadro’s number per mole.' },
  },
  {
    id: 'c-conc', chapterId: 'chemistry-1-4', subject: 'chemistry',
    quantity: { bn: 'pOH', en: 'pOH' }, formula: { bn: 'pH + pOH = ১৪', en: 'pH + pOH = 14' },
    prompt: v => ({ bn: `২৫ °C-তে দ্রবণের pH = ${n(v.ph)} হলে pOH কত?`, en: `At 25 °C a solution has pH = ${n(v.ph)}. What is pOH?` }),
    solve: v => 14 - v.ph, unit: '',
    slips: [v => v.ph, v => 14 + v.ph, v => v.ph - 14],
    note: { bn: '২৫ °C-তে pH + pOH = ১৪।', en: 'At 25 °C, pH + pOH = 14.' },
  },
  {
    id: 'c-rate', chapterId: 'chemistry-1-4', subject: 'chemistry',
    quantity: { bn: 'বিক্রিয়ার হার', en: 'rate of reaction' }, formula: { bn: 'rate = Δ[P]/Δt', en: 'rate = Δ[P]/Δt' },
    prompt: v => ({ bn: `${n(v.t)} s-এ উৎপাদের ঘনমাত্রা ${n(v.c)} mol/L বাড়লে গড় হার কত?`, en: `Product concentration rises by ${n(v.c)} mol/L in ${n(v.t)} s. Average rate?` }),
    solve: v => v.c / v.t, unit: 'mol/(L·s)',
    slips: [v => v.c * v.t, v => v.t / v.c, v => v.c / (v.t * 2)],
    note: { bn: 'হার = ঘনমাত্রার পরিবর্তন ÷ সময়।', en: 'Rate = change in concentration ÷ time.' },
  },

  // ---------- Higher Mathematics ----------
  {
    id: 'm-quad-sum', chapterId: 'math-2-4', subject: 'math',
    quantity: { bn: 'মূলের যোগফল', en: 'sum of roots' }, formula: { bn: 'মূলের যোগফল = −b/a', en: 'sum of roots = −b/a' },
    prompt: v => ({ bn: `${n(v.a)}x² + ${n(v.b)}x + ${n(v.c)} = 0 সমীকরণের মূলের যোগফল কত?`, en: `For ${n(v.a)}x² + ${n(v.b)}x + ${n(v.c)} = 0, what is the sum of the roots?` }),
    solve: v => -v.b / v.a, unit: '',
    slips: [v => v.b / v.a, v => -v.a / v.b, v => v.c / v.a],
    note: { bn: 'ax² + bx + c = 0-এ মূলের যোগফল −b/a, গুণফল c/a।', en: 'For ax² + bx + c = 0: sum = −b/a, product = c/a.' },
  },
  {
    id: 'm-quad-prod', chapterId: 'math-2-4', subject: 'math',
    quantity: { bn: 'মূলের গুণফল', en: 'product of roots' }, formula: { bn: 'গুণফল = c/a', en: 'product = c/a' },
    prompt: v => ({ bn: `${n(v.a)}x² + ${n(v.b)}x + ${n(v.c)} = 0 সমীকরণের মূলের গুণফল কত?`, en: `For ${n(v.a)}x² + ${n(v.b)}x + ${n(v.c)} = 0, what is the product of the roots?` }),
    solve: v => v.c / v.a, unit: '',
    slips: [v => -v.c / v.a, v => -v.b / v.a, v => v.a / v.c],
    note: { bn: 'গুণফল = c/a (চিহ্নসহ)।', en: 'Product = c/a, sign included.' },
  },
  {
    id: 'm-slope', chapterId: 'math-1-3', subject: 'math',
    quantity: { bn: 'ঢাল', en: 'slope' }, formula: { bn: 'm = (y₂−y₁)/(x₂−x₁)', en: 'm = (y₂−y₁)/(x₂−x₁)' },
    prompt: v => ({ bn: `(${n(v.x1)}, ${n(v.y1)}) ও (${n(v.x2)}, ${n(v.y2)}) বিন্দুগামী সরলরেখার ঢাল কত?`, en: `Slope of the line through (${n(v.x1)}, ${n(v.y1)}) and (${n(v.x2)}, ${n(v.y2)})?` }),
    solve: v => (v.y2 - v.y1) / (v.x2 - v.x1), unit: '',
    slips: [v => (v.x2 - v.x1) / (v.y2 - v.y1), v => (v.y2 + v.y1) / (v.x2 + v.x1), v => (v.y2 - v.y1) * (v.x2 - v.x1)],
    note: { bn: 'ঢাল = y-এর পরিবর্তন ÷ x-এর পরিবর্তন।', en: 'Slope = change in y ÷ change in x.' },
  },
  {
    id: 'm-distance', chapterId: 'math-1-3', subject: 'math',
    quantity: { bn: 'বিন্দুর দূরত্ব', en: 'distance from a line' }, formula: { bn: 'd = |ax₁+by₁+c|/√(a²+b²)', en: 'd = |ax₁+by₁+c|/√(a²+b²)' },
    prompt: v => ({ bn: `(${n(v.x)}, ${n(v.y)}) বিন্দু থেকে ${n(v.a)}x + ${n(v.b)}y + ${n(v.c)} = 0 রেখার দূরত্ব কত?`, en: `Distance from (${n(v.x)}, ${n(v.y)}) to the line ${n(v.a)}x + ${n(v.b)}y + ${n(v.c)} = 0?` }),
    solve: v => Math.abs(v.a * v.x + v.b * v.y + v.c) / Math.sqrt(v.a * v.a + v.b * v.b), unit: '',
    slips: [v => Math.abs(v.a * v.x + v.b * v.y + v.c), v => Math.abs(v.a * v.x + v.b * v.y + v.c) / (v.a * v.a + v.b * v.b), v => Math.abs(v.c) / Math.sqrt(v.a * v.a + v.b * v.b)],
    note: { bn: 'হর = √(a² + b²), লব = বিন্দু বসিয়ে পরম মান।', en: 'Denominator √(a²+b²), numerator the absolute substitution.' },
  },
  {
    id: 'm-ncr', chapterId: 'math-1-5', subject: 'math',
    quantity: { bn: 'সমাবেশ সংখ্যা', en: 'combinations' }, formula: { bn: 'nCr = n!/(r!(n−r)!)', en: 'nCr = n!/(r!(n−r)!)' },
    prompt: v => ({ bn: `${n(v.n)} জনের মধ্য থেকে ${n(v.r)} জন বাছার উপায় কত?`, en: `How many ways to choose ${n(v.r)} people from ${n(v.n)}?` }),
    solve: v => combinations(v.n, v.r), unit: '',
    slips: [v => permutations(v.n, v.r), v => combinations(v.n, v.r) * 2, v => v.n * v.r],
    note: { bn: 'ক্রম গুরুত্বপূর্ণ নয় ⇒ nCr; ক্রম গুরুত্বপূর্ণ হলে nPr।', en: 'Order does not matter ⇒ nCr; if it did, nPr.' },
  },
  {
    id: 'm-npr', chapterId: 'math-1-5', subject: 'math',
    quantity: { bn: 'বিন্যাস সংখ্যা', en: 'permutations' }, formula: { bn: 'nPr = n!/(n−r)!', en: 'nPr = n!/(n−r)!' },
    prompt: v => ({ bn: `${n(v.n)} জনের মধ্য থেকে ${n(v.r)} জনকে ক্রমানুসারে বসানোর উপায় কত?`, en: `In how many ways can ${n(v.r)} of ${n(v.n)} people be arranged in order?` }),
    solve: v => permutations(v.n, v.r), unit: '',
    slips: [v => combinations(v.n, v.r), v => permutations(v.n, v.r) / 2, v => v.n * v.r],
    note: { bn: 'ক্রম গুরুত্বপূর্ণ ⇒ nPr।', en: 'Order matters ⇒ nPr.' },
  },
  {
    id: 'm-binomial', chapterId: 'math-2-5', subject: 'math',
    quantity: { bn: 'পদ সংখ্যা', en: 'number of terms' }, formula: { bn: '(a+b)ⁿ-এ পদ = n+১', en: '(a+b)ⁿ has n+1 terms' },
    prompt: v => ({ bn: `(a + b)^${n(v.n)} বিস্তৃতিতে মোট পদ সংখ্যা কত?`, en: `How many terms are in the expansion of (a + b)^${n(v.n)}?` }),
    solve: v => v.n + 1, unit: '',
    slips: [v => v.n, v => v.n + 2, v => 2 * v.n],
    note: { bn: 'পদ সংখ্যা n + ১।', en: 'There are n + 1 terms.' },
  },
  {
    id: 'm-inverse', chapterId: 'math-2-7', subject: 'math',
    quantity: { bn: 'বিপরীত ত্রিকোণমিতিক মান', en: 'inverse trig value' }, formula: { bn: 'sin⁻¹(sin θ) = θ', en: 'sin⁻¹(sin θ) = θ' },
    prompt: v => ({ bn: `cos⁻¹(${n(v.c)}) = কত?`, en: `cos⁻¹(${n(v.c)}) = ?` }),
    solve: v => (Math.acos(v.c) * 180) / Math.PI, unit: '°',
    slips: [v => (Math.asin(v.c) * 180) / Math.PI, v => 180 - (Math.acos(v.c) * 180) / Math.PI, v => (Math.acos(v.c) * 90) / Math.PI],
    note: { bn: 'cos⁻¹ ০ = ৯০°, cos⁻¹ ১ = ০°, cos⁻¹ ½ = ৬০°।', en: 'cos⁻¹ 0 = 90°, cos⁻¹ 1 = 0°, cos⁻¹ ½ = 60°.' },
  },
  {
    id: 'm-trig', chapterId: 'math-1-7', subject: 'math',
    quantity: { bn: 'ত্রিকোণমিতিক অনুপাত', en: 'trigonometric ratio' }, formula: { bn: 'tan θ = sin θ/cos θ', en: 'tan θ = sin θ/cos θ' },
    prompt: v => ({ bn: `sin θ = ${n(v.s)} এবং cos θ = ${n(v.c)} হলে tan θ কত?`, en: `If sin θ = ${n(v.s)} and cos θ = ${n(v.c)}, what is tan θ?` }),
    solve: v => v.s / v.c, unit: '',
    slips: [v => v.c / v.s, v => v.s * v.c, v => v.s + v.c],
    note: { bn: 'tan θ = sin θ ÷ cos θ।', en: 'tan θ = sin θ ÷ cos θ.' },
  },
  {
    id: 'm-derivative', chapterId: 'math-1-9', subject: 'math',
    quantity: { bn: 'অন্তরজের মান', en: 'derivative value' }, formula: { bn: "d/dx(xⁿ) = nxⁿ⁻¹", en: "d/dx(xⁿ) = nxⁿ⁻¹" },
    prompt: v => ({ bn: `y = x^${n(v.n)} হলে x = ${n(v.x)} বিন্দুতে dy/dx কত?`, en: `If y = x^${n(v.n)}, what is dy/dx at x = ${n(v.x)}?` }),
    solve: v => v.n * Math.pow(v.x, v.n - 1), unit: '',
    slips: [v => Math.pow(v.x, v.n), v => v.n * Math.pow(v.x, v.n), v => (v.n - 1) * Math.pow(v.x, v.n - 1)],
    note: { bn: 'nxⁿ⁻¹ সূত্রে x বসাও।', en: 'Substitute x into nxⁿ⁻¹.' },
  },
  {
    id: 'm-integral', chapterId: 'math-1-10', subject: 'math',
    quantity: { bn: 'নির্দিষ্ট যোগজ', en: 'definite integral' }, formula: { bn: '∫₀ᵃ xⁿ dx = aⁿ⁺¹/(n+১)', en: '∫₀ᵃ xⁿ dx = aⁿ⁺¹/(n+1)' },
    prompt: v => ({ bn: `∫₀^${n(v.a)} x^${n(v.n)} dx = কত?`, en: `∫₀^${n(v.a)} x^${n(v.n)} dx = ?` }),
    solve: v => Math.pow(v.a, v.n + 1) / (v.n + 1), unit: '',
    slips: [v => Math.pow(v.a, v.n) / v.n, v => Math.pow(v.a, v.n + 1) * (v.n + 1), v => Math.pow(v.a, v.n + 1)],
    note: { bn: 'যোগজ = aⁿ⁺¹/(n+১)।', en: 'The integral is aⁿ⁺¹/(n+1).' },
  },
  {
    id: 'm-circle', chapterId: 'math-1-4', subject: 'math',
    quantity: { bn: 'বৃত্তের ব্যাসার্ধ', en: 'circle radius' }, formula: { bn: 'r = √(g² + f² − c)', en: 'r = √(g² + f² − c)' },
    prompt: v => ({ bn: `x² + y² + ${n(2 * v.g)}x + ${n(2 * v.f)}y + ${n(v.c)} = 0 বৃত্তের ব্যাসার্ধ কত?`, en: `Radius of the circle x² + y² + ${n(2 * v.g)}x + ${n(2 * v.f)}y + ${n(v.c)} = 0?` }),
    solve: v => Math.sqrt(v.g * v.g + v.f * v.f - v.c), unit: '',
    slips: [v => Math.sqrt(v.g * v.g + v.f * v.f + v.c), v => v.g * v.g + v.f * v.f - v.c, v => Math.sqrt(v.g * v.g - v.f * v.f - v.c)],
    note: { bn: 'কেন্দ্র (−g, −f), ব্যাসার্ধ √(g² + f² − c)।', en: 'Centre (−g, −f), radius √(g² + f² − c).' },
  },
  {
    id: 'm-prob', chapterId: 'math-2-10', subject: 'math',
    quantity: { bn: 'সম্ভাবনা', en: 'probability' }, formula: { bn: 'P = অনুকূল/মোট', en: 'P = favourable/total' },
    prompt: v => ({ bn: `একটি থলিতে ${n(v.r)}টি লাল ও ${n(v.b)}টি নীল বল। একটি বল তুললে লাল হওয়ার সম্ভাবনা কত?`, en: `A bag has ${n(v.r)} red and ${n(v.b)} blue balls. Probability of drawing red?` }),
    solve: v => v.r / (v.r + v.b), unit: '',
    slips: [v => v.b / (v.r + v.b), v => v.r / v.b, v => v.r / (v.r + v.b) / 2],
    note: { bn: 'P = অনুকূল ফল ÷ মোট ফল; মান ০–১ এর মধ্যে।', en: 'P = favourable ÷ total, always between 0 and 1.' },
  },
  {
    id: 'm-mean', chapterId: 'math-2-10', subject: 'math',
    quantity: { bn: 'গড়', en: 'mean' }, formula: { bn: 'গড় = Σx/n', en: 'mean = Σx/n' },
    prompt: v => ({ bn: `${n(v.a)}, ${n(v.b)} ও ${n(v.c)} সংখ্যাগুলোর গড় কত?`, en: `What is the mean of ${n(v.a)}, ${n(v.b)} and ${n(v.c)}?` }),
    solve: v => (v.a + v.b + v.c) / 3, unit: '',
    slips: [v => v.a + v.b + v.c, v => (v.a + v.b + v.c) / 2, v => (v.a + v.b) / 2],
    note: { bn: 'গড় = যোগফল ÷ সংখ্যা।', en: 'Mean = total ÷ count.' },
  },
  {
    id: 'm-vector', chapterId: 'math-1-2', subject: 'math',
    quantity: { bn: 'ভেক্টরের মান', en: 'vector magnitude' }, formula: { bn: '|v| = √(x² + y²)', en: '|v| = √(x² + y²)' },
    prompt: v => ({ bn: `(${n(v.x)}, ${n(v.y)}) ভেক্টরের মান কত?`, en: `What is the magnitude of the vector (${n(v.x)}, ${n(v.y)})?` }),
    solve: v => Math.sqrt(v.x * v.x + v.y * v.y), unit: '',
    slips: [v => v.x + v.y, v => Math.abs(v.x - v.y), v => v.x * v.y],
    note: { bn: '|v| = √(x² + y²)।', en: '|v| = √(x² + y²).' },
  },
  {
    id: 'm-log', chapterId: 'math-2-1', subject: 'math',
    quantity: { bn: 'লগারিদম', en: 'logarithm' }, formula: { bn: 'logₐ(aⁿ) = n', en: 'logₐ(aⁿ) = n' },
    prompt: v => ({ bn: `log₂(${n(Math.pow(2, v.n))}) = কত?`, en: `log₂(${n(Math.pow(2, v.n))}) = ?` }),
    solve: v => v.n, unit: '',
    slips: [v => v.n * 2, v => Math.pow(2, v.n), v => v.n / 2],
    note: { bn: 'log₂(২ⁿ) = n।', en: 'log₂(2ⁿ) = n.' },
  },
  {
    id: 'm-dism', chapterId: 'math-1-1', subject: 'math',
    quantity: { bn: 'নির্ণায়ক', en: 'determinant' }, formula: { bn: '|A| = ad − bc', en: '|A| = ad − bc' },
    prompt: v => ({ bn: `[[${n(v.a)}, ${n(v.b)}], [${n(v.c)}, ${n(v.d)}]] ম্যাট্রিক্সের নির্ণায়ক কত?`, en: `Determinant of [[${n(v.a)}, ${n(v.b)}], [${n(v.c)}, ${n(v.d)}]]?` }),
    solve: v => v.a * v.d - v.b * v.c, unit: '',
    slips: [v => v.a * v.d + v.b * v.c, v => v.a * v.b - v.c * v.d, v => v.a + v.d - v.b - v.c],
    note: { bn: '|A| = ad − bc (২×২)।', en: '|A| = ad − bc for a 2×2 matrix.' },
  },

  // ---------- ICT ----------
  {
    id: 'i-binary', chapterId: 'ict-1-3', subject: 'ict',
    quantity: { bn: 'দশমিক মান', en: 'decimal value' }, formula: { bn: 'অবস্থানভিত্তিক যোগ', en: 'positional sum' },
    prompt: v => ({ bn: `বাইনারি ${String(v.bits).padStart(4, '0')}-এর দশমিক মান কত?`, en: `Decimal value of binary ${String(v.bits).padStart(4, '0')}?` }),
    solve: v => v.bits, unit: '',
    slips: [v => v.bits * 2, v => v.bits + 1, v => Math.floor(v.bits / 2)],
    note: { bn: 'প্রতি বিট ২-এর ঘাত: ৮ ৪ ২ ১।', en: 'Each bit is a power of two: 8 4 2 1.' },
  },
  {
    id: 'i-bytes', chapterId: 'ict-1-3', subject: 'ict',
    quantity: { bn: 'বাইট', en: 'bytes' }, formula: { bn: '১ বাইট = ৮ বিট', en: '1 byte = 8 bits' },
    prompt: v => ({ bn: `${n(v.bits)} বিট = কত বাইট?`, en: `${n(v.bits)} bits = how many bytes?` }),
    solve: v => v.bits / 8, unit: 'B',
    slips: [v => v.bits * 8, v => v.bits / 4, v => v.bits / 16],
    note: { bn: '৮ বিটে ১ বাইট।', en: 'Eight bits make one byte.' },
  },
  {
    id: 'i-kb', chapterId: 'ict-1-2', subject: 'ict',
    quantity: { bn: 'কিলোবাইট', en: 'kilobytes' }, formula: { bn: '১ KB = ১০২৪ B', en: '1 KB = 1024 B' },
    prompt: v => ({ bn: `${n(v.kb)} KB = কত বাইট?`, en: `${n(v.kb)} KB = how many bytes?` }),
    solve: v => v.kb * 1024, unit: 'B',
    slips: [v => v.kb * 1000, v => v.kb * 2048, v => v.kb * 8],
    note: { bn: 'কম্পিউটারে ১ KB = ১০২৪ বাইট।', en: 'In computing, 1 KB = 1024 bytes.' },
  },
  {
    id: 'i-and', chapterId: 'ict-1-4', subject: 'ict',
    quantity: { bn: 'লজিক গেট আউটপুট', en: 'logic gate output' }, formula: { bn: 'AND: সব ইনপুট ১ হলে ১', en: 'AND: output 1 only if all inputs are 1' },
    prompt: v => ({ bn: `AND গেটে ইনপুট A = ${n(v.a)}, B = ${n(v.b)} হলে আউটপুট কত?`, en: `An AND gate has inputs A = ${n(v.a)}, B = ${n(v.b)}. Output?` }),
    solve: v => (v.a && v.b ? 1 : 0), unit: '',
    slips: [v => (v.a || v.b ? 1 : 0), v => (v.a !== v.b ? 1 : 0), v => (v.a && v.b ? 0 : 1)],
    note: { bn: 'AND-এ যেকোনো একটি ইনপুট ০ হলে আউটপুট ০।', en: 'One zero input is enough to make an AND output zero.' },
  },
  {
    id: 'i-or', chapterId: 'ict-1-4', subject: 'ict',
    quantity: { bn: 'লজিক গেট আউটপুট', en: 'logic gate output' }, formula: { bn: 'OR: যেকোনো ইনপুট ১ হলে ১', en: 'OR: output 1 if any input is 1' },
    prompt: v => ({ bn: `OR গেটে ইনপুট A = ${n(v.a)}, B = ${n(v.b)} হলে আউটপুট কত?`, en: `An OR gate has inputs A = ${n(v.a)}, B = ${n(v.b)}. Output?` }),
    solve: v => (v.a || v.b ? 1 : 0), unit: '',
    slips: [v => (v.a && v.b ? 1 : 0), v => (v.a !== v.b ? 1 : 0), v => (v.a || v.b ? 0 : 1)],
    note: { bn: 'OR-এ একটি ইনপুট ১ হলেই আউটপুট ১।', en: 'A single 1 input makes an OR output 1.' },
  },
  {
    id: 'i-bps', chapterId: 'ict-1-2', subject: 'ict',
    quantity: { bn: 'ডেটা হার', en: 'data rate' }, formula: { bn: 'সময় = আকার ÷ হার', en: 'time = size ÷ rate' },
    prompt: v => ({ bn: `${n(v.size)} MB ফাইল ${n(v.rate)} MB/s গতিতে পাঠাতে কত সেকেন্ড লাগবে?`, en: `How many seconds to send a ${n(v.size)} MB file at ${n(v.rate)} MB/s?` }),
    solve: v => v.size / v.rate, unit: 's',
    slips: [v => v.size * v.rate, v => v.rate / v.size, v => v.size / (v.rate * 2)],
    note: { bn: 'সময় = আকার ÷ হার।', en: 'Time = size ÷ rate.' },
  },
];

function factorial(value: number): number {
  let out = 1;
  for (let i = 2; i <= value; i += 1) out *= i;
  return out;
}
function combinations(n: number, r: number): number {
  return factorial(n) / (factorial(r) * factorial(n - r));
}
function permutations(n: number, r: number): number {
  return factorial(n) / factorial(n - r);
}

/** Deterministic PRNG (same seed ⇒ same numbers, so verification can recompute). */
function rng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const INTS: Record<string, number[]> = {
  m: [1, 2, 3, 4, 5, 6, 8, 10], a: [1, 2, 3, 4, 5], u: [0, 2, 4, 5, 10], t: [2, 3, 4, 5, 6, 10],
  f: [5, 10, 12, 20, 25, 40, 50], s: [2, 3, 4, 5, 8, 10], w: [100, 200, 240, 300, 480, 600],
  i: [1, 2, 3, 4, 5], r: [2, 4, 5, 10, 20], v: [6, 12, 20, 24, 40], r1: [2, 3, 4, 5, 8], r2: [3, 4, 6, 10, 12],
  b: [3, 4, 5, 6, 8], l: [1, 2, 3, 4, 5], h: [2, 4, 5, 8, 10], x: [1, 2, 3, 4, 5],
  p: [100000, 200000], vol: [1, 2], q: [1, 2, 4, 5], d: [1, 2, 3, 5],
  n: [1, 2, 3, 4, 5], th: [20, 25, 40, 50], ac: [10, 15, 20, 30], ph: [2, 3, 5, 9, 11],
  c: [1, 2, 3, 4], x1: [1, 2, 3], y1: [2, 3, 4], x2: [4, 5, 6], y2: [8, 10, 12],
  y: [3, 4, 5], g: [1, 2, 3], bits: [5, 9, 10, 12], kb: [2, 4, 8, 16], size: [40, 80, 120, 200], rate: [4, 8, 10, 20],
  c_: [0, 1],
};

/** Pick a legal variable set for a schema from its seed. */
function varsFor(schema: Schema, seed: string): Vars {
  const next = rng(`${schema.id}|${seed}`);
  const fromPool = (key: string): number => {
    const pool = INTS[key] ?? [1, 2, 3, 4, 5];
    return pool[Math.floor(next() * pool.length)];
  };
  const v: Vars = {};
  // Every schema reads whichever keys it needs; unknown ones simply stay undefined.
  const keys = new Set((schema.prompt.toString().match(/\bv\.([a-zA-Z_]+)/g) ?? []).map(token => token.slice(2)));
  for (const key of keys) v[key] = fromPool(key);

  // Fix-ups so each answer is sensible, and so different seeds ask different questions.
  if ('bits' in v) v.bits = [5, 9, 10, 12, 6, 7][Math.floor(next() * 6)];
  if ('ph' in v) v.ph = [2, 3, 5, 9, 11, 12][Math.floor(next() * 6)];
  if (schema.id === 'm-derivative') { v.x = [2, 3][Math.floor(next() * 2)]; v.n = [2, 3][Math.floor(next() * 2)]; }
  if (schema.id === 'm-integral') { v.a = [2, 3, 4][Math.floor(next() * 3)]; v.n = [1, 2][Math.floor(next() * 2)]; }
  if (schema.id === 'm-binomial') v.n = [3, 4, 5, 6][Math.floor(next() * 4)];
  if (schema.id === 'm-ncr' || schema.id === 'm-npr') {
    v.n = [4, 5, 6][Math.floor(next() * 3)];
    v.r = [2, 3][Math.floor(next() * 2)];
    if (v.r >= v.n) v.r = v.n - 1;
  }
  if (schema.id === 'm-trig') {
    const pair = [[0.5, 0.87], [0.6, 0.8], [0.8, 0.6], [0.28, 0.96]][Math.floor(next() * 4)];
    v.s = pair[0]; v.c = pair[1];
  }
  if (schema.id === 'm-inverse') v.c = [0, 1, 0.5][Math.floor(next() * 3)];
  if (schema.id === 'm-circle') { v.g = [1, 2, 3][Math.floor(next() * 3)]; v.f = [1, 2, 3][Math.floor(next() * 3)]; v.c = [-4, -1, 2, 4][Math.floor(next() * 4)]; }
  if (schema.id === 'm-slope') {
    v.x1 = 1; v.x2 = [3, 4, 5][Math.floor(next() * 3)];
    v.y1 = [1, 2][Math.floor(next() * 2)]; v.y2 = v.y1 + (v.x2 - v.x1) * [2, 3][Math.floor(next() * 2)];
  }
  if (schema.id === 'm-distance') { v.a = 3; v.b = 4; v.c = [-6, 6][Math.floor(next() * 2)]; v.x = 1; v.y = 1; }
  if (schema.id === 'm-prob') { v.r = [2, 3, 4, 5][Math.floor(next() * 4)]; v.b = [3, 5, 6, 8][Math.floor(next() * 4)]; }
  if (schema.id === 'm-mean') { v.a = [4, 6, 8, 5][Math.floor(next() * 4)]; v.b = [6, 9, 10, 7][Math.floor(next() * 4)]; v.c = [8, 12, 15, 9][Math.floor(next() * 4)]; }
  if (schema.id === 'm-vector') { v.x = [3, 6, 5, 8][Math.floor(next() * 4)]; v.y = [4, 8, 12, 15][Math.floor(next() * 4)]; }
  if (schema.id === 'm-log') v.n = [2, 3, 4, 5][Math.floor(next() * 4)];
  if (schema.id === 'm-dism') { v.a = [2, 3, 4][Math.floor(next() * 3)]; v.b = [3, 5, 6][Math.floor(next() * 3)]; v.c = [1, 2, 4][Math.floor(next() * 3)]; v.d = [5, 7, 9][Math.floor(next() * 3)]; }
  if (schema.id === 'm-quad-sum' || schema.id === 'm-quad-prod') {
    v.a = [1, 2, 3][Math.floor(next() * 3)];
    v.b = [3, 5, 6, 7][Math.floor(next() * 4)];
    v.c = [2, 4, 6, 8][Math.floor(next() * 4)];
  }
  if (schema.id === 'p-gas') { v.p = 101325; v.vol = [1, 2][Math.floor(next() * 2)]; v.n = [1, 2][Math.floor(next() * 2)]; }
  if (schema.id === 'p-pendulum') v.l = [1, 4, 9][Math.floor(next() * 3)];
  if (schema.id === 'p-work' || schema.id === 'p-power') { v.f = [10, 20, 30, 50][Math.floor(next() * 4)]; v.s = [2, 4, 5, 8][Math.floor(next() * 4)]; v.w = [100, 200, 300, 500][Math.floor(next() * 4)]; v.t = [5, 10, 20, 25][Math.floor(next() * 4)]; }
  if (schema.id === 'p-ohm' || schema.id === 'p-ohm-i') { v.i = [2, 3, 4, 5][Math.floor(next() * 4)]; v.r = [4, 6, 10, 20][Math.floor(next() * 4)]; v.v = [6, 9, 12, 15][Math.floor(next() * 4)]; }
  if (schema.id === 'p-series') { v.r1 = [2, 4, 6, 8][Math.floor(next() * 4)]; v.r2 = [3, 5, 9, 12][Math.floor(next() * 4)]; }
  if (schema.id === 'p-graph') { v.a = [3, 6, 8][Math.floor(next() * 3)]; v.b = [4, 8, 15][Math.floor(next() * 3)]; }
  if (schema.id === 'p-gpe' || schema.id === 'p-ke') { v.m = [2, 4, 5, 10][Math.floor(next() * 4)]; v.h = [2, 5, 10][Math.floor(next() * 3)]; v.v = [2, 4, 6, 8][Math.floor(next() * 4)]; }
  if (schema.id === 'p-pressure') { v.f = [20, 40, 60, 100][Math.floor(next() * 4)]; v.a = [2, 4, 5][Math.floor(next() * 3)]; }
  if (schema.id === 'p-hooke') { v.f = [10, 20, 30, 50][Math.floor(next() * 4)]; v.x = [0.5, 1, 2][Math.floor(next() * 3)]; }
  if (schema.id === 'p-coulomb' || schema.id === 'p-torque') { v.q = [2, 4, 6, 10][Math.floor(next() * 4)]; v.v = [4, 5, 10, 20][Math.floor(next() * 4)]; v.f = [5, 10, 20, 40][Math.floor(next() * 4)]; v.d = [0.5, 1, 2, 4][Math.floor(next() * 4)]; }
  if (schema.id === 'c-mole' || schema.id === 'c-mass') { v.m = [9, 18, 36, 54][Math.floor(next() * 4)]; v.w = [18, 40, 44, 58][Math.floor(next() * 4)]; v.n = [0.5, 1, 1.5, 2][Math.floor(next() * 4)]; }
  if (schema.id === 'c-molarity') { v.n = [0.5, 1, 2][Math.floor(next() * 3)]; v.vol = [0.5, 1, 2][Math.floor(next() * 3)]; }
  if (schema.id === 'c-gas-mol') v.n = [0.5, 1, 1.5, 2, 3][Math.floor(next() * 5)];
  if (schema.id === 'c-faraday') { v.i = [1, 2, 5][Math.floor(next() * 3)]; v.t = [96500, 48250, 19300][Math.floor(next() * 3)]; }
  if (schema.id === 'c-percent') { v.th = [20, 25, 40, 50][Math.floor(next() * 4)]; v.ac = [10, 15, 20, 30][Math.floor(next() * 4)]; }
  if (schema.id === 'c-avogadro') v.n = [0.5, 1, 2, 3][Math.floor(next() * 4)];
  if (schema.id === 'c-rate') { v.t = [10, 20, 40, 50][Math.floor(next() * 4)]; v.c = [0.2, 0.4, 0.5, 0.8, 1.2][Math.floor(next() * 5)]; }
  if (schema.id === 'i-and' || schema.id === 'i-or') { v.a = Math.floor(next() * 2); v.b = Math.floor(next() * 2); }
  if (schema.id === 'i-kb') v.kb = [2, 4, 8, 16][Math.floor(next() * 4)];
  if (schema.id === 'i-bps') { v.size = [40, 80, 120, 200][Math.floor(next() * 4)]; v.rate = [4, 8, 10, 20][Math.floor(next() * 4)]; }
  return v;
}

const format = (schema: Schema, value: number, english: boolean) => {
  const rounded = r2(value);
  const text = n(rounded);
  const unit = schema.unit && schema.unit !== '×10²³' ? ` ${schema.unit}` : schema.unit ? ` ${schema.unit}` : '';
  return `${english ? text : bn(text)}${unit}`;
};

export interface NumericBuild {
  question: QuizQuestion;
  /** Recomputable truth, kept so tests and the verifier never trust the option text. */
  expected: number;
}

/** One question from one schema, fully deterministic for a given seed. */
export function buildNumeric(schema: Schema, seed: string): NumericBuild | null {
  const vars = varsFor(schema, seed);
  const answer = schema.solve(vars);
  if (!Number.isFinite(answer)) return null;
  const english = isEnglish();
  const correct = format(schema, answer, english);
  const wrong: string[] = [];
  const consider = (value: number) => {
    // A negative or zero distractor is almost never a plausible slip for these quantities,
    // so it is dropped rather than shipped as obvious nonsense.
    if (!Number.isFinite(value) || value <= 0 || r2(value) === r2(answer)) return;
    const text = format(schema, value, english);
    if (text !== correct && !wrong.includes(text) && wrong.length < 3) wrong.push(text);
  };
  for (const slip of schema.slips) consider(slip(vars));
  // Fallbacks are still arithmetic slips, never invented facts: double, half, ±10%.
  for (const fallback of [answer * 2, answer / 2, answer * 1.1, answer * 0.9, answer + 1, answer - 1]) {
    if (wrong.length === 3) break;
    consider(fallback);
  }
  if (wrong.length < 3) return null;
  const options = [correct, ...wrong];
  // Rotate deterministically so the right answer is not always first.
  const rotate = Math.floor(rng(`pos|${schema.id}|${seed}`)() * 4);
  const rotated = [...options.slice(rotate), ...options.slice(0, rotate)];
  const [quantity, formula, prompt] = english
    ? [schema.quantity.en, schema.formula.en, schema.prompt(vars).en]
    : [schema.quantity.bn, schema.formula.bn, localize(schema.prompt(vars).bn, false)];
  const localizedPrompt = prompt;
  const substitution = Object.entries(vars)
    .filter(([, value]) => Number.isFinite(value))
    .map(([key, value]) => `${key} = ${english ? n(value) : bn(n(value))}`)
    .join(', ');
  const explanation = english
    ? `${formula}. Using ${substitution}: ${quantity} = ${n(r2(answer))}${schema.unit ? ' ' + schema.unit : ''}. ${schema.note?.en ?? ''}`.trim()
    : `${formula}। বসালে (${substitution}): ${quantity} = ${bn(n(r2(answer)))}${schema.unit ? ' ' + schema.unit : ''}। ${schema.note?.bn ?? ''}`.trim();
  return {
    expected: r2(answer),
    question: {
      id: `${NUMERIC_PREFIX}${schema.id}|${seed}`,
      subject: schema.subject,
      chapterId: schema.chapterId,
      question: localizedPrompt,
      options: rotated,
      answer: rotated.indexOf(correct),
      explanation,
      source: english ? 'Auto-generated · formula-checked' : NUMERIC_SOURCE,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  };
}

const BY_CHAPTER = new Map<string, Schema[]>();
for (const schema of SCHEMAS) {
  const list = BY_CHAPTER.get(schema.chapterId) ?? [];
  list.push(schema);
  BY_CHAPTER.set(schema.chapterId, list);
}

export const numericChapters = (): string[] => [...BY_CHAPTER.keys()];
export const numericSchemasFor = (chapterId: string): number => (BY_CHAPTER.get(chapterId) ?? []).length;
export const NUMERIC_SCHEMA_COUNT = SCHEMAS.length;

/** Every distinct numeric question for a chapter, one per (schema, variant). */
export function numericQuestions(chapterId: string, variants = 3): NumericBuild[] {
  const schemas = BY_CHAPTER.get(chapterId) ?? [];
  const seen = new Set<string>();
  const out: NumericBuild[] = [];
  for (const schema of schemas) {
    for (let variant = 0; variant < variants; variant += 1) {
      const built = buildNumeric(schema, `v${variant}`);
      // Two seeds can land on the same numbers; the student should never see the same
      // question twice in one paper, so a repeated prompt is dropped here.
      if (!built || seen.has(built.question.question)) continue;
      seen.add(built.question.question);
      out.push(built);
    }
  }
  return out;
}

export interface NumericIssue { questionId: string; problem: 'answer-not-in-options' | 'duplicate-option' | 'no-explanation' | 'value-mismatch' | 'unknown-chapter' }

/**
 * Exact verification: rebuild from the same seed and compare the *recomputed* value with
 * the option the paper calls correct. Nothing here trusts a hand-written answer.
 */
export function verifyNumeric(questions: QuizQuestion[]): NumericIssue[] {
  const byId = new Map<string, Schema>();
  for (const schema of SCHEMAS) {
    for (let variant = 0; variant < 8; variant += 1) byId.set(`${NUMERIC_PREFIX}${schema.id}|v${variant}`, schema);
  }
  const issues: NumericIssue[] = [];
  for (const question of questions) {
    const schema = byId.get(question.id);
    if (!schema) { issues.push({ questionId: question.id, problem: 'unknown-chapter' }); continue; }
    if (!chapterById[question.chapterId ?? '']) issues.push({ questionId: question.id, problem: 'unknown-chapter' });
    if (new Set(question.options).size !== question.options.length) issues.push({ questionId: question.id, problem: 'duplicate-option' });
    if (!question.explanation?.trim()) issues.push({ questionId: question.id, problem: 'no-explanation' });
    const seed = question.id.split('|')[2] ?? '';
    const rebuilt = buildNumeric(schema, seed);
    if (!rebuilt) { issues.push({ questionId: question.id, problem: 'value-mismatch' }); continue; }
    const correct = question.options[question.answer];
    if (!correct || !rebuilt.question.options.includes(correct)) issues.push({ questionId: question.id, problem: 'answer-not-in-options' });
    const rebuiltCorrect = rebuilt.question.options[rebuilt.question.answer];
    if (rebuiltCorrect !== correct) issues.push({ questionId: question.id, problem: 'value-mismatch' });
  }
  return issues;
}
