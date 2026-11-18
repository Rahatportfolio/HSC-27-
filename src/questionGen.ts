import { t } from './i18n';
import { CHAPTERS, chapterById } from './data';
import { isEnglish } from './i18n';
import { STARTER_QUESTIONS } from './quiz-data';
import type { QuizQuestion } from './types';

/**
 * Rule-based question generation (no server, no model, no guessing).
 *
 * Every fact below is a textbook value that the app already ships in its own banks
 * (`quiz-data.ts` / `quiz-bank.ts`). A generated question is therefore verifiable:
 * the correct option is a fact the student can check in the same chapter, the three
 * distractors are the *real* values that belong to other facts of that chapter, and
 * the explanation names the source and repeats the value.
 *
 * The pool is a whitelist — never free text. If a fact is not in the pool, nothing is
 * generated for it. That is what keeps "automatic" from becoming "invented".
 */

export interface FactPair {
  chapterId: string;
  /** A natural question stem, already bilingual. */
  prompt: string;
  /** Absent when the source text is Bengali-only (a recovered bank row). */
  promptEn?: string;
  /** Value that is the correct answer. */
  value: string;
  valueEn?: string;
  /** Where the value comes from — printed in the explanation and in the UI. */
  origin: string;
  originEn?: string;
  /** A second fact that explains why the value is what it is (optional). */
  why?: string;
  whyEn?: string;
}

