import type { SubjectId } from './data';
import type { QuizQuestion } from './types';
import { BANK_QUESTIONS } from './quiz-bank';
import { DEPTH_QUESTIONS, DEPTH_QUESTIONS_2 } from './quiz-depth';

const SEED_AT = '2026-01-01T00:00:00.000Z';
let seedIndex = 0;
function q(subject: SubjectId, chapterId: string, question: string, options: string[], answer: number, explanation?: string): QuizQuestion {
  seedIndex++;
  return { id: `seed-${String(seedIndex).padStart(3, '0')}`, subject, chapterId, question, options, answer, explanation, source: 'প্রাথমিক নমুনা ব্যাংক', createdAt: SEED_AT, bank: true };
}

/**
 * A small, carefully checked starter bank. It is deliberately labelled as a sample:
 * it is not a board question paper, and the app never claims full syllabus coverage.
 * Users add their own questions from books/teachers, which then live in their local data.
 */
const BASE_QUESTIONS: QuizQuestion[] = [
  q('physics', 'physics-1-2', 'সমান মানের দুইটি ভেক্টরের লব্ধি সর্বোচ্চ হয় কত কোণে?', ['০°', '৪৫°', '৯০°', '১৮০°'], 0, 'সমান দিক হলে লব্ধি সর্বোচ্চ, অর্থাৎ ০°।'),
  q('physics', 'physics-1-2', 'দুইটি ভেক্টরের ডট গুণফলের ফলাফল কী?', ['স্কেলার', 'ভেক্টর', 'টেনসর', 'মাত্রাহীন ভেক্টর'], 0, 'ডট গুণফল একটি স্কেলার রাশি।'),
  q('physics', 'physics-1-2', 'ক্রস গুণফলের ফলাফল কোন রাশি?', ['ভেক্টর', 'স্কেলার', 'শুধু ধনাত্মক', 'এককবিহীন'], 0, 'ক্রস গুণফল ভেক্টর; দিক ডান হাতের নিয়মে পাওয়া যায়।'),
  q('physics', 'physics-1-2', '১ নিউটন = কত ডাইন?', ['১০³ ডাইন', '১০⁴ ডাইন', '১০⁵ ডাইন', '১০⁶ ডাইন'], 2, '1 N = 10⁵ dyne।'),
  q('physics', 'physics-1-3', 'পৃথিবীর নিকটে মুক্তভাবে পড়ন্ত বস্তুর ত্বরণ প্রায় কত?', ['৯.৮ m/s²', '৯৮ m/s²', '১.৮ m/s²', '০ m/s²'], 0),
  q('physics', 'physics-1-3', 'v = u + at সমীকরণটি কোন সম্পর্ক প্রকাশ করে?', ['বেগ ও সময়', 'সরণ ও সময়', 'বেগ ও সরণ', 'বল ও ভর'], 0, 'এটি সমত্বরণে বেগ–সময় সম্পর্ক।'),
  q('physics', 'physics-1-5', 'কাজের SI একক কী?', ['জুল', 'ওয়াট', 'নিউটন', 'প্যাসকেল'], 0),
  q('physics', 'physics-1-5', 'ক্ষমতার SI একক কী?', ['জুল', 'ওয়াট', 'নিউটন', 'কিলোগ্রাম'], 1, 'ক্ষমতা = কাজ/সময়; একক ওয়াট = জুল/সেকেন্ড।'),
  q('physics', 'physics-1-5', '১ কিলোওয়াট-ঘণ্টা = কত জুল?', ['৩.৬ × ১০³ J', '৩.৬ × ১০⁵ J', '৩.৬ × ১০⁶ J', '৩.৬ × ১০⁹ J'], 2),
  q('physics', 'physics-1-8', 'সরল দোলকের দোলনকাল কীসের উপর নির্ভর করে?', ['দৈর্ঘ্য ও অভিকর্ষজ ত্বরণ', 'ভর ও বিস্তার', 'রঙ ও তাপমাত্রা', 'কেবল বিস্তার'], 0, 'T = 2π√(L/g); দোলকের ভর ও ছোট বিস্তারে নির্ভর করে না।'),
  q('physics', 'physics-1-9', 'শব্দের বেগ কোন মাধ্যমে সবচেয়ে বেশি?', ['শূন্য', 'বায়ু', 'পানি', 'ইস্পাত'], 3, 'সাধারণত কঠিন মাধ্যমে শব্দের বেগ সর্বাধিক।'),
  q('physics', 'physics-1-10', 'আদর্শ গ্যাসের সমীকরণ কোনটি?', ['PV = nRT', 'PV = nR/T', 'P/V = nRT', 'P + V = nRT'], 0),
  q('physics', 'physics-2-3', 'স্থির তাপমাত্রায় ওহমের সূত্র কোনটি?', ['V = IR', 'V = I/R', 'R = VI', 'I = VR'], 0),
  q('physics', 'physics-2-3', 'রোধের SI একক কী?', ['ভোল্ট', 'অ্যাম্পিয়ার', 'ওহম', 'ফ্যারাড'], 2),
  q('physics', 'physics-2-2', 'ধারকত্বের SI একক কী?', ['ফ্যারাড', 'কুলম্ব', 'ভোল্ট', 'ওহম'], 0),
  q('physics', 'physics-2-2', 'দুইটি বিন্দু আধানের মধ্যকার বল কোন সূত্র মেনে চলে?', ['কুলম্বের সূত্র', 'ওহমের সূত্র', 'ফ্যারাডের সূত্র', 'বয়েলের সূত্র'], 0),

  q('chemistry', 'chemistry-1-2', 'পানির মোলার ভর কত?', ['১৬ g/mol', '১৮ g/mol', '২০ g/mol', '২২ g/mol'], 1, 'H₂O = 2×1 + 16 = 18 g/mol।'),
  q('chemistry', 'chemistry-1-2', 'অ্যাভোগাড্রো সংখ্যার মান প্রায় কত?', ['৬.০২২ × ১০²³ mol⁻¹', '৬.০২২ × ১০²² mol⁻¹', '৩.১৪ × ১০²³ mol⁻¹', '৯.৮ × ১০²³ mol⁻¹'], 0),
  q('chemistry', 'chemistry-1-4', 'pH = ৭ হলে দ্রবণটি কেমন?', ['অম্লীয়', 'ক্ষারীয়', 'নিরপেক্ষ', 'প্রবল অম্লীয়'], 2),
  q('chemistry', 'chemistry-1-4', 'pH কমলে সাধারণত কী বোঝায়?', ['অম্লতা বাড়ে', 'ক্ষারত্ব বাড়ে', 'নিরপেক্ষ হয়', 'তাপমাত্রা বাড়ে'], 0),
  q('chemistry', 'chemistry-1-3', 'সোডিয়াম মৌলের প্রতীক কোনটি?', ['S', 'So', 'Na', 'N'], 2, 'ল্যাটিন natrium থেকে Na।'),
  q('chemistry', 'chemistry-1-3', 'পর্যায় সারণির প্রথম গ্রুপের মৌলগুলোকে কী বলা হয়?', ['ক্ষার ধাতু', 'হ্যালোজেন', 'নোবেল গ্যাস', 'অভিজাত গ্যাস'], 0),
  q('chemistry', 'chemistry-1-3', 'আয়নিক বন্ধন সাধারণত কোথায় গঠিত হয়?', ['ধাতু ও অধাতুর মধ্যে', 'দুই অধাতুর মধ্যে', 'দুই নোবেল গ্যাসের মধ্যে', 'শুধু ধাতুর মধ্যে'], 0),
  q('chemistry', 'chemistry-2-2', 'সমাণু (isomer) বলতে কী বোঝায়?', ['একই আণবিক সংকেত, ভিন্ন গঠন', 'ভিন্ন আণবিক সংকেত, একই গঠন', 'একই মৌল, একই পরমাণু সংখ্যা নয়', 'শুধু যৌগের রঙ ভিন্ন'], 0),
  q('chemistry', 'chemistry-2-2', 'বেনজিনের আণবিক সংকেত কোনটি?', ['C₆H₆', 'C₆H₁₂', 'C₂H₆', 'CH₄'], 0),
  q('chemistry', 'chemistry-2-4', 'জারণ বলতে সাধারণত কী বোঝায়?', ['ইলেকট্রন হারানো', 'ইলেকট্রন গ্রহণ', 'প্রোটন হারানো', 'নিউট্রন গ্রহণ'], 0),
  q('chemistry', 'chemistry-2-4', 'তড়িৎ বিশ্লেষণে জমা পদার্থের পরিমাণ কোন বিষয়ের সঙ্গে সম্পর্কিত?', ['প্রবাহিত চার্জ', 'পাত্রের রঙ', 'দ্রবণের আয়তন', 'তাপমাত্রা'], 0, 'ফ্যারাডের সূত্র অনুযায়ী জমা ভর চার্জের সমানুপাতিক।'),

  q('biology', 'biology-1-1', 'কোষের শক্তিঘর বলা হয় কোন অঙ্গাণুকে?', ['মাইটোকন্ড্রিয়া', 'রাইবোজোম', 'গলগি বডি', 'লাইসোজোম'], 0),
  q('biology', 'biology-1-3', 'প্রোটিন সংশ্লেষণে সরাসরি অংশ নেয় কোনটি?', ['রাইবোজোম', 'মাইটোকন্ড্রিয়া', 'ভ্যাকুওল', 'সেন্ট্রিওল'], 0),
  q('biology', 'biology-1-3', 'DNA-এর পূর্ণরূপ কী?', ['ডিঅক্সিরাইবোনিউক্লিক অ্যাসিড', 'রাইবোনিউক্লিক অ্যাসিড', 'ডাইঅক্সিজেন', 'ডাইনিউক্লিয়ার অ্যাসিড'], 0),
  q('biology', 'biology-1-2', 'মাইটোসিস কোষ বিভাজনে ক্রোমোজোম সংখ্যা কেমন হয়?', ['অপরিবর্তিত', 'অর্ধেক', 'দ্বিগুণ', 'চার গুণ'], 0),
  q('biology', 'biology-1-2', 'মিয়োসিস বিভাজনে ক্রোমোজোম সংখ্যা কেমন হয়?', ['অর্ধেক', 'অপরিবর্তিত', 'দ্বিগুণ', 'শূন্য'], 0),
  q('biology', 'biology-1-9', 'সালোকসংশ্লেষণের প্রধান সবুজ রঞ্জক কোনটি?', ['ক্লোরোফিল', 'ক্যারোটিন', 'জ্যান্থোফিল', 'হিমোগ্লোবিন'], 0),
  q('biology', 'biology-1-9', 'সালোকসংশ্লেষণে কোন গ্যাস নির্গত হয়?', ['অক্সিজেন', 'কার্বন ডাইঅক্সাইড', 'নাইট্রোজেন', 'হাইড্রোজেন'], 0),
  q('biology', 'biology-1-9', 'সালোকসংশ্লেষণের জন্য কোন গ্যাস প্রয়োজন?', ['কার্বন ডাইঅক্সাইড', 'অক্সিজেন', 'নাইট্রোজেন', 'মিথেন'], 0),
  q('biology', 'biology-2-4', 'রক্তে অক্সিজেন পরিবহন করে কোনটি?', ['হিমোগ্লোবিন', 'অ্যালবুমিন', 'প্লাজমা', 'অণুচক্রিকা'], 0),
  q('biology', 'biology-2-4', 'মানব হৃদযন্ত্রে কতটি প্রকোষ্ঠ আছে?', ['২টি', '৩টি', '৪টি', '৫টি'], 2),
  q('biology', 'biology-2-8', 'নিউরনের অংশ কোনগুলো?', ['ডেনড্রাইট, কোষদেহ ও অ্যাক্সন', 'কেবল অ্যাক্সন', 'কেবল ডেনড্রাইট', 'হিমোগ্লোবিন ও প্লাজমা'], 0),
  q('biology', 'biology-2-11', 'মেন্ডেলের প্রথম সূত্রকে কী বলা হয়?', ['সেগ্রিগেশন সূত্র', 'স্বাধীন সঞ্চারণ সূত্র', 'প্রভাবাধীন সূত্র', 'সংযোজন সূত্র'], 0),
  q('biology', 'biology-2-10', 'টিকা সাধারণত কী তৈরি করে?', ['রোগ প্রতিরোধ ক্ষমতা', 'রক্তের গ্রুপ', 'হরমোন', 'এনজাইম'], 0),

  q('math', 'math-1-1', '২×২ ম্যাট্রিক্স [[a,b],[c,d]]-এর নির্ণায়ক কত?', ['ad − bc', 'ab − cd', 'ac − bd', 'a + d'], 0),
  q('math', 'math-1-6', 'log₂ 8-এর মান কত?', ['২', '৩', '৪', '৮'], 1, '2³ = 8।'),
  q('math', 'math-1-6', 'sin²θ + cos²θ = কত?', ['০', '১', '২', 'sin 2θ'], 1),
  q('math', 'math-1-9', 'd/dx (x²) = কত?', ['x', '2x', 'x³', '2'], 1),
  q('math', 'math-1-10', '∫ x dx = কত?', ['x²/2 + C', 'x² + C', '2x + C', 'x + C'], 0),
  q('math', 'math-2-3', 'জটিল সংখ্যায় i² = কত?', ['−১', '১', '০', 'i'], 0),
  q('math', 'math-1-5', 'nPr = কত?', ['n!/(n−r)!', 'n!/r!', 'n!/(r!(n−r)!)', 'n × r'], 0),
  q('math', 'math-1-5', 'nCr = কত?', ['n!/(r!(n−r)!)', 'n!/(n−r)!', 'n!/r!', 'n + r'], 0),
  q('math', 'math-1-3', 'দুইটি বিন্দু (x₁,y₁) ও (x₂,y₂)-এর মধ্য দিয়ে সরলরেখার ঢাল কত?', ['(y₂−y₁)/(x₂−x₁)', '(x₂−x₁)/(y₂−y₁)', '(y₂+y₁)/(x₂+x₁)', 'x₂−x₁'], 0),
  q('math', 'math-1-4', 'মূলবিন্দুকে কেন্দ্র করে r ব্যাসার্ধের বৃত্তের সমীকরণ কোনটি?', ['x² + y² = r²', 'x + y = r', 'x² − y² = r²', 'x² + y² = 2r'], 0),

  q('ict', 'ict-1-3', 'বাইনারি ১০১০-এর দশমিক মান কত?', ['৮', '১০', '১২', '১৪'], 1, '8 + 0 + 2 + 0 = 10।'),
  q('ict', 'ict-1-3', 'OR গেটে ইনপুট ১ ও ০ হলে আউটপুট কত?', ['০', '১', '২', 'অনির্দিষ্ট'], 1),
  q('ict', 'ict-1-4', 'HTML-এর পূর্ণরূপ কী?', ['HyperText Markup Language', 'HighText Machine Language', 'HyperTool Markup Language', 'Home Tool Markup Language'], 0),
  q('ict', 'ict-1-5', 'C ভাষায় লুপ কোনটি?', ['for', 'while', 'do-while', 'সবগুলো'], 3),
  q('ict', 'ict-1-6', 'ডেটাবেজে প্রাইমারি কী-এর কাজ কী?', ['প্রতিটি রেকর্ডকে অনন্যভাবে শনাক্ত করা', 'টেবিলের রঙ ঠিক করা', 'ডেটা মুছে ফেলা', 'শুধু সংখ্যা রাখা'], 0),
  q('ict', 'ict-1-6', 'DBMS-এর পূর্ণরূপ কী?', ['Database Management System', 'Data Business Management Software', 'Digital Base Management System', 'Database Machine System'], 0),
  q('ict', 'ict-1-2', 'IPv4 অ্যাড্রেস কত বিটের?', ['১৬ বিট', '৩২ বিট', '৬৪ বিট', '১২৮ বিট'], 1),
  q('ict', 'ict-1-2', 'ROM-এর বৈশিষ্ট্য কোনটি?', ['বিদ্যুৎ বন্ধ হলে তথ্য সাধারণত থাকে', 'শুধু পড়া যায়, কখনো লেখা যায় না', 'প্রচুর ধারণক্ষমতা', 'ক্যাশ মেমোরির অংশ'], 0),
  q('ict', 'ict-1-2', 'তারকা টোপোলজিতে কেন্দ্রীয় ডিভাইস কোনটি?', ['হাব/সুইচ', 'রাউটারবিহীন কেবল', 'প্রিন্টার', 'স্ক্যানার'], 0),
];