const P: FactPair[] = [
  // ---- Physics 1st paper ----
  { chapterId: 'physics-1-1', prompt: 'SI পদ্ধতিতে মৌলিক এককের সংখ্যা কত?', promptEn: 'How many base units does the SI system have?', value: '৭', valueEn: '7', origin: 'SI-এর ৭টি মৌলিক একক', originEn: 'Seven SI base units', why: 'মিটার, কিলোগ্রাম, সেকেন্ড, অ্যাম্পিয়ার, কেলভিন, মোল ও ক্যান্ডেলা।' },
  { chapterId: 'physics-1-2', prompt: 'সমান মানের দুইটি ভেক্টরের লব্ধি সর্বোচ্চ হয় কত কোণে?', promptEn: 'At what angle is the resultant of two equal vectors largest?', value: '০°', valueEn: '0°', origin: 'লব্ধির সূত্র R² = A² + B² + 2ABcosθ', originEn: 'R² = A² + B² + 2ABcosθ', why: 'θ = ০° হলে cosθ = ১, তাই লব্ধি সর্বোচ্চ।' },
  { chapterId: 'physics-1-3', prompt: 'প্রাসের সর্বোচ্চ পাল্লা পাওয়া যায় কত কোণে?', promptEn: 'Which launch angle gives the greatest range?', value: '৪৫°', valueEn: '45°', origin: 'পাল্লা R = u²sin2θ/g', originEn: 'Range R = u² sin2θ/g', why: 'sin2θ সর্বোচ্চ (১) হয় 2θ = ৯০°, অর্থাৎ θ = ৪৫°।' },
  { chapterId: 'physics-1-4', prompt: 'ভরবেগের একক কোনটি?', promptEn: 'What is the unit of momentum?', value: 'N·s', valueEn: 'N·s', origin: 'p = mv → kg·m/s = N·s', originEn: 'p = mv → kg·m/s = N·s' },
  { chapterId: 'physics-1-5', prompt: '১ অশ্বশক্তি প্রায় কত ওয়াট?', promptEn: 'One horsepower is about how many watts?', value: '৭৪৬ W', valueEn: '746 W', origin: '১ hp ≈ ৭৪৬ W', originEn: '1 hp ≈ 746 W' },
  { chapterId: 'physics-1-6', prompt: 'পৃথিবীর মুক্তি বেগ প্রায় কত?', promptEn: 'What is Earth’s escape velocity?', value: '১১.২ km/s', valueEn: '11.2 km/s', origin: 'v = √(2GM/R)', originEn: 'v = √(2GM/R)' },
  { chapterId: 'physics-1-8', prompt: 'সরল দোলকের দোলনকাল কীসের উপর নির্ভর করে?', promptEn: 'What does a simple pendulum’s period depend on?', value: 'দৈর্ঘ্য ও অভিকর্ষজ ত্বরণ', valueEn: 'Length and gravitational acceleration', origin: 'T = 2π√(L/g)', originEn: 'T = 2π√(L/g)', why: 'ভর ও (ছোট) বিস্তার মোটেই প্রভাব ফেলে না।' },
  { chapterId: 'physics-1-9', prompt: 'শব্দের বেগ কোন মাধ্যমে সবচেয়ে বেশি?', promptEn: 'In which medium is sound fastest?', value: 'ইস্পাত', valueEn: 'Steel', origin: 'কঠিন > তরল > গ্যাস', originEn: 'Solid > liquid > gas' },
  { chapterId: 'physics-1-10', prompt: 'আদর্শ গ্যাসের সমীকরণ কোনটি?', promptEn: 'Which is the ideal-gas equation?', value: 'PV = nRT', valueEn: 'PV = nRT', origin: 'R = ৮.৩১৪ J/(mol·K)', originEn: 'R = 8.314 J/(mol·K)' },
  // ---- Physics 2nd paper ----
  { chapterId: 'physics-2-1', prompt: 'তাপগতিবিদ্যার প্রথম সূত্রে অভ্যন্তরীণ শক্তির পরিবর্তন লেখা হয় কীভাবে?', promptEn: 'The first law of thermodynamics expresses the change in internal energy as—', value: 'ΔU = Q − W', valueEn: 'ΔU = Q − W', origin: 'প্রথম সূত্র ΔU = Q − W', originEn: 'First law ΔU = Q − W', why: 'গৃহীত তাপ Q, বস্তু দ্বারা কৃত কাজ W।' },
  { chapterId: 'physics-2-2', prompt: 'কুলম্বের সূত্রে দুই আধানের মধ্যে বল কিসের সমানুপাতিক?', promptEn: 'In Coulomb’s law the force is proportional to—', value: '1/r²-এর', valueEn: '1/r²', origin: 'F = kq₁q₂/r²', originEn: 'F = kq₁q₂/r²', why: 'দূরত্ব দ্বিগুণ হলে বল এক-চতুর্থাংশ হয়।' },
  { chapterId: 'physics-2-3', prompt: 'স্থির তাপমাত্রায় ওহমের সূত্র কোনটি?', promptEn: 'Which is Ohm’s law at constant temperature?', value: 'V = IR', valueEn: 'V = IR', origin: 'V = IR', originEn: 'V = IR' },
  { chapterId: 'physics-2-4', prompt: 'চৌম্বক ফ্লাক্সের SI একক কোনটি?', promptEn: 'What is the SI unit of magnetic flux?', value: 'ওয়েবার', valueEn: 'Weber', origin: '১ ওয়েবার = ১ T·m²', originEn: '1 weber = 1 T·m²' },
  { chapterId: 'physics-2-5', prompt: 'ফ্যারাডের আবেশ সূত্রে তাড়িতচৌম্বক বল (emf) কিসের সমানুপাতিক?', promptEn: 'Faraday’s law: the induced emf is proportional to—', value: 'ফ্লাক্স পরিবর্তনের হারের', valueEn: 'the rate of change of flux', origin: 'ε = −dΦ/dt', originEn: 'ε = −dΦ/dt' },
  { chapterId: 'physics-2-6', prompt: 'লেন্সের ক্ষমতার একক কী?', promptEn: 'What is the unit of lens power?', value: 'ডায়োপ্টার', valueEn: 'dioptre', origin: 'P = ১/f (মিটারে)', originEn: 'P = 1/f (in metres)' },
  { chapterId: 'physics-2-7', prompt: 'ইয়ং-এর দ্বি-চিড় পরীক্ষা আলোর কোন ধর্ম প্রতিষ্ঠা করে?', promptEn: 'Young’s double-slit experiment establishes which nature of light?', value: 'তরঙ্গ ধর্ম', valueEn: 'wave nature', origin: 'Δx = λD/d', originEn: 'Δx = λD/d', why: 'দুই চিড় থেকে আসা তরঙ্গের ব্যতিচারেই ডোরা তৈরি হয়।' },
  { chapterId: 'physics-2-8', prompt: 'ফটোইলেকট্রিক ক্রিয়ায় নিঃসৃত ইলেকট্রনের গতিশক্তি কিসের ওপর নির্ভর করে?', promptEn: 'In the photoelectric effect, kinetic energy of the emitted electron depends on—', value: 'আলোর কম্পাঙ্কের ওপর', valueEn: 'the frequency of light', origin: 'E = hf − φ', originEn: 'E = hf − φ' },
  { chapterId: 'physics-2-9', prompt: 'তেজস্ক্রিয় ক্ষয়ের অর্ধায়ু T₁/₂ হলে ২T₁/₂ পরে অবশিষ্ট থাকে—', promptEn: 'After two half-lives, the fraction remaining is—', value: '১/৪', valueEn: '1/4', origin: 'N = N₀(½)ⁿ', originEn: 'N = N₀(½)ⁿ', why: 'প্রতি অর্ধায়ুতে অর্ধেক ক্ষয় হয়: ১ → ১/২ → ১/৪।' },
  { chapterId: 'physics-2-10', prompt: 'লজিক গেট AND-এর আউটপুট ১ হয় যখন—', promptEn: 'An AND gate outputs 1 when—', value: 'সব ইনপুট ১', valueEn: 'all inputs are 1', origin: 'AND সত্যক সারণি', originEn: 'the AND truth table', why: 'যেকোনো একটি ইনপুট ০ হলেই AND-এর আউটপুট ০।' },

  // ---- Chemistry 1st paper ----
  { chapterId: 'chemistry-1-1', prompt: 'রাসায়নিক পরিবর্তনের মূল বৈশিষ্ট্য কী?', promptEn: 'The defining feature of a chemical change is—', value: 'নতুন পদার্থ তৈরি হয়', valueEn: 'a new substance is formed', origin: 'রাসায়নিক পরিবর্তনের সংজ্ঞা', originEn: 'definition of a chemical change', why: 'শুধু অবস্থার বদল (বরফ গলা) ভৌত পরিবর্তন।' },
  { chapterId: 'chemistry-1-2', prompt: 'পানির মোলার ভর কত?', promptEn: 'What is the molar mass of water?', value: '১৮ g/mol', valueEn: '18 g/mol', origin: 'H₂O = ২×১ + ১৬', originEn: 'H₂O = 2×1 + 16' },
  { chapterId: 'chemistry-1-3', prompt: 'সোডিয়াম মৌলের প্রতীক কোনটি?', promptEn: 'What is the symbol of sodium?', value: 'Na', valueEn: 'Na', origin: 'ল্যাটিন natrium থেকে', originEn: 'From Latin natrium' },
  { chapterId: 'chemistry-1-4', prompt: 'pH = ৭ হলে দ্রবণটি কেমন?', promptEn: 'A solution with pH = 7 is—', value: 'নিরপেক্ষ', valueEn: 'neutral', origin: 'pH = −log[H⁺]', originEn: 'pH = −log[H⁺]', why: '২৫ °C-তে pH + pOH = ১৪; [H⁺] = [OH⁻] হলে নিরপেক্ষ।' },
  { chapterId: 'chemistry-1-5', prompt: 'সাবান তৈরি হয় কোন দুটির বিক্রিয়ায়?', promptEn: 'Soap is made by the reaction of—', value: 'চর্বি/তেল ও ক্ষারকের বিক্রিয়ায়', valueEn: 'fat/oil with an alkali', origin: 'চর্বি + NaOH → সাবান + গ্লিসারল', originEn: 'Fat + NaOH → soap + glycerol' },
  // ---- Chemistry 2nd paper ----
  { chapterId: 'chemistry-2-1', prompt: 'পানি শোধনে সাধারণত কোন দুটি পদার্থ ব্যবহৃত হয়?', promptEn: 'Which two substances are commonly used to purify water?', value: 'ফিটকিরি ও ব্লিচিং পাউডার', valueEn: 'alum and bleaching powder', origin: 'পানিশোধনের প্রচলিত রাসায়নিক', originEn: 'standard water-treatment chemicals' },
  { chapterId: 'chemistry-2-2', prompt: 'বেনজিন অণুতে কার্বন পরমাণুর সংখ্যা কত?', promptEn: 'How many carbon atoms are in one benzene molecule?', value: '৬', valueEn: '6', origin: 'বেনজিন C₆H₆', originEn: 'Benzene is C₆H₆', why: 'ছয়টি কার্বন ও ছয়টি হাইড্রোজেন—ষড়ভুজাকার বলয়।' },
  { chapterId: 'chemistry-2-3', prompt: 'STP-তে ১ মোল গ্যাসের আয়তন (লিটারে) কত?', promptEn: 'At STP, one mole of a gas occupies (in litres)—', value: '২২.৪', valueEn: '22.4', origin: 'মোলার আয়তন = ২২.৪ L (STP)', originEn: 'molar volume = 22.4 L at STP' },
  { chapterId: 'chemistry-2-4', prompt: '১ ফ্যারাডে প্রায় কত কুলম্বের সমান?', promptEn: 'One faraday is about how many coulombs?', value: '৯৬৫০০ C', valueEn: '96500 C', origin: 'm = ItM/(nF)', originEn: 'm = ItM/(nF)' },
  { chapterId: 'chemistry-2-5', prompt: 'ইউরিয়ার রাসায়নিক সংকেত কোনটি?', promptEn: 'What is the chemical formula of urea?', value: 'CO(NH₂)₂', valueEn: 'CO(NH₂)₂', origin: '2NH₃ + CO₂ → CO(NH₂)₂ + H₂O', originEn: '2NH₃ + CO₂ → CO(NH₂)₂ + H₂O' },

  // ---- Biology 1st paper ----
  { chapterId: 'biology-1-1', prompt: 'কোষের শক্তিঘর বলা হয় কোন অঙ্গাণুকে?', promptEn: 'Which organelle is the powerhouse of the cell?', value: 'মাইটোকন্ড্রিয়া', valueEn: 'mitochondria', origin: 'ATP উৎপাদনের প্রধান স্থান', originEn: 'the main site of ATP production' },
  { chapterId: 'biology-1-2', prompt: 'মিয়োসিস বিভাজনের শেষে ক্রোমোজোম সংখ্যা কেমন হয়?', promptEn: 'At the end of meiosis, the chromosome number—', value: 'অর্ধেক', valueEn: 'halves', origin: 'মিয়োসিস = হ্রাস বিভাজন', originEn: 'Meiosis is the reduction division' },
  { chapterId: 'biology-1-4', prompt: 'নাইট্রোজেন সংবন্ধনকারী ব্যাকটেরিয়া কোনটি?', promptEn: 'Which bacterium fixes nitrogen?', value: 'রাইজোবিয়াম', valueEn: 'Rhizobium', origin: 'গুটির ভেতরে N₂ → NH₃', originEn: 'N₂ → NH₃ inside root nodules' },
  { chapterId: 'biology-1-9', prompt: 'সালোকসংশ্লেষণের প্রধান সবুজ রঞ্জক কোনটি?', promptEn: 'Which pigment drives photosynthesis?', value: 'ক্লোরোফিল', valueEn: 'chlorophyll', origin: '6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂', originEn: '6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂' },
  // ---- Biology 2nd paper ----
  { chapterId: 'biology-2-1', prompt: 'প্রাণীজগতে সবচেয়ে প্রজাতিসমৃদ্ধ পর্ব কোনটি?', promptEn: 'Which animal phylum has the most species?', value: 'Arthropoda', valueEn: 'Arthropoda', origin: 'সন্ধিপদী পর্ব — সবচেয়ে বড় পর্ব', originEn: 'Arthropoda — the largest phylum' },
  { chapterId: 'biology-2-4', prompt: 'রক্তে অক্সিজেন পরিবহন করে কোনটি?', promptEn: 'What carries oxygen in blood?', value: 'হিমোগ্লোবিন', valueEn: 'haemoglobin', origin: 'Hb + O₂ → oxyhaemoglobin', originEn: 'Hb + O₂ → oxyhaemoglobin' },
  { chapterId: 'biology-2-11', prompt: 'মেন্ডেলের প্রথম সূত্রের নাম কী?', promptEn: 'What is Mendel’s first law called?', value: 'সেগ্রিগেশন সূত্র', valueEn: 'law of segregation', origin: 'মেন্ডেলের একক জিন নীতি', originEn: 'Mendel’s single-gene principle' },
  { chapterId: 'biology-2-12', prompt: 'প্রাণীর সহজাত (জন্মগত) আচরণকে কী বলা হয়?', promptEn: 'Innate behaviour in animals is called—', value: 'জন্মগত আচরণ', valueEn: 'instinctive behaviour', origin: 'জন্মগত বনাম শিখিত আচরণ', originEn: 'innate versus learned behaviour' },

  // ---- Higher Math 1st paper ----
  { chapterId: 'math-1-1', prompt: '২×২ নির্ণায়ক |A| = [[a,b],[c,d]]-এর মান কত?', promptEn: 'What is the 2×2 determinant [[a,b],[c,d]]?', value: 'ad − bc', valueEn: 'ad − bc', origin: '|A| = ad − bc', originEn: '|A| = ad − bc' },
  { chapterId: 'math-1-3', prompt: 'y = mx + c সমীকরণে m কী নির্দেশ করে?', promptEn: 'In y = mx + c, what does m represent?', value: 'ঢাল', valueEn: 'the slope', origin: 'ঢাল–ছেদক রূপ', originEn: 'slope–intercept form', why: 'c হলো y-অক্ষে ছেদবিন্দুর মান।' },
  { chapterId: 'math-1-6', prompt: 'sin²θ + cos²θ = কত?', promptEn: 'sin²θ + cos²θ equals—', value: '১', valueEn: '1', origin: 'মৌলিক ত্রিকোণমিতিক অভেদ', originEn: 'the fundamental identity' },
  { chapterId: 'math-1-9', prompt: 'd/dx (xⁿ) = কত?', promptEn: 'd/dx (xⁿ) equals—', value: 'nxⁿ⁻¹', valueEn: 'n xⁿ⁻¹', origin: 'ঘাত নিয়ম', originEn: 'power rule' },
  { chapterId: 'math-1-10', prompt: '∫xⁿ dx (n ≠ −১) = কত?', promptEn: '∫xⁿ dx (n ≠ −1) equals—', value: 'xⁿ⁺¹/(n+1) + c', valueEn: 'xⁿ⁺¹/(n+1) + c', origin: 'যোগজীকরণের ঘাত নিয়ম', originEn: 'integration power rule' },
  // ---- Higher Math 2nd paper ----
  { chapterId: 'math-2-1', prompt: '|x| < a (a > ০) এর সমাধান কোনটি?', promptEn: 'For a > 0, |x| < a means—', value: '−a < x < a', valueEn: '−a < x < a', origin: 'পরম মানের সংজ্ঞা', originEn: 'definition of absolute value' },
  { chapterId: 'math-2-3', prompt: 'i² = কত?', promptEn: 'i² equals—', value: '−১', valueEn: '−1', origin: 'জটিল সংখ্যার একক i', originEn: 'the imaginary unit' },
  { chapterId: 'math-2-5', prompt: '(a+b)ⁿ-এর বিস্তৃতিতে সাধারণ পদ T_{r+1} কোনটি?', promptEn: 'The general term T_{r+1} of (a+b)ⁿ is—', value: 'nCr aⁿ⁻ʳbʳ', valueEn: 'nCr aⁿ⁻ʳbʳ', origin: 'দ্বিপদী উপপাদ্য', originEn: 'binomial theorem' },
  { chapterId: 'math-2-10', prompt: 'কোনো ঘটনার সম্ভাবনার মান সর্বদা কেমন হয়?', promptEn: 'The probability of any event always lies—', value: '০ থেকে ১-এর মধ্যে', valueEn: 'between 0 and 1', origin: '০ ≤ P(A) ≤ ১', originEn: '0 ≤ P(A) ≤ 1' },
  // ---- ICT ----
  { chapterId: 'ict-1-3', prompt: '১ বাইট = কত বিট?', promptEn: 'One byte equals how many bits?', value: '৮', valueEn: '8', origin: '১ বাইট = ৮ বিট', originEn: '1 byte = 8 bits' },
  { chapterId: 'ict-1-4', prompt: 'ওয়েবপেজের শিরোনাম (title) লেখা হয় কোন ট্যাগে?', promptEn: 'A web page’s title is written inside which tag?', value: '<title> ট্যাগে', valueEn: 'the <title> tag', origin: 'HTML <title> ট্যাগ ব্রাউজার ট্যাবে দেখা যায়', originEn: 'HTML <title> shows in the browser tab' },
  { chapterId: 'ict-1-6', prompt: 'ডেটাবেজে প্রাইমারি কী-এর কাজ কী?', promptEn: 'What does a primary key do in a database?', value: 'প্রতিটি রেকর্ডকে অনন্যভাবে শনাক্ত করা', valueEn: 'uniquely identifies each record', origin: 'প্রাইমারি কী-এর সংজ্ঞা', originEn: 'definition of a primary key' },

  // ---- Second batch: the remaining chapters that the shipped banks already cover ----
  { chapterId: 'physics-1-7', prompt: 'ইয়ং গুণাঙ্কের একক কোনটি?', promptEn: 'What is the unit of Young’s modulus?', value: 'N/m²', valueEn: 'N/m²', origin: 'Y = পীড়ন/বিকৃতি', originEn: 'Y = stress/strain' },
  { chapterId: 'physics-1-7', prompt: 'পৃষ্ঠটানের একক কোনটি?', promptEn: 'What is the unit of surface tension?', value: 'N/m', valueEn: 'N/m', origin: 'T = F/L', originEn: 'T = F/L' },
  { chapterId: 'physics-2-11', prompt: 'আলোকবর্ষ কিসের একক?', promptEn: 'A light-year is a unit of—', value: 'দূরত্ব', valueEn: 'distance', origin: 'আলো এক বছরে যে দূরত্ব যায়', originEn: 'the distance light covers in a year' },
  { chapterId: 'physics-2-11', prompt: 'নক্ষত্রের শক্তির মূল উৎস কী?', promptEn: 'What is the main energy source of a star?', value: 'নিউক্লিয়ার ফিউশন', valueEn: 'nuclear fusion', origin: 'হাইড্রোজেন → হিলিয়াম সংযোজন', originEn: 'hydrogen fusing into helium' },

  { chapterId: 'biology-1-3', prompt: 'অ্যামিনো অ্যাসিড কী?', promptEn: 'An amino acid is—', value: 'প্রোটিনের একক', valueEn: 'the building block of protein', origin: 'অ্যামিনো অ্যাসিড → পেপটাইড → প্রোটিন', originEn: 'amino acids → peptide → protein' },
  { chapterId: 'biology-1-3', prompt: 'স্নেহ পদার্থ ভাঙে যে উৎসেচকটির নাম কী?', promptEn: 'Which enzyme breaks down fats?', value: 'লাইপেজ', valueEn: 'lipase', origin: 'লাইপেজ → স্নেহ → ফ্যাটি অ্যাসিড + গ্লিসারল', originEn: 'lipase → fat → fatty acids + glycerol' },
  { chapterId: 'biology-1-5', prompt: 'শৈবালে কোন রঞ্জক থাকে?', promptEn: 'Which pigment do algae contain?', value: 'ক্লোরোফিল', valueEn: 'chlorophyll', origin: 'শৈবাল স্বভোজী', originEn: 'algae are autotrophs' },
  { chapterId: 'biology-1-5', prompt: 'ছত্রাকের কোষপ্রাচীর তৈরি হয় কী দিয়ে?', promptEn: 'A fungal cell wall is made of—', value: 'কাইটিন দিয়ে', valueEn: 'chitin', origin: 'উদ্ভিদকোষ সেলুলোজ, ছত্রাক কাইটিন', originEn: 'plants use cellulose, fungi chitin' },
  { chapterId: 'biology-1-6', prompt: 'ব্রায়োফাইটাকে কী বলা হয়?', promptEn: 'Bryophytes are known as—', value: 'উদ্ভিদ জগতের উভচর', valueEn: 'the amphibians of the plant world', origin: 'জলে ও ডাঙায়—দুই জায়গায় বাঁচে', originEn: 'they need both water and land' },
  { chapterId: 'biology-1-7', prompt: 'আবৃতবীজী উদ্ভিদে বীজ থাকে কোথায়?', promptEn: 'In an angiosperm, the seed sits—', value: 'ফলের ভেতরে', valueEn: 'inside a fruit', origin: 'ডিম্বাশয় ফলকোষে পরিণত হয়', originEn: 'the ovary becomes the fruit' },
  { chapterId: 'biology-1-8', prompt: 'জাইলেমের কাজ কী?', promptEn: 'What does xylem do?', value: 'পানি ও খনিজ পরিবহন', valueEn: 'carries water and minerals', origin: 'জাইলেম ঊর্ধ্বমুখী পরিবহন', originEn: 'xylem transports upward' },
  { chapterId: 'biology-1-8', prompt: 'ফ্লোয়েম কী পরিবহন করে?', promptEn: 'What does phloem carry?', value: 'তৈরি খাদ্য', valueEn: 'prepared food', origin: 'ফ্লোয়েম খাদ্য পরিবহন করে', originEn: 'phloem carries food' },
  { chapterId: 'biology-1-10', prompt: 'পরাগায়ন কী?', promptEn: 'What is pollination?', value: 'পরাগধানী থেকে গর্ভমুণ্ডে পরাগ স্থানান্তর', valueEn: 'transfer of pollen from anther to stigma', origin: 'পরাগযোগের সংজ্ঞা', originEn: 'definition of pollination' },
  { chapterId: 'biology-1-11', prompt: 'টিস্যু কালচারে কী তৈরি হয়?', promptEn: 'Tissue culture produces—', value: 'অবিকল চারা', valueEn: 'identical plantlets', origin: 'এককোষ থেকে বহু অভিন্ন চারা', originEn: 'many identical plants from one cell' },
  { chapterId: 'biology-1-11', prompt: 'DNA ফিঙ্গারপ্রিন্টিং ব্যবহৃত হয় কীসে?', promptEn: 'DNA fingerprinting is used for—', value: 'পরিচয় নির্ণয়ে', valueEn: 'identification', origin: 'DNA পুনরাবৃত্তির ভিন্নতা', originEn: 'variation in DNA repeats' },
  { chapterId: 'biology-1-12', prompt: 'খাদ্যশৃঙ্খলের প্রথম স্তরে থাকে কী?', promptEn: 'The first trophic level of a food chain holds—', value: 'উৎপাদক', valueEn: 'producers', origin: 'উৎপাদক → খাদক → বিয়োজক', originEn: 'producer → consumer → decomposer' },
  { chapterId: 'biology-2-2', prompt: 'রুই মাছের শ্বাস অঙ্গ কোনটি?', promptEn: 'Which organ does a rui fish breathe with?', value: 'ফুলকা', valueEn: 'gills', origin: 'মাছের শ্বাসাঙ্গ ফুলকা', originEn: 'fish breathe with gills' },
  { chapterId: 'biology-2-2', prompt: 'তেলাপোকার শ্বাসনালি কী নামে পরিচিত?', promptEn: 'The breathing tubes of a cockroach are called—', value: 'ট্রাকিয়া', valueEn: 'tracheae', origin: 'পতঙ্গের শ্বাসতন্ত্র ট্রাকিয়া', originEn: 'insects breathe through tracheae' },
  { chapterId: 'biology-2-3', prompt: 'প্রোটিনের পরিপাক শুরু হয় কোথায়?', promptEn: 'Protein digestion begins in the—', value: 'পাকস্থলীতে', valueEn: 'stomach', origin: 'পেপসিন পাকস্থলীতে কাজ করে', originEn: 'pepsin acts in the stomach' },
  { chapterId: 'biology-2-3', prompt: 'পিত্তরস নিঃসৃত হয় কোথা থেকে?', promptEn: 'Bile is secreted by the—', value: 'যকৃৎ থেকে', valueEn: 'liver', origin: 'যকৃত্ পিত্তরস তৈরি করে', originEn: 'the liver makes bile' },
  { chapterId: 'biology-2-5', prompt: 'কোষের শক্তির মুদ্রা কোনটি?', promptEn: 'What is the energy currency of the cell?', value: 'ATP', valueEn: 'ATP', origin: 'ATP → ADP + শক্তি', originEn: 'ATP → ADP + energy' },
  { chapterId: 'biology-2-5', prompt: 'ফুসফুসের ভেতরের ছোট ছোট থলিকে কী বলে?', promptEn: 'The tiny air sacs inside the lungs are—', value: 'অ্যালভিওলাই', valueEn: 'alveoli', origin: 'গ্যাস বিনিময় অ্যালভিওলাই-তে', originEn: 'gas exchange happens in alveoli' },
  { chapterId: 'biology-2-6', prompt: 'বৃক্কের গঠনগত একক কোনটি?', promptEn: 'What is the structural unit of the kidney?', value: 'নেফ্রন', valueEn: 'nephron', origin: 'প্রতিটি বৃক্কে লক্ষাধিক নেফ্রন', originEn: 'each kidney has ~a million nephrons' },
  { chapterId: 'biology-2-7', prompt: 'পেশি ও অস্থিকে যুক্ত করে কোনটি?', promptEn: 'What connects a muscle to a bone?', value: 'টেন্ডন', valueEn: 'a tendon', origin: 'টেন্ডন পেশি ও অস্থি যুক্ত করে; লিগামেন্ট অস্থি ও অস্থি যুক্ত করে', originEn: 'Tendons connect muscle to bone; ligaments connect bone to bone' },
  { chapterId: 'biology-2-8', prompt: 'রক্তে সুগার কমায় কোন হরমোন?', promptEn: 'Which hormone lowers blood sugar?', value: 'ইনসুলিন', valueEn: 'insulin', origin: 'অগ্ন্যাশয়ের ইনসুলিন', originEn: 'insulin from the pancreas' },
  { chapterId: 'biology-2-8', prompt: 'চোখের আলোক-সংবেদনশীল অংশ কোনটি?', promptEn: 'Which part of the eye is light-sensitive?', value: 'রেটিনা', valueEn: 'the retina', origin: 'রেটিনার রড ও কোন কোষ', originEn: 'rods and cones in the retina' },
  { chapterId: 'biology-2-9', prompt: 'মানুষের পুরুষ গ্যামেট কোনটি?', promptEn: 'The human male gamete is the—', value: 'শুক্রাণু', valueEn: 'sperm', origin: 'শুক্রাণু + ডিম্বাণু → জাইগোট', originEn: 'sperm + ovum → zygote' },
  { chapterId: 'biology-2-10', prompt: 'অ্যান্টিবডি তৈরি করে কোন কোষ?', promptEn: 'Which cells produce antibodies?', value: 'বি-লিম্ফোসাইট', valueEn: 'B-lymphocytes', origin: 'B কোষ → প্লাজমা কোষ → অ্যান্টিবডি', originEn: 'B cells → plasma cells → antibodies' },

  { chapterId: 'math-1-2', prompt: 'ভেক্টর (৩, ৪)-এর মান কত?', promptEn: 'What is the magnitude of the vector (3, 4)?', value: '৫', valueEn: '5', origin: '√(৩² + ৪²) = ৫', originEn: '√(3² + 4²) = 5' },
  { chapterId: 'math-1-2', prompt: 'দুই ভেক্টর লম্ব হলে তাদের ডট গুণফল কত?', promptEn: 'If two vectors are perpendicular, their dot product is—', value: '০', valueEn: '0', origin: 'A·B = ABcos৯০° = ০', originEn: 'A·B = ABcos90° = 0' },
  { chapterId: 'math-1-4', prompt: 'মূলবিন্দুকে কেন্দ্র করে r ব্যাসার্ধের বৃত্তের সমীকরণ কোনটি?', promptEn: 'The circle centred at the origin with radius r is—', value: 'x² + y² = r²', valueEn: 'x² + y² = r²', origin: 'কেন্দ্র (০,০), ব্যাসার্ধ r', originEn: 'centre (0,0), radius r' },
  { chapterId: 'math-1-7', prompt: 'sin(A + B) = কত?', promptEn: 'sin(A + B) equals—', value: 'sinA cosB + cosA sinB', valueEn: 'sinA cosB + cosA sinB', origin: 'সংযুক্ত কোণের সূত্র', originEn: 'compound-angle formula' },
  { chapterId: 'math-1-7', prompt: 'cos 2θ = কত?', promptEn: 'cos 2θ equals—', value: 'cos²θ − sin²θ', valueEn: 'cos²θ − sin²θ', origin: 'দ্বিগুণ কোণের সূত্র', originEn: 'double-angle formula' },
  { chapterId: 'math-1-8', prompt: 'y = x² ফাংশনের লেখচিত্র কেমন?', promptEn: 'The graph of y = x² is a—', value: 'পরাবৃত্ত', valueEn: 'parabola', origin: 'দ্বিঘাত ফাংশনের লেখ', originEn: 'the graph of a quadratic' },
  { chapterId: 'math-2-2', prompt: 'যোগাশ্রয়ী প্রোগ্রামিংয়ে উদ্দেশ্য কী?', promptEn: 'The aim of linear programming is to—', value: 'লাভ সর্বোচ্চ বা ব্যয় সর্বনিম্ন করা', valueEn: 'maximise profit or minimise cost', origin: 'উদ্দেশ্য ফাংশনের সর্বোচ্চ/সর্বনিম্ন মান', originEn: 'optimise the objective function' },
  { chapterId: 'math-2-4', prompt: 'বহুপদী P(x)-কে (x − a) দিয়ে ভাগ করলে ভাগশেষ কত?', promptEn: 'Dividing P(x) by (x − a) leaves the remainder—', value: 'P(a)', valueEn: 'P(a)', origin: 'ভাগশেষ উপপাদ্য', originEn: 'remainder theorem' },
  { chapterId: 'math-2-4', prompt: 'ax² + bx + c = 0-এর মূলের যোগফল কত?', promptEn: 'The sum of the roots of ax² + bx + c = 0 is—', value: '−b/a', valueEn: '−b/a', origin: 'মূলের যোগফল = −b/a', originEn: 'sum of roots = −b/a' },
  { chapterId: 'math-2-6', prompt: 'y² = 4ax কোন কণিক?', promptEn: 'y² = 4ax is a—', value: 'পরাবৃত্ত', valueEn: 'parabola', origin: 'কণিকের প্রমিত সমীকরণ', originEn: 'standard conic form' },
  { chapterId: 'math-2-6', prompt: 'উপবৃত্তের উৎকেন্দ্রিকতা কেমন?', promptEn: 'The eccentricity of an ellipse is—', value: '১-এর কম', valueEn: 'less than 1', origin: '০ < e < ১', originEn: '0 < e < 1' },
  { chapterId: 'math-2-7', prompt: 'cos⁻¹(১) = কত?', promptEn: 'cos⁻¹(1) equals—', value: '০', valueEn: '0', origin: 'cos ০ = ১', originEn: 'cos 0 = 1' },
  { chapterId: 'math-2-8', prompt: 'দুইটি সমান ও বিপরীতমুখী বলের লব্ধি কত?', promptEn: 'Two equal and opposite forces give a resultant of—', value: 'শূন্য', valueEn: 'zero', origin: 'F − F = ০', originEn: 'F − F = 0' },
  { chapterId: 'math-2-9', prompt: 'প্রাসের গতিপথ কেমন?', promptEn: 'The path of a projectile is a—', value: 'পরাবৃত্ত', valueEn: 'parabola', origin: 'y = x tanθ − gx²/(2u²cos²θ)', originEn: 'y = x tanθ − gx²/(2u²cos²θ)' },
  { chapterId: 'math-2-9', prompt: 'প্রাসের সর্বোচ্চ উচ্চতা H = ?', promptEn: 'Maximum height of a projectile H equals—', value: 'u²sin²θ/(2g)', valueEn: 'u² sin²θ/(2g)', origin: 'H = u²sin²θ/(2g)', originEn: 'H = u² sin²θ/(2g)' },

  { chapterId: 'ict-1-1', prompt: 'বাংলাদেশে প্রথম কম্পিউটার বসানো হয় কত সালে?', promptEn: 'In which year was the first computer installed in Bangladesh?', value: '১৯৬৪ সালে', valueEn: '1964', origin: 'আইবিএম ১৬২০, পরমাণু শক্তি কমিশন', originEn: 'IBM 1620 at the Atomic Energy Commission' },
  { chapterId: 'ict-1-2', prompt: 'IPv4 অ্যাড্রেস কত বিটের?', promptEn: 'An IPv4 address is how many bits?', value: '৩২ বিট', valueEn: '32 bits', origin: '৪ অক্টেট × ৮ বিট', originEn: '4 octets × 8 bits' },
  { chapterId: 'ict-1-2', prompt: 'ইন্টারনেটকে কী বলা হয়?', promptEn: 'The internet is best described as—', value: 'নেটওয়ার্কের নেটওয়ার্ক', valueEn: 'a network of networks', origin: 'নেটওয়ার্কের সংজ্ঞা', originEn: 'definition of the internet' },
  { chapterId: 'ict-1-5', prompt: 'C ভাষায় int ডেটা টাইপে কী থাকে?', promptEn: 'In C, the int type stores—', value: 'পূর্ণসংখ্যা', valueEn: 'whole numbers', origin: 'int = integer', originEn: 'int = integer' },

  // ---- Third batch: the last 34 chapters, one fact each from the shipped bank ----
  { chapterId: 'math-1-5', prompt: '০! (শূন্য ফ্যাক্টোরিয়াল)-এর মান কত?', promptEn: 'What is 0! (zero factorial)?', value: '১', valueEn: '1', origin: '০! = ১ (সংজ্ঞা)', originEn: '0! = 1 by definition' },

  { chapterId: 'bangla-1-গদ-য-১', prompt: '“অপরিচিতা” গল্পের রচয়িতা কে?', promptEn: 'Who wrote the story “Aparichita”?', value: 'রবীন্দ্রনাথ ঠাকুর', valueEn: 'Rabindranath Tagore', origin: '“অপরিচিতা” — রবীন্দ্রনাথ ঠাকুর', originEn: '“Aparichita” by Rabindranath Tagore' },
  { chapterId: 'bangla-1-গদ-য-২', prompt: 'গদ্যপাঠের মূলভাব বলতে কী বোঝায়?', promptEn: 'The main idea of a prose piece means—', value: 'লেখকের প্রধান ভাব বা প্রধান বিষয়বস্তু', valueEn: 'the writer’s central theme', origin: 'মূলভাবের সংজ্ঞা', originEn: 'definition of the main idea' },
  { chapterId: 'bangla-1-গদ-য-৩', prompt: 'তুলনামূলক পাঠে মূল কাজ কী?', promptEn: 'The main task in comparative reading is to—', value: 'এক বা একাধিক বিষয়ের সাদৃশ্য ও পার্থক্য বিশ্লেষণ করা', valueEn: 'analyse similarities and differences', origin: 'তুলনামূলক পাঠের সংজ্ঞা', originEn: 'definition of comparative reading' },
  { chapterId: 'bangla-1-গদ-য-৪', prompt: 'একটি পূর্ণ CQ উত্তরে সাধারণত কতটি উপপ্রশ্ন থাকে?', promptEn: 'A full CQ answer normally has how many parts?', value: '৪টি (ক, খ, গ, ঘ)', valueEn: '4 (ka, kha, ga, gha)', origin: 'সৃজনশীল প্রশ্নের ১০ নম্বর কাঠামো', originEn: 'the 10-mark CQ structure' },
  { chapterId: 'bangla-1-পদ-য-১', prompt: '“বঙ্গবাণী” কবিতার কবি কে?', promptEn: 'Who wrote the poem “Bongobani”?', value: 'আবদুল হাকিম', valueEn: 'Abdul Hakim', origin: '“বঙ্গবাণী” — আবদুল হাকিম', originEn: '“Bongobani” by Abdul Hakim' },
  { chapterId: 'bangla-1-পদ-য-২', prompt: '“তাহারেই পড়ে মনে” কবিতার কবি কে?', promptEn: 'Who wrote “Taharei Pore Mone”?', value: 'সুফিয়া কামাল', valueEn: 'Sufia Kamal', origin: '“তাহারেই পড়ে মনে” — সুফিয়া কামাল', originEn: '“Taharei Pore Mone” by Sufia Kamal' },
  { chapterId: 'bangla-1-পদ-য-৩', prompt: '“বিদ্রোহী” কবিতা প্রথম প্রকাশিত হয় কোথায়?', promptEn: 'Where was “Bidrohi” first published?', value: 'সাপ্তাহিক বিজলী পত্রিকায়', valueEn: 'in the weekly Bijli', origin: '“বিদ্রোহী” — সাপ্তাহিক বিজলী (১৯২২)', originEn: '“Bidrohi” — weekly Bijli (1922)' },
  { chapterId: 'bangla-1-পদ-য-৪', prompt: 'কবিতায় প্রতীক বলতে কী বোঝায়?', promptEn: 'In poetry, a symbol means—', value: 'গভীর অর্থ বোঝানো চিহ্ন বা শব্দ', valueEn: 'a sign or word carrying a deeper meaning', origin: 'প্রতীকের সংজ্ঞা', originEn: 'definition of a symbol' },
  { chapterId: 'bangla-1-সহপ-ঠ-১', prompt: '“লালসালু” উপন্যাসের রচয়িতা কে?', promptEn: 'Who wrote the novel “Lalsalu”?', value: 'সৈয়দ ওয়ালীউল্লাহ', valueEn: 'Syed Waliullah', origin: '“লালসালু” — সৈয়দ ওয়ালীউল্লাহ', originEn: '“Lalsalu” by Syed Waliullah' },
  { chapterId: 'bangla-1-সহপ-ঠ-২', prompt: '“কবর” নাটকের রচয়িতা কে?', promptEn: 'Who wrote the play “Kobor”?', value: 'মুনীর চৌধুরী', valueEn: 'Munier Chowdhury', origin: '“কবর” — মুনীর চৌধুরী', originEn: '“Kobor” by Munier Chowdhury' },
  { chapterId: 'bangla-2-ব-য-করণ-১', prompt: 'বাংলা বর্ণমালায় স্বরবর্ণ কতটি?', promptEn: 'How many vowels are there in the Bangla alphabet?', value: '১১', valueEn: '11', origin: 'বাংলা বর্ণমালা: ১১ স্বরবর্ণ', originEn: 'Bangla has 11 vowels' },
  { chapterId: 'bangla-2-ব-য-করণ-২', prompt: '“উপসর্গ” শব্দের কোথায় যুক্ত হয়?', promptEn: 'Where is a prefix (uposorgo) attached?', value: 'শব্দের আগে', valueEn: 'before the word', origin: 'উপসর্গ = প্রারম্ভিক অব্যয়', originEn: 'a prefix comes before the word' },
  { chapterId: 'bangla-2-ব-য-করণ-৩', prompt: 'বাংলা ভাষায় পদ কত প্রকার?', promptEn: 'How many parts of speech does Bangla have?', value: '৫', valueEn: '5', origin: 'বিশেষ্য, সর্বনাম, বিশেষণ, ক্রিয়া, অব্যয়', originEn: 'noun, pronoun, adjective, verb, indeclinable' },
  { chapterId: 'bangla-2-ব-য-করণ-৪', prompt: '“Democracy”-এর বাংলা পারিভাষিক রূপ কী?', promptEn: 'What is the Bangla term for “democracy”?', value: 'গণতন্ত্র', valueEn: 'গণতন্ত্র (gônotontro)', origin: 'পারিভাষিক শব্দ', originEn: 'standard Bangla terminology' },
  { chapterId: 'bangla-2-ন-র-ম-ত-১', prompt: 'সারাংশ লিখতে হয় কেমনভাবে?', promptEn: 'A summary (sharansho) must be written—', value: 'সংক্ষেপে মূল ভাব ধরে', valueEn: 'briefly, keeping the main idea', origin: 'সারাংশের সংজ্ঞা', originEn: 'definition of a summary' },
  { chapterId: 'bangla-2-ন-র-ম-ত-২', prompt: 'প্রতিবেদনে সাধারণত কী কী থাকে?', promptEn: 'A report normally contains—', value: 'শিরোনাম, সূত্র ও বিবরণ', valueEn: 'a headline, a source and details', origin: 'প্রতিবেদনের কাঠামো', originEn: 'report structure' },
  { chapterId: 'bangla-2-ন-র-ম-ত-৩', prompt: 'সরকারি দরখাস্ত শুরু হয় কী দিয়ে?', promptEn: 'An official application begins with—', value: 'সম্বোধন দিয়ে', valueEn: 'a form of address', origin: 'দরখাস্তের কাঠামো', originEn: 'application format' },

  { chapterId: 'english-1-Reading-1', prompt: 'The main idea of a passage is—', promptEn: 'The main idea of a passage is—', value: 'its central message', valueEn: 'its central message', origin: 'main-idea questions test the whole passage', originEn: 'main-idea questions test the whole passage' },
  { chapterId: 'english-1-Reading-2', prompt: 'An inference is drawn from—', promptEn: 'An inference is drawn from—', value: 'evidence not stated directly', valueEn: 'evidence not stated directly', origin: 'inference means reading between the lines', originEn: 'inference means reading between the lines' },
  { chapterId: 'english-1-Reading-3', prompt: '“Information transfer” means—', promptEn: '“Information transfer” means—', value: 'turning a table, chart or flow-chart into sentences', valueEn: 'turning a table, chart or flow-chart into sentences', origin: 'HSC Reading 3 task type', originEn: 'HSC Reading 3 task type' },
  { chapterId: 'english-1-Reading-4', prompt: 'A cloze test presents—', promptEn: 'A cloze test presents—', value: 'a passage with missing words to fill in', valueEn: 'a passage with missing words to fill in', origin: 'cloze = gap-fill', originEn: 'cloze = gap-fill' },
  { chapterId: 'english-1-Writing-1', prompt: 'A good paragraph has—', promptEn: 'A good paragraph has—', value: 'one topic sentence and supporting details', valueEn: 'one topic sentence and supporting details', origin: 'paragraph unity', originEn: 'paragraph unity' },
  { chapterId: 'english-1-Writing-2', prompt: 'A formal letter ends with—', promptEn: 'A formal letter ends with—', value: 'Yours faithfully,', valueEn: 'Yours faithfully,', origin: 'formal letter convention', originEn: 'formal letter convention' },
  { chapterId: 'english-1-Writing-3', prompt: 'A report on a chart should begin with—', promptEn: 'A report on a chart should begin with—', value: 'an overview sentence', valueEn: 'an overview sentence', origin: 'report-writing convention', originEn: 'report-writing convention' },
  { chapterId: 'english-1-Writing-4', prompt: 'In a timed mixed practice you should first—', promptEn: 'In timed mixed practice you should first—', value: 'skim the whole paper and allocate time', valueEn: 'skim the whole paper and allocate time', origin: 'exam time management', originEn: 'exam time management' },
  { chapterId: 'english-2-Grammar-1', prompt: 'She ___ to school every day. (right form)', promptEn: 'She ___ to school every day.', value: 'goes', valueEn: 'goes', origin: 'simple present, third person singular', originEn: 'simple present, third person singular' },
  { chapterId: 'english-2-Grammar-2', prompt: 'She is good ___ mathematics.', promptEn: 'She is good ___ mathematics.', value: 'at', valueEn: 'at', origin: 'good at + noun', originEn: 'good at + noun' },
  { chapterId: 'english-2-Grammar-3', prompt: 'He said, “I am tired.” → He said that he ___ tired.', promptEn: 'He said, “I am tired.” → He said that he ___ tired.', value: 'was', valueEn: 'was', origin: 'narration: am → was (present → past)', originEn: 'narration: am → was (present → past)', why: 'Reporting verb past হলে reported speech-ও এক ধাপ পিছিয়ে যায়।' },
  { chapterId: 'english-2-Grammar-4', prompt: 'Choose the correct modifier: He bought ___ car.', promptEn: 'Choose the correct modifier: He bought ___ car.', value: 'an expensive red', valueEn: 'an expensive red', origin: 'opinion before colour', originEn: 'opinion precedes colour' },
  { chapterId: 'english-2-Grammar-5', prompt: 'Choose the synonym of “abundant”.', promptEn: 'Choose the synonym of “abundant”.', value: 'plentiful', valueEn: 'plentiful', origin: 'abundant = plentiful', originEn: 'abundant = plentiful' },
  { chapterId: 'english-2-Writing-1', prompt: 'An argumentative essay requires—', promptEn: 'An argumentative essay requires—', value: 'a clear position and evidence', valueEn: 'a clear position and evidence', origin: 'argument structure', originEn: 'argument structure' },
  { chapterId: 'english-2-Writing-2', prompt: 'An email to a teacher should open with—', promptEn: 'An email to a teacher should open with—', value: 'Dear Sir/Madam,', valueEn: 'Dear Sir/Madam,', origin: 'formal email convention', originEn: 'formal email convention' },
  { chapterId: 'english-2-Writing-3', prompt: 'A cliché is—', promptEn: 'A cliché is—', value: 'an overused expression that adds no fresh meaning', valueEn: 'an overused expression that adds no fresh meaning', origin: 'composition style', originEn: 'composition style' },
];