/** The full starter bank: the original sample plus the chapter-by-chapter additions. */
export const STARTER_QUESTIONS: QuizQuestion[] = [...BASE_QUESTIONS, ...BANK_QUESTIONS, ...DEPTH_QUESTIONS, ...DEPTH_QUESTIONS_2];

export interface BuiltinFormula {
  id: string;
  subject: SubjectId;
  title: string;
  body: string;
  chapterId?: string;
}
export const STARTER_FORMULAS: BuiltinFormula[] = [
  { id: 'f-phy-1', subject: 'physics', chapterId: 'physics-1-3', title: 'গতির সমীকরণ', body: 'v = u + at\ns = ut + ½at²\nv² = u² + 2as' },
  { id: 'f-phy-2', subject: 'physics', chapterId: 'physics-1-4', title: 'নিউটনের দ্বিতীয় সূত্র', body: 'F = ma\nভরবেগ p = mv\nঘাত FΔt = Δp' },
  { id: 'f-phy-3', subject: 'physics', chapterId: 'physics-1-6', title: 'মহাকর্ষ', body: 'F = G m₁m₂/r²\ng = GM/R²\nG = 6.674 × 10⁻¹¹ N·m²/kg²' },
  { id: 'f-phy-4', subject: 'physics', chapterId: 'physics-1-8', title: 'সরল দোলক', body: 'T = 2π√(L/g)\nf = 1/T' },
  { id: 'f-phy-5', subject: 'physics', chapterId: 'physics-1-10', title: 'আদর্শ গ্যাস', body: 'PV = nRT\nR = 8.314 J/(mol·K)\nP₁V₁/T₁ = P₂V₂/T₂' },
  { id: 'f-phy-6', subject: 'physics', chapterId: 'physics-2-3', title: 'ওহম ও কির্শফ', body: 'V = IR\nশ্রেণিতে R = R₁ + R₂ + …\nসমান্তরালে 1/R = 1/R₁ + 1/R₂ + …\nΣI = 0, ΣV = 0' },
  { id: 'f-phy-7', subject: 'physics', chapterId: 'physics-2-2', title: 'কুলম্ব ও ধারক', body: 'F = kq₁q₂/r², k = 9 × 10⁹ N·m²/C²\nC = Q/V\nসমান্তরাল পাত ধারক C = ε₀A/d' },
  { id: 'f-chem-1', subject: 'chemistry', chapterId: 'chemistry-1-2', title: 'মোল ও ঘনমাত্রা', body: 'n = m/M\nM = n/V(L)\nN = n × 6.022 × 10²³' },
  { id: 'f-chem-2', subject: 'chemistry', chapterId: 'chemistry-1-4', title: 'pH ও pOH', body: 'pH = −log[H⁺]\npOH = −log[OH⁻]\npH + pOH = 14 (25 °C)' },
  { id: 'f-chem-3', subject: 'chemistry', chapterId: 'chemistry-2-3', title: 'গ্যাস সূত্র', body: 'PV = nRT\nবয়েল: P₁V₁ = P₂V₂\nচার্লস: V₁/T₁ = V₂/T₂' },
  { id: 'f-chem-4', subject: 'chemistry', chapterId: 'chemistry-2-4', title: 'ফ্যারাডের সূত্র', body: 'm = (ItM)/(nF)\nF = 96500 C/mol' },
  { id: 'f-math-1', subject: 'math', chapterId: 'math-1-1', title: 'নির্ণায়ক', body: '|A| = ad − bc (২×২)\nবিপরীত ম্যাট্রিক্স A⁻¹ = adj(A)/|A|' },
  { id: 'f-math-2', subject: 'math', chapterId: 'math-1-3', title: 'সরলরেখা', body: 'ঢাল m = (y₂−y₁)/(x₂−x₁)\ny = mx + c\nd = |ax₁ + by₁ + c|/√(a² + b²)' },
  { id: 'f-math-3', subject: 'math', chapterId: 'math-1-6', title: 'ত্রিকোণমিতি', body: 'sin²θ + cos²θ = 1\nsin 2θ = 2 sinθ cosθ\ncos 2θ = cos²θ − sin²θ' },
  { id: 'f-math-4', subject: 'math', chapterId: 'math-1-9', title: 'অন্তরীকরণ', body: 'd/dx(xⁿ) = nxⁿ⁻¹\nd/dx(sin x) = cos x\nd/dx(cos x) = −sin x\nd/dx(ln x) = 1/x' },
  { id: 'f-math-5', subject: 'math', chapterId: 'math-1-10', title: 'যোগজীকরণ', body: '∫xⁿ dx = xⁿ⁺¹/(n+1) + C (n ≠ −1)\n∫sin x dx = −cos x + C\n∫cos x dx = sin x + C' },
  { id: 'f-math-6', subject: 'math', chapterId: 'math-2-5', title: 'দ্বিপদী বিস্তৃতি', body: '(a + b)ⁿ = Σ nCr aⁿ⁻ʳ bʳ\nসাধারণ পদ Tr+1 = nCr aⁿ⁻ʳ bʳ' },
  { id: 'f-bio-1', subject: 'biology', chapterId: 'biology-1-3', title: 'DNA ও RNA', body: 'DNA: ডিঅক্সিরাইবোনিউক্লিক অ্যাসিড\nRNA: রাইবোনিউক্লিক অ্যাসিড\nকেন্দ্রীয় নীতিমালা: DNA → RNA → প্রোটিন' },
  { id: 'f-bio-2', subject: 'biology', chapterId: 'biology-1-9', title: 'সালোকসংশ্লেষণ', body: '6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂ (আলো ও ক্লোরোফিল)' },
  { id: 'f-ict-1', subject: 'ict', chapterId: 'ict-1-3', title: 'সংখ্যা পদ্ধতি', body: 'বাইনারি → দশমিক: অবস্থানভিত্তিক যোগ\n২-এর ঘাত: 1, 2, 4, 8, 16, 32…\n১ বাইট = ৮ বিট' },
  { id: 'f-ict-2', subject: 'ict', chapterId: 'ict-1-3', title: 'বুলিয়ান', body: 'A + A′ = 1\nA · A′ = 0\n(A + B)′ = A′ · B′ (ডি মরগান)' },
  { id: 'f-ict-3', subject: 'ict', chapterId: 'ict-1-6', title: 'ডেটাবেজ', body: 'প্রাইমারি কী → রেকর্ড শনাক্ত\nফরেন কী → অন্য টেবিলের সাথে সম্পর্ক\nSELECT … FROM … WHERE …' },
];