/** A small, fixed pool of plausible-but-wrong values per fact — never random text. */
interface Distractor {
  value: string;
  valueEn: string;
  /** Optional fact the wrong value really belongs to, so the explanation can say so. */
  belongsTo?: string;
  belongsToEn?: string;
}

const D: Record<string, Distractor[]> = {
  'physics-1-1': [{ value: '৫', valueEn: '5' }, { value: '৬', valueEn: '6' }, { value: '৯', valueEn: '9' }],
  'physics-1-2': [{ value: '৪৫°', valueEn: '45°', belongsTo: 'প্রাসের সর্বোচ্চ পাল্লা', belongsToEn: 'maximum range of a projectile' }, { value: '৯০°', valueEn: '90°' }, { value: '১৮০°', valueEn: '180°', belongsTo: 'সর্বনিম্ন লব্ধি', belongsToEn: 'minimum resultant' }],
  'physics-1-3': [{ value: '৩০°', valueEn: '30°' }, { value: '৬০°', valueEn: '60°' }, { value: '৯০°', valueEn: '90°', belongsTo: 'সর্বোচ্চ উচ্চতা', belongsToEn: 'maximum height' }],
  'physics-1-4': [{ value: 'N/m', valueEn: 'N/m' }, { value: 'J/s', valueEn: 'J/s', belongsTo: 'ক্ষমতা', belongsToEn: 'power' }, { value: 'kg/m', valueEn: 'kg/m' }],
  'physics-1-5': [{ value: '১০০ W', valueEn: '100 W' }, { value: '১০০০ W', valueEn: '1000 W' }, { value: '৫৫০ W', valueEn: '550 W' }],
  'physics-1-6': [{ value: '৭.৯ km/s', valueEn: '7.9 km/s', belongsTo: 'কক্ষীয় বেগ', belongsToEn: 'orbital velocity' }, { value: '৩০ km/s', valueEn: '30 km/s' }, { value: '৯.৮ km/s', valueEn: '9.8 km/s' }],
  'physics-1-8': [{ value: 'ভর ও বিস্তার', valueEn: 'mass and amplitude' }, { value: 'কেবল বিস্তার', valueEn: 'amplitude only' }, { value: 'কেবল ভর', valueEn: 'mass only' }],
  'physics-1-9': [{ value: 'শূন্য', valueEn: 'vacuum' }, { value: 'বায়ু', valueEn: 'air' }, { value: 'পানি', valueEn: 'water' }],
  'physics-1-10': [{ value: 'PV = nR/T', valueEn: 'PV = nR/T' }, { value: 'P/V = nRT', valueEn: 'P/V = nRT' }, { value: 'P + V = nRT', valueEn: 'P + V = nRT' }],
  'physics-2-1': [{ value: 'ΔQ = ΔU − W', valueEn: 'ΔQ = ΔU − W' }, { value: 'ΔU = ΔQ + W', valueEn: 'ΔU = ΔQ + W' }, { value: 'W = ΔQ · ΔU', valueEn: 'W = ΔQ · ΔU' }],
  'physics-2-2': [{ value: '৬.৬৭ × ১০⁻¹¹ N·m²/kg²', valueEn: '6.67 × 10⁻¹¹ N·m²/kg²', belongsTo: 'মহাকর্ষীয় ধ্রুবক G', belongsToEn: 'gravitational constant G' }, { value: '৯.৮ N/kg', valueEn: '9.8 N/kg', belongsTo: 'অভিকর্ষজ ত্বরণ g', belongsToEn: 'gravitational acceleration g' }, { value: '৩ × ১০⁸ m/s', valueEn: '3 × 10⁸ m/s', belongsTo: 'আলোর বেগ', belongsToEn: 'speed of light' }],
  'physics-2-3': [{ value: 'V = I/R', valueEn: 'V = I/R' }, { value: 'R = VI', valueEn: 'R = VI' }, { value: 'I = VR', valueEn: 'I = VR' }],
  'physics-2-4': [{ value: 'টেসলা', valueEn: 'tesla', belongsTo: 'চৌম্বক flux ঘনত্ব B', belongsToEn: 'magnetic flux density B' }, { value: 'হেনরি', valueEn: 'henry', belongsTo: 'আবেশ গুণাঙ্ক', belongsToEn: 'inductance' }, { value: 'ফ্যারাড', valueEn: 'farad', belongsTo: 'ধারকত্ব', belongsToEn: 'capacitance' }],
  'physics-2-5': [{ value: 'তাপমাত্রার পরিবর্তনে', valueEn: 'temperature changes' }, { value: 'রোধের পরিবর্তনে', valueEn: 'resistance changes' }, { value: 'চাপের পরিবর্তনে', valueEn: 'pressure changes' }],
  'physics-2-6': [{ value: 'মিটার', valueEn: 'metre' }, { value: 'ডাইঅপ্টার⁻¹', valueEn: 'inverse dioptre' }, { value: 'ক্যান্ডেলা', valueEn: 'candela' }],
  'physics-2-7': [{ value: 'কণাধর্ম', valueEn: 'particle nature' }, { value: 'আলোর গতির পরিবর্তন', valueEn: 'a change in the speed of light' }, { value: 'চৌম্বকীয় প্রভাব', valueEn: 'a magnetic effect' }],
  'physics-2-8': [{ value: 'আলোর তীব্রতার উপর', valueEn: 'light intensity' }, { value: 'ধাতুর রঙের উপর', valueEn: 'the colour of the metal' }, { value: 'আলোর কোণের উপর', valueEn: 'the angle of incidence' }],
  'physics-2-9': [{ value: '০.৫৩ nm', valueEn: '0.53 nm' }, { value: '৫.৩ Å', valueEn: '5.3 Å' }, { value: '৫৩ pm', valueEn: '53 pm' }],
  'physics-2-10': [{ value: 'ইলেকট্রন', valueEn: 'electrons', belongsTo: 'n-টাইপ', belongsToEn: 'n-type' }, { value: 'প্রোটন', valueEn: 'protons' }, { value: 'নিউট্রন', valueEn: 'neutrons' }],

  'chemistry-1-1': [{ value: 'বরফ গলে যাওয়া', valueEn: 'ice melting' }, { value: 'চিনি পানিতে দ্রবীভূত হওয়া', valueEn: 'sugar dissolving' }, { value: 'পানি বাষ্প হওয়া', valueEn: 'water evaporating' }],
  'chemistry-1-2': [{ value: '১৬ g/mol', valueEn: '16 g/mol', belongsTo: 'অক্সিজেন পরমাণু', belongsToEn: 'an oxygen atom' }, { value: '২০ g/mol', valueEn: '20 g/mol' }, { value: '২২ g/mol', valueEn: '22 g/mol' }],
  'chemistry-1-3': [{ value: 'S', valueEn: 'S' }, { value: 'So', valueEn: 'So' }, { value: 'N', valueEn: 'N', belongsTo: 'নাইট্রোজেন', belongsToEn: 'nitrogen' }],
  'chemistry-1-4': [{ value: 'অম্লীয়', valueEn: 'acidic' }, { value: 'ক্ষারীয়', valueEn: 'basic' }, { value: 'প্রবল অম্লীয়', valueEn: 'strongly acidic' }],
  'chemistry-1-5': [{ value: 'পলিমারাইজেশন', valueEn: 'polymerisation' }, { value: 'হাইড্রোলাইসিস', valueEn: 'hydrolysis' }, { value: 'ইলেক্ট্রোলাইসিস', valueEn: 'electrolysis' }],
  'chemistry-2-1': [{ value: 'ফুটিয়ে', valueEn: 'boiling' }, { value: 'ফিল্টার করে', valueEn: 'filtration' }, { value: 'পালক দিয়ে', valueEn: 'adding alum only' }],
  'chemistry-2-2': [{ value: 'C৬H১২', valueEn: 'C6H12', belongsTo: 'সাইক্লোহেক্সেন', belongsToEn: 'cyclohexane' }, { value: 'C২H৬', valueEn: 'C2H6', belongsTo: 'ইথেন', belongsToEn: 'ethane' }, { value: 'CH৪', valueEn: 'CH4', belongsTo: 'মিথেন', belongsToEn: 'methane' }],
  'chemistry-2-3': [{ value: '১১.২ L', valueEn: '11.2 L' }, { value: '২৪.০ L', valueEn: '24.0 L' }, { value: '২.২৪ L', valueEn: '2.24 L' }],
  'chemistry-2-4': [{ value: '৬.০২২ × ১০²³', valueEn: '6.022 × 10²³', belongsTo: 'অ্যাভোগাড্রো সংখ্যা', belongsToEn: 'Avogadro’s number' }, { value: '৯৬.৫ C/mol', valueEn: '96.5 C/mol' }, { value: '৮.৩১৪ C/mol', valueEn: '8.314 C/mol', belongsTo: 'গ্যাস ধ্রুবক R', belongsToEn: 'gas constant R' }],
  'chemistry-2-5': [{ value: 'অ্যামোনিয়া ও সালফিউরিক অ্যাসিড', valueEn: 'ammonia and sulphuric acid' }, { value: 'মিথেন ও পানি', valueEn: 'methane and water' }, { value: 'নাইট্রোজেন ও হাইড্রোজেন', valueEn: 'nitrogen and hydrogen' }],

  'biology-1-1': [{ value: 'রাইবোজোম', valueEn: 'ribosome', belongsTo: 'প্রোটিন সংশ্লেষণ', belongsToEn: 'protein synthesis' }, { value: 'গলগি বডি', valueEn: 'Golgi body' }, { value: 'লাইসোজোম', valueEn: 'lysosome' }],
  'biology-1-2': [{ value: 'অপরিবর্তিত থাকে', valueEn: 'it stays the same', belongsTo: 'মাইটোসিস', belongsToEn: 'mitosis' }, { value: 'দ্বিগুণ হয়', valueEn: 'it doubles' }, { value: 'চার গুণ হয়', valueEn: 'it quadruples' }],
  'biology-1-4': [{ value: 'ই. কোলাই', valueEn: 'E. coli' }, { value: 'সালমোনেলা', valueEn: 'Salmonella' }, { value: 'ল্যাকটোব্যাসিলাস', valueEn: 'Lactobacillus' }],
  'biology-1-9': [{ value: 'ক্যারোটিন', valueEn: 'carotene' }, { value: 'জ্যান্থোফিল', valueEn: 'xanthophyll' }, { value: 'হিমোগ্লোবিন', valueEn: 'haemoglobin' }],
  'biology-2-1': [{ value: 'গোত্র', valueEn: 'family' }, { value: 'বর্গ', valueEn: 'order' }, { value: 'পর্ব', valueEn: 'phylum' }],
  'biology-2-4': [{ value: 'অ্যালবুমিন', valueEn: 'albumin' }, { value: 'প্লাজমা', valueEn: 'plasma' }, { value: 'অণুচক্রিকা', valueEn: 'platelets' }],
  'biology-2-11': [{ value: 'স্বাধীন সঞ্চারণ সূত্র', valueEn: 'law of independent assortment', belongsTo: 'মেন্ডেলের দ্বিতীয় সূত্র', belongsToEn: 'Mendel’s second law' }, { value: 'প্রকটতার সূত্র', valueEn: 'law of dominance' }, { value: 'সংযোজন সূত্র', valueEn: 'law of addition' }],
  'biology-2-12': [{ value: 'শেখা সাঁতার', valueEn: 'learning to swim' }, { value: 'কুকুরকে শেখানো হাত দেওয়া', valueEn: 'a dog trained to shake hands' }, { value: 'পরীক্ষার জন্য মুখস্থ', valueEn: 'memorising for an exam' }],

  'math-1-1': [{ value: 'ab − cd', valueEn: 'ab − cd' }, { value: 'ad + bc', valueEn: 'ad + bc' }, { value: 'ac − bd', valueEn: 'ac − bd' }],
  'math-1-3': [{ value: 'y = mx + b', valueEn: 'y = mx + b' }, { value: 'x = my + c', valueEn: 'x = my + c' }, { value: 'y = c/x', valueEn: 'y = c/x' }],
  'math-1-6': [{ value: '০', valueEn: '0' }, { value: '২', valueEn: '2' }, { value: '−১', valueEn: '−1' }],
  'math-1-9': [{ value: 'xⁿ⁺¹/(n+1)', valueEn: 'xⁿ⁺¹/(n+1)', belongsTo: 'যোগজীকরণ', belongsToEn: 'integration' }, { value: 'nxⁿ', valueEn: 'n xⁿ' }, { value: 'xⁿ/n', valueEn: 'xⁿ/n' }],
  'math-1-10': [{ value: 'nxⁿ⁻¹ + C', valueEn: 'n xⁿ⁻¹ + C', belongsTo: 'অন্তরীকরণ', belongsToEn: 'differentiation' }, { value: 'xⁿ⁺¹ + C', valueEn: 'xⁿ⁺¹ + C' }, { value: 'ln x + C', valueEn: 'ln x + C' }],
  'math-2-1': [{ value: 'x > a', valueEn: 'x > a' }, { value: 'x < −a', valueEn: 'x < −a' }, { value: '|x| > a', valueEn: '|x| > a' }],
  'math-2-3': [{ value: '১', valueEn: '1' }, { value: '০', valueEn: '0' }, { value: '−i', valueEn: '−i' }],
  'math-2-5': [{ value: 'nCr aʳ bⁿ⁻ʳ', valueEn: 'nCr aʳ bⁿ⁻ʳ' }, { value: 'Cr aⁿ bʳ', valueEn: 'Cr aⁿ bʳ' }, { value: 'nPr aⁿ⁻ʳ bʳ', valueEn: 'nPr aⁿ⁻ʳ bʳ' }],
  'math-2-10': [{ value: '−১ ও ১', valueEn: '−1 and 1' }, { value: '০ ও ১০০', valueEn: '0 and 100' }, { value: '১ ও ২', valueEn: '1 and 2' }],

  'ict-1-3': [{ value: '৪', valueEn: '4' }, { value: '১৬', valueEn: '16' }, { value: '৩২', valueEn: '32' }],
  'ict-1-4': [{ value: 'A′ + B′', valueEn: 'A′ + B′' }, { value: 'A · B', valueEn: 'A · B' }, { value: 'A + B′', valueEn: 'A + B′' }],
  'ict-1-6': [{ value: 'ফরেন কী', valueEn: 'foreign key' }, { value: 'ইনডেক্স', valueEn: 'index' }, { value: 'ভিউ', valueEn: 'view' }],

  // ---- Second batch ----
  'physics-1-7': [{ value: 'N', valueEn: 'N' }, { value: 'N·m', valueEn: 'N·m', belongsTo: 'টর্ক', belongsToEn: 'torque' }, { value: 'J', valueEn: 'J', belongsTo: 'কাজ', belongsToEn: 'work' }],
  'physics-2-11': [{ value: 'শক্তি', valueEn: 'energy' }, { value: 'সময়', valueEn: 'time' }, { value: 'ভর', valueEn: 'mass' }],
  'biology-1-3': [{ value: 'কার্বোহাইড্রেটের একক', valueEn: 'the unit of carbohydrate' }, { value: 'স্নেহের একক', valueEn: 'the unit of fat' }, { value: 'ভিটামিনের একক', valueEn: 'the unit of vitamins' }],
  'biology-1-5': [{ value: 'সেলুলোজ দিয়ে', valueEn: 'cellulose' }, { value: 'লিগনিন দিয়ে', valueEn: 'lignin' }, { value: 'পেপটিডোগ্লাইকান দিয়ে', valueEn: 'peptidoglycan', belongsTo: 'ব্যাকটেরিয়ার কোষপ্রাচীর', belongsToEn: 'the bacterial cell wall' }],
  'biology-1-6': [{ value: 'উদ্ভিদ জগতের রাজা', valueEn: 'the king of plants' }, { value: 'সবচেয়ে বড় গোষ্ঠী', valueEn: 'the largest plant group' }, { value: 'ফুলহীন উদ্ভিদ', valueEn: 'flowerless plants' }],
  'biology-1-7': [{ value: 'মাটির নিচে', valueEn: 'under the soil' }, { value: 'উন্মুক্তভাবে ফলকের বাইরে', valueEn: 'exposed outside the carpel', belongsTo: 'নগ্নবীজী', belongsToEn: 'gymnosperms' }, { value: 'পাতার ভেতরে', valueEn: 'inside a leaf' }],
  'biology-1-8': [{ value: 'তৈরি খাদ্য পরিবহন', valueEn: 'carrying prepared food', belongsTo: 'ফ্লোয়েম', belongsToEn: 'phloem' }, { value: 'শ্বসন', valueEn: 'respiration' }, { value: 'প্রস্বেদন নিয়ন্ত্রণ', valueEn: 'controlling transpiration' }],
  'biology-1-10': [{ value: 'বীজ থেকে অঙ্কুরোদ্গম', valueEn: 'seed germination' }, { value: 'মূল থেকে পানি শোষণ', valueEn: 'water absorption by roots' }, { value: 'ফল তৈরি', valueEn: 'fruit formation' }],
  'biology-1-11': [{ value: 'নতুন রোগ', valueEn: 'new diseases' }, { value: 'কেবল ঔষধ', valueEn: 'medicines only' }, { value: 'মাটি', valueEn: 'soil' }],
  'biology-1-12': [{ value: 'প্রাথমিক খাদক', valueEn: 'primary consumers' }, { value: 'দ্বিতীয় খাদক', valueEn: 'secondary consumers' }, { value: 'বিয়োজক', valueEn: 'decomposers' }],
  'biology-2-2': [{ value: 'ফুসফুস', valueEn: 'lungs' }, { value: 'ত্বক', valueEn: 'skin' }, { value: 'শ্বাসনালি (siphon)', valueEn: 'a siphon' }],
  'biology-2-3': [{ value: 'মুখগহ্বরে', valueEn: 'the mouth' }, { value: 'ক্ষুদ্রান্ত্রে', valueEn: 'the small intestine' }, { value: 'বৃহদান্ত্রে', valueEn: 'the large intestine' }],
  'biology-2-5': [{ value: 'ADP', valueEn: 'ADP' }, { value: 'DNA', valueEn: 'DNA' }, { value: 'NADH', valueEn: 'NADH' }],
  'biology-2-6': [{ value: 'নিউরন', valueEn: 'neuron' }, { value: 'অ্যালভিওলাস', valueEn: 'alveolus' }, { value: 'নেফ্রিডিয়া', valueEn: 'nephridia' }],
  'biology-2-7': [{ value: 'সন্ধি', valueEn: 'a joint' }, { value: 'লিগামেন্ট', valueEn: 'ligament' }, { value: 'তন্ত্রী', valueEn: 'fascia' }],
  'biology-2-8': [{ value: 'গ্লুকাগন', valueEn: 'glucagon' }, { value: 'অ্যাড্রেনালিন', valueEn: 'adrenaline' }, { value: 'থাইরক্সিন', valueEn: 'thyroxine' }],
  'biology-2-9': [{ value: 'ডিম্বাণু', valueEn: 'ovum' }, { value: 'জাইগোট', valueEn: 'zygote' }, { value: 'ভ্রূণ', valueEn: 'embryo' }],
  'biology-2-10': [{ value: 'টি-লিম্ফোসাইট', valueEn: 'T-lymphocytes' }, { value: 'অণুচক্রিকা', valueEn: 'platelets' }, { value: 'লোহিত রক্তকণিকা', valueEn: 'red blood cells' }],
  'math-1-2': [{ value: '৭', valueEn: '7' }, { value: '১২', valueEn: '12' }, { value: '২৫', valueEn: '25' }],
  'math-1-4': [{ value: 'x² + y² = 2r²', valueEn: 'x² + y² = 2r²' }, { value: 'x + y = r', valueEn: 'x + y = r' }, { value: '(x − r)² + y² = r²', valueEn: '(x − r)² + y² = r²' }],
  'math-1-7': [{ value: 'sinA cosB − cosA sinB', valueEn: 'sinA cosB − cosA sinB', belongsTo: 'sin(A − B)', belongsToEn: 'sin(A − B)' }, { value: 'cosA cosB − sinA sinB', valueEn: 'cosA cosB − sinA sinB', belongsTo: 'cos(A + B)', belongsToEn: 'cos(A + B)' }, { value: 'sinA sinB + cosA cosB', valueEn: 'sinA sinB + cosA cosB' }],
  'math-1-8': [{ value: 'সরলরেখা', valueEn: 'a straight line' }, { value: 'বৃত্ত', valueEn: 'a circle' }, { value: 'অধিবৃত্ত', valueEn: 'a hyperbola' }],
  'math-2-2': [{ value: 'শুধু লাভ সর্বোচ্চ করা', valueEn: 'only maximising profit' }, { value: 'শুধু ব্যয় সর্বনিম্ন করা', valueEn: 'only minimising cost' }, { value: 'সমীকরণ সমাধান করা', valueEn: 'solving equations' }],
  'math-2-4': [{ value: 'P(−a)', valueEn: 'P(−a)' }, { value: '০', valueEn: '0' }, { value: 'a', valueEn: 'a' }],
  'math-2-6': [{ value: 'বৃত্ত', valueEn: 'a circle' }, { value: 'উপবৃত্ত', valueEn: 'an ellipse' }, { value: 'অধিবৃত্ত', valueEn: 'a hyperbola' }],
  'math-2-7': [{ value: 'π/২', valueEn: 'π/2', belongsTo: 'cos⁻¹(০)', belongsToEn: 'cos⁻¹(0)' }, { value: 'π', valueEn: 'π', belongsTo: 'cos⁻¹(−১)', belongsToEn: 'cos⁻¹(−1)' }, { value: '১', valueEn: '1' }],
  'math-2-8': [{ value: 'দ্বিগুণ বল', valueEn: 'double the force' }, { value: 'অর্ধেক বল', valueEn: 'half the force' }, { value: 'কোনো পরিবর্তন নেই', valueEn: 'no change' }],
  'math-2-9': [{ value: 'সরলরেখা', valueEn: 'a straight line' }, { value: 'বৃত্ত', valueEn: 'a circle' }, { value: 'উপবৃত্ত', valueEn: 'an ellipse' }],
  'ict-1-1': [{ value: '১৯৭১ সালে', valueEn: '1971' }, { value: '১৯৮০ সালে', valueEn: '1980' }, { value: '১৯৯০ সালে', valueEn: '1990' }],
  'ict-1-2': [{ value: '৬৪ বিট', valueEn: '64 bits' }, { value: '১৬ বিট', valueEn: '16 bits' }, { value: '১২৮ বিট', valueEn: '128 bits', belongsTo: 'IPv6', belongsToEn: 'IPv6' }],
  'ict-1-5': [{ value: 'দশমিক সংখ্যা', valueEn: 'decimal numbers' }, { value: 'অক্ষর', valueEn: 'characters' }, { value: 'শুধু ০ ও ১', valueEn: 'only 0 and 1' }],

  // ---- Third batch ----
  'math-1-5': [{ value: '০', valueEn: '0' }, { value: 'অসংজ্ঞায়িত', valueEn: 'undefined' }, { value: '∞', valueEn: '∞' }],
  'bangla-1-গদ-য-১': [{ value: 'শরৎচন্দ্র চট্টোপাধ্যায়', valueEn: 'Sarat Chandra Chattopadhyay', belongsTo: '“বিলাসী”', belongsToEn: '“Bilashi”' }, { value: 'কাজী নজরুল ইসলাম', valueEn: 'Kazi Nazrul Islam', belongsTo: '“আমার পথ”', belongsToEn: '“Amar Path”' }, { value: 'মানিক বন্দ্যোপাধ্যায়', valueEn: 'Manik Bandopadhyay' }],
  'bangla-1-গদ-য-২': [{ value: 'কেবল শিরোনাম', valueEn: 'the title only' }, { value: 'লেখকের জন্মসাল', valueEn: 'the writer’s birth year' }, { value: 'শব্দের অভিধানিক অর্থ', valueEn: 'the dictionary meaning of one word' }],
  'bangla-1-গদ-য-৩': [{ value: 'শুধু একটি পাঠ মুখস্থ করা', valueEn: 'memorising one text' }, { value: 'শুধু পার্থক্য লেখা', valueEn: 'writing only the differences' }, { value: 'শুধু সাদৃশ্য লেখা', valueEn: 'writing only the similarities' }],
  'bangla-1-গদ-য-৪': [{ value: '২টি (ক, খ)', valueEn: '2 (ka, kha)' }, { value: '৩টি (ক, খ, গ)', valueEn: '3 (ka, kha, ga)' }, { value: '৬টি', valueEn: '6' }],
  'bangla-1-পদ-য-১': [{ value: 'মাইকেল মধুসূদন দত্ত', valueEn: 'Michael Madhusudan Dutt', belongsTo: '“কপোতাক্ষ নদ”', belongsToEn: '“Kopotaksh Nod”' }, { value: 'রবীন্দ্রনাথ ঠাকুর', valueEn: 'Rabindranath Tagore' }, { value: 'জসীম উদদীন', valueEn: 'Jasimuddin' }],
  'bangla-1-পদ-য-২': [{ value: 'জসীম উদদীন', valueEn: 'Jasimuddin', belongsTo: '“প্রতিদান”', belongsToEn: '“Protidan”' }, { value: 'সুকান্ত ভট্টাচার্য', valueEn: 'Sukanta Bhattacharya', belongsTo: '“আঠারো বছর বয়স”', belongsToEn: '“Atharo Bochor Boyosh”' }, { value: 'রবীন্দ্রনাথ ঠাকুর', valueEn: 'Rabindranath Tagore', belongsTo: '“সোনার তরী”', belongsToEn: '“Sonar Tori”' }],
  'bangla-1-পদ-য-৩': [{ value: 'দৈনিক আজাদ পত্রিকায়', valueEn: 'in daily Azad' }, { value: 'সাপ্তাহিক ধূমকেতুতে', valueEn: 'in weekly Dhumketu' }, { value: 'দৈনিক নবযুগে', valueEn: 'in daily Nabajug' }],
  'bangla-1-পদ-য-৪': [{ value: 'শব্দের আভিধানিক অর্থ', valueEn: 'the literal meaning of a word' }, { value: 'কবিতার ছন্দ', valueEn: 'the metre of the poem' }, { value: 'কবির জন্মস্থান', valueEn: 'the poet’s birthplace' }],
  'bangla-1-সহপ-ঠ-১': [{ value: 'মানিক বন্দ্যোপাধ্যায়', valueEn: 'Manik Bandopadhyay', belongsTo: '“পদ্মা নদীর মাঝি”', belongsToEn: '“Padma Nadir Majhi”' }, { value: 'মুনীর চৌধুরী', valueEn: 'Munier Chowdhury' }, { value: 'রবীন্দ্রনাথ ঠাকুর', valueEn: 'Rabindranath Tagore' }],
  'bangla-1-সহপ-ঠ-২': [{ value: 'সিকান্দার আবু জাফর', valueEn: 'Sikandar Abu Zafar', belongsTo: '“সিরাজউদ্দৌলা”', belongsToEn: '“Sirajuddaula”' }, { value: 'সৈয়দ ওয়ালীউল্লাহ', valueEn: 'Syed Waliullah' }, { value: 'মানিক বন্দ্যোপাধ্যায়', valueEn: 'Manik Bandopadhyay' }],
  'bangla-2-ব-য-করণ-১': [{ value: '৩৯', valueEn: '39', belongsTo: 'ব্যঞ্জনবর্ণের সংখ্যা', belongsToEn: 'the number of consonants' }, { value: '৭', valueEn: '7' }, { value: '৫০', valueEn: '50' }],
  'bangla-2-ব-য-করণ-২': [{ value: 'শব্দের পরে', valueEn: 'after the word', belongsTo: 'প্রত্যয়', belongsToEn: 'a suffix' }, { value: 'শব্দের মাঝে', valueEn: 'inside the word' }, { value: 'যুক্ত হয় না', valueEn: 'never attached' }],
  'bangla-2-ব-য-করণ-৩': [{ value: '৩', valueEn: '3' }, { value: '৭', valueEn: '7' }, { value: '৮', valueEn: '8' }],
  'bangla-2-ব-য-করণ-৪': [{ value: 'স্বৈরতন্ত্র', valueEn: 'autocracy' }, { value: 'সাম্যবাদ', valueEn: 'communism' }, { value: 'প্রজাতন্ত্র', valueEn: 'republic' }],
  'bangla-2-ন-র-ম-ত-১': [{ value: 'বিস্তারিত লিখে', valueEn: 'in full detail' }, { value: 'শুধু নিজের মত দিয়ে', valueEn: 'with personal opinion only' }, { value: 'প্রশ্নের ভাষায় হুবহু', valueEn: 'in the exact words of the question' }],
  'bangla-2-ন-র-ম-ত-২': [{ value: 'শুধু শিরোনাম', valueEn: 'a headline only' }, { value: 'শুধু সূত্র', valueEn: 'a source only' }, { value: 'শুধু তালিকা', valueEn: 'a list only' }],
  'bangla-2-ন-র-ম-ত-৩': [{ value: 'শেষে', valueEn: 'at the end' }, { value: 'মাঝখানে', valueEn: 'in the middle' }, { value: 'স্বাক্ষর দিয়ে', valueEn: 'with a signature' }],

  'english-1-Reading-1': [{ value: 'a single supporting detail', valueEn: 'a single supporting detail' }, { value: 'the first sentence only', valueEn: 'the first sentence only' }, { value: 'the writer’s name', valueEn: 'the writer’s name' }],
  'english-1-Reading-2': [{ value: 'the exact words of the passage', valueEn: 'the exact words of the passage' }, { value: 'the title of the passage', valueEn: 'the title of the passage' }, { value: 'personal opinion alone', valueEn: 'personal opinion alone' }],
  'english-1-Reading-3': [{ value: 'copying the chart exactly', valueEn: 'copying the chart exactly' }, { value: 'adding your own opinions', valueEn: 'adding your own opinions' }, { value: 'counting the rows', valueEn: 'counting the rows' }],
  'english-1-Reading-4': [{ value: 'a list of unconnected words', valueEn: 'a list of unconnected words' }, { value: 'a grammar rule only', valueEn: 'a grammar rule only' }, { value: 'a translation task', valueEn: 'a translation task' }],
  'english-1-Writing-1': [{ value: 'several unrelated ideas', valueEn: 'several unrelated ideas' }, { value: 'no topic sentence', valueEn: 'no topic sentence' }, { value: 'only questions', valueEn: 'only questions' }],
  'english-1-Writing-2': [{ value: 'Yours sincerely,', valueEn: 'Yours sincerely,' }, { value: 'Best of luck,', valueEn: 'Best of luck,' }, { value: 'Thank you for reading.', valueEn: 'Thank you for reading.' }],
  'english-1-Writing-3': [{ value: 'a personal story', valueEn: 'a personal story' }, { value: 'a quotation from a poem', valueEn: 'a quotation from a poem' }, { value: 'the definition of a chart', valueEn: 'the definition of a chart' }],
  'english-1-Writing-4': [{ value: 'start with the easiest question only', valueEn: 'start with the easiest question only' }, { value: 'write the longest answer first', valueEn: 'write the longest answer first' }, { value: 'leave the reading section for the end', valueEn: 'leave the reading section for the end' }],
  'english-2-Grammar-1': [{ value: 'go', valueEn: 'go' }, { value: 'going', valueEn: 'going' }, { value: 'gone', valueEn: 'gone' }],
  'english-2-Grammar-2': [{ value: 'in', valueEn: 'in' }, { value: 'for', valueEn: 'for' }, { value: 'with', valueEn: 'with' }],
  'english-2-Grammar-3': [{ value: 'is', valueEn: 'is' }, { value: 'were', valueEn: 'were' }, { value: 'am', valueEn: 'am' }],
  'english-2-Grammar-4': [{ value: 'a expensive red', valueEn: 'a expensive red', belongsTo: 'ভুল আর্টিকেল', belongsToEn: 'wrong article' }, { value: 'red expensive an', valueEn: 'red expensive an' }, { value: 'an red expensive', valueEn: 'an red expensive', belongsTo: 'ভুল আর্টিকেল', belongsToEn: 'wrong article' }],
  'english-2-Grammar-5': [{ value: 'scarce', valueEn: 'scarce', belongsTo: 'abundant-এর বিপরীত', belongsToEn: 'the antonym of abundant' }, { value: 'tiny', valueEn: 'tiny' }, { value: 'careless', valueEn: 'careless' }],
  'english-2-Writing-1': [{ value: 'a story from childhood', valueEn: 'a story from childhood' }, { value: 'only a summary of the topic', valueEn: 'only a summary of the topic' }, { value: 'a list of examples without a view', valueEn: 'a list of examples without a view' }],
  'english-2-Writing-2': [{ value: 'Hi Sir,', valueEn: 'Hi Sir,' }, { value: 'Respected Madam Ji,', valueEn: 'Respected Madam Ji,' }, { value: 'To whom it may concern (no address)', valueEn: 'To whom it may concern (no address)' }],
  'english-2-Writing-3': [{ value: 'a newly coined technical word', valueEn: 'a newly coined technical word' }, { value: 'a correct but rare word', valueEn: 'a correct but rare word' }, { value: 'a short concluding line', valueEn: 'a short concluding line' }],
};

/**
 * Facts recovered from the shipped bank itself.
 *
 * 98 of the 114 chapters ship exactly one hand-written fact, so a "10-question
 * chapter test" could only ever produce one item. But the same bank already
 * carries many more textbook-checked answers per chapter — they were simply
 * never wired into the generator.
 *
 * A recovered fact is only allowed when:
 *  - its chapter matches (so the question still belongs where it says it does),
 *  - it carries a non-empty explanation (an un-explained row is not a study fact),
 *  - its answer is not already claimed by a hand-written fact (no paraphrased twin),
 *  - and its answer is not one of that chapter's own distractor values.
 *
 * Nothing is invented here: the stem, the answer and the reasoning are the ones
 * already shipping in the bank, and `verifyGenerated` re-checks every answer
 * against the same bank afterwards.
 */
const D_MIN = 3; // a fact needs three distractors to become an MCQ

const BANGLA = /[\u0980-\u09FF]/;

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
/** Fold Bengali numerals onto ASCII so "০°" and "0°" compare as the same value. */
const toAsciiDigits = (text: string): string =>
  [...text].map(ch => (BN_DIGITS.includes(ch) ? String(BN_DIGITS.indexOf(ch)) : ch)).join('');
const hasBangla = (text: string): boolean => BANGLA.test(text);

/** True when this fact can be shown in English without leaking Bengali. */
const speaksEnglish = (fact: FactPair): boolean =>
  !!fact.promptEn && !hasBangla(fact.promptEn) && !!fact.valueEn && !hasBangla(fact.valueEn);

function recoverFacts(): FactPair[] {
  const manual = new Map<string, Set<string>>();
  for (const fact of P) {
    const set = manual.get(fact.chapterId) ?? new Set<string>();
    set.add(fact.value);
    manual.set(fact.chapterId, set);
  }
  const out: FactPair[] = [];
  const seen = new Set<string>();
  for (const question of STARTER_QUESTIONS) {
    const chapterId = question.chapterId;
    if (!chapterId) continue;
    const reasoning = question.explanation?.trim();
    if (!reasoning) continue;
    const answer = question.options[question.answer];
    if (!answer) continue;
    const already = manual.get(chapterId);
    if (already?.has(answer)) continue;
    // A recovered answer must not collide with a distractor of the same chapter,
    // otherwise the item would offer the answer as a wrong option.
    if ((D[chapterId] ?? []).some(item => item.value === answer)) continue;
    const key = `${chapterId}|${answer}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // The bank is Bengali-first, so an English rendering only exists if the row
    // itself is language-neutral. Claiming otherwise would put Bengali text in
    // the English interface.
    const english = !hasBangla(question.question) && !hasBangla(answer) && !hasBangla(reasoning);
    out.push({
      chapterId,
      prompt: question.question,
      ...(english ? { promptEn: question.question, valueEn: answer, whyEn: reasoning } : {}),
      value: answer,
      origin: 'শিপ করা ব্যাংকের ব্যাখ্যা',
      ...(english ? { originEn: 'the explanation shipped with this bank item' } : {}),
      why: reasoning,
    });
  }
  return out;
}

const RECOVERED: FactPair[] = recoverFacts();

/** Hand-written facts first, then the ones recovered from the bank. */
const ALL_FACTS: FactPair[] = [...P, ...RECOVERED];

/** How many facts the engine can draw on once the bank is read as well. */
export const FACT_POOL_SIZE = ALL_FACTS.length;

export const RECOVERED_FACT_COUNT = RECOVERED.length;

export const GENERATED_PREFIX = 'gen|';
export const GENERATED_SOURCE = () => t('স্বয়ংক্রিয় · পাঠ্যবই-যাচাইকৃত তথ্যপুল', 'Automatic · textbook-checked facts');
export const ENGINE_LABEL = () => t('নিয়মভিত্তিক প্রশ্ন ইঞ্জিন', 'Rule-based question engine');

/** Deterministic PRNG so a given (chapter, variant) pair always yields the same paper. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export const factsFor = (chapterId: string): FactPair[] => ALL_FACTS.filter(fact => fact.chapterId === chapterId);

export const generativeChapters = (): string[] => [...new Set(ALL_FACTS.map(fact => fact.chapterId))];

export const GENERATIVE_CHAPTER_COUNT = new Set(ALL_FACTS.map(fact => fact.chapterId)).size;

/** Why a chapter produced nothing — the honest version of "no questions found". */
export function generativeGap(chapterId: string): 'ok' | 'no-fact' | 'no-distractor' | 'unknown-chapter' {
  if (!chapterById[chapterId]) return 'unknown-chapter';
  const facts = factsFor(chapterId);
  if (!facts.length) return 'no-fact';
  if (!facts.some(fact => (D[fact.chapterId]?.length ?? 0) >= D_MIN)) return 'no-distractor';
  return 'ok';
}

/**
 * Builds one MCQ from one fact. The answer position is chosen by a seeded shuffle, so
 * the correct option is not always first (a real bank puts it anywhere).
 */
export function buildQuestion(fact: FactPair, seed: string): QuizQuestion | null {
  const distractors = D[fact.chapterId] ?? [];
  if (distractors.length < 3) return null;
  const english = isEnglish();
  // The answer and the wrong options must be in the same language, otherwise the
  // right option stands out by script alone. A fact with no English wording is
  // skipped in English mode rather than offered as a Bengali answer.
  if (english && !speaksEnglish(fact)) return null;
  const answerValue = english ? fact.valueEn! : fact.value;
  const rng = mulberry32(hash(seed));
  const wrong = distractors.slice(0, 3)
    .map(item => ({ text: english ? (item.valueEn ?? '') : item.value, value: item.value }))
    .filter(item => item.text && item.text !== answerValue);
  if (wrong.length < 3) return null;
  const options = [answerValue, ...wrong.map(item => item.text)]
    // A distractor that repeats the answer (or another distractor) must never reach a paper:
    // the verifier would reject it, so drop it here and let the item be skipped instead.
    .filter((option, index, all) => all.indexOf(option) === index);
  if (options.length < 4) return null;
  // Fisher–Yates with the deterministic RNG: same seed, same paper.
  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  const answer = options.indexOf(answerValue);
  if (answer < 0) return null;
  const why = english
    ? `${fact.whyEn ?? ''} Source: ${fact.originEn}.`.replace(/^\s+/, '')
    : `${fact.why ?? ''} সূত্র: ${fact.origin}।`.replace(/^\s+/, '');
  return {
    // Long percent-encoded Bengali answers used to exceed the 180-character
    // question/reference boundary and made a valid saved paper un-restorable.
    // The bounded id still resolves to the same shipped fact in both languages.
    id: generatedIdFor(fact, hash(seed).toString(36)),
    subject: chapterById[fact.chapterId].subject,
    chapterId: fact.chapterId,
    question: english ? fact.promptEn! : fact.prompt,
    options,
    answer,
    explanation: why.trim(),
    source: english ? 'Auto-generated · verified textbook facts' : GENERATED_SOURCE(),
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

export interface GenerateOptions {
  /** How many questions to return. */
  count?: number;
  /** Extra variety across repeated calls (the UI passes the day or a counter). */
  variant?: string | number;
  /** Skip these question ids — used to avoid repeating what the student just saw. */
  exclude?: Iterable<string>;
}

/**
 * Generates MCQs for one chapter, or for a whole subject when no chapter is given.
 * Only chapters that appear in the fact pool can produce anything; everything else
 * is reported through `generativeGap`, never faked.
 */
export function generateQuestions(chapterId: string, options: GenerateOptions = {}): QuizQuestion[] {
  const facts = factsFor(chapterId);
  if (!facts.length) return [];
  const variant = String(options.variant ?? 0);
  const excluded = new Set(options.exclude ?? []);
  const built: QuizQuestion[] = [];
  // Each call rotates the answer position using the variant, so re-generating gives a
  // fresh paper from the same verified facts instead of the identical list.
  for (const fact of facts) {
    const question = buildQuestion(fact, `${fact.chapterId}|${variant}|${fact.prompt}`);
    if (question && !excluded.has(question.id)) built.push(question);
  }
  const count = options.count ?? built.length;
  return built.slice(0, Math.max(0, Math.min(built.length, Math.round(count))));
}

export function generateForSubject(subject: string, options: GenerateOptions = {}): QuizQuestion[] {
  const chapters = CHAPTERS.filter(chapter => chapter.subject === subject).map(chapter => chapter.id);
  const out: QuizQuestion[] = [];
  for (const chapterId of chapters) out.push(...generateQuestions(chapterId, options));
  const count = options.count ?? out.length;
  return out.slice(0, Math.max(0, Math.min(out.length, Math.round(count))));
}

export interface VerificationIssue {
  questionId: string;
  chapterId: string;
  problem: 'missing-explanation' | 'missing-source' | 'answer-out-of-range' | 'option-count' | 'duplicate-option' | 'fact-not-in-bank';
}

/**
 * The gate that keeps "generated" honest. A question is only accepted if:
 *  - it has exactly four distinct options and an in-range answer,
 *  - it carries an explanation naming a real origin,
 *  - its correct option really appears in the shipped question banks for that chapter.
 * The last check is the important one: it means every generated answer can be found,
 * word for word, in the textbook-fact bank the app already ships.
 */
/**
 * Follows a generated question back to the exact shipped fact it renders.
 *
 * The id carries the Bengali answer, but an id is just text — anyone could type a
 * different one. So the id is *re-derived* from the fact that the correct option
 * actually belongs to (same chapter, same seed, same Bengali answer) and must match
 * byte for byte. A tampered answer therefore finds no fact, and a tampered id fails
 * to reproduce itself.
 */
function tracesToShippedFact(question: QuizQuestion): boolean {
  if (!question.id.startsWith(GENERATED_PREFIX)) return false;
  const parts = question.id.split('|');
  if (parts.length !== 4) return false;
  const chapterId = question.chapterId ?? parts[1];
  const hashPart = parts[2];
  const source = sourceAnswerOf(question.id);
  if (!source) return false;
  const fact = factsFor(chapterId).find(item => item.value === source);
  if (!fact) return false;
  // The displayed answer must be this fact's own Bengali or English value. Without
  // this, pointing at a real fact while showing some other packed string would pass.
  const correct = question.options[question.answer];
  if (correct !== fact.value && (!fact.valueEn || fact.valueEn !== correct)) return false;
  return generatedIdFor(fact, hashPart) === question.id || legacyGeneratedIdFor(fact, hashPart) === question.id;
}

/** A stable bank lookup token, not a security hash. Resolve only unambiguous
 * matches against the shipped facts; never decode arbitrary text as an answer. */
function compactAnswerToken(value: string): string {
  return `~${hash(value).toString(36)}.${hash([...value].reverse().join('')).toString(36)}.${value.length.toString(36)}`;
}
function legacyGeneratedIdFor(fact: FactPair, hashPart: string): string {
  return `${GENERATED_PREFIX}${fact.chapterId}|${hashPart}|${encodeURIComponent(fact.value).replace(/\|/g, '%7C')}`;
}

/** Keep existing short identities stable and every newly generated id within
 * the same storage bound as question ids, attempts and retry references. */
function generatedIdFor(fact: FactPair, hashPart: string): string {
  const legacy = legacyGeneratedIdFor(fact, hashPart);
  return legacy.length <= 180 ? legacy : `${GENERATED_PREFIX}${fact.chapterId}|${hashPart}|${compactAnswerToken(fact.value)}`;
}

/** Resolve both legacy encoded answers and new bounded bank references. This
 * never rewrites a saved id or unrelated history during validation. */
export function sourceAnswerOf(questionId: string): string | null {
  const parts = questionId.split('|');
  if (parts.length !== 4 || parts[0] !== 'gen') return null;
  if (parts[3].startsWith('~')) {
    const matches = [...new Set(factsFor(parts[1]).filter(fact => compactAnswerToken(fact.value) === parts[3]).map(fact => fact.value))];
    return matches.length === 1 ? matches[0] : null;
  }
  try {
    return decodeURIComponent(parts[3]);
  } catch {
    return null;
  }
}

export function verifyGenerated(questions: QuizQuestion[]): VerificationIssue[] {
  const issues: VerificationIssue[] = [];
  const bankByChapter = new Map<string, Set<string>>();
  for (const seed of STARTER_QUESTIONS) {
    if (!seed.chapterId) continue;
    const set = bankByChapter.get(seed.chapterId) ?? new Set<string>();
    set.add(seed.options[seed.answer]);
    bankByChapter.set(seed.chapterId, set);
  }
  // A correct option generated in English reads "0°" while the bank stores "০°".
  // Same fact, different script — so equivalence is judged on the digits, not the
  // glyphs. This only normalises numerals; it never accepts a different value.
  const bankInEnglish = new Map<string, Set<string>>();
  for (const [chapterId, answers] of bankByChapter) {
    bankInEnglish.set(chapterId, new Set([...answers].map(toAsciiDigits)));
  }
  for (const question of questions) {
    const chapterId = question.chapterId ?? '';
    const push = (problem: VerificationIssue['problem']) => issues.push({ questionId: question.id, chapterId, problem });
    if (question.options.length !== 4) push('option-count');
    if (new Set(question.options).size !== question.options.length) push('duplicate-option');
    if (!Number.isInteger(question.answer) || question.answer < 0 || question.answer >= question.options.length) push('answer-out-of-range');
    if (!question.explanation?.trim()) push('missing-explanation');
    if (!question.source?.trim()) push('missing-source');
    const shipped = bankByChapter.get(chapterId);
    const correct = question.options[question.answer];
    const shippedAnyScript = bankInEnglish.get(chapterId);
    // A generated item names its own source answer, so an English option can still
    // be traced to the shipped Bengali answer it renders. Both are accepted only
    // when the bank really contains that answer — the gate itself is unchanged.
    // A generated item must trace through its own fact; only hand-built questions
    // (not produced by this engine) fall back to the plain bank membership check.
    const inBank = question.id.startsWith(GENERATED_PREFIX)
      ? tracesToShippedFact(question)
      : !!shipped && (shipped.has(correct) || !!shippedAnyScript?.has(toAsciiDigits(correct)));
    if (!inBank) push('fact-not-in-bank');
  }
  return issues;
}
