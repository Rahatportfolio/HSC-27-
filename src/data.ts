export type SubjectId = 'physics' | 'chemistry' | 'biology' | 'math' | 'bangla' | 'english' | 'ict';
export type Priority = 'A' | 'B' | 'C';
export interface Chapter {
  id: string;
  subject: SubjectId;
  paper: 1 | 2;
  number: string;
  title: string;
  priority: Priority;
  effort: number;
  focus: string;
  note?: string;
}
export interface Subject {
  id: SubjectId;
  name: string;
  short: string;
  english: string;
  color: string;
  tint: string;
  code: string;
  optional?: boolean;
}
export const SUBJECTS: Subject[] = [
  { id: 'physics', name: 'পদার্থবিজ্ঞান', short: 'পদার্থ', english: 'Physics', color: '#5278ad', tint: '#edf2fb', code: '174–175' },
  { id: 'chemistry', name: 'রসায়ন', short: 'রসায়ন', english: 'Chemistry', color: '#b27c42', tint: '#fbf2e5', code: '176–177' },
  { id: 'biology', name: 'জীববিজ্ঞান', short: 'জীববিজ্ঞান', english: 'Biology', color: '#54866a', tint: '#eaf3ec', code: '178–179' },
  { id: 'math', name: 'উচ্চতর গণিত', short: 'উ. গণিত', english: 'Higher Math', color: '#8b75ac', tint: '#f2eef8', code: '265–266', optional: true },
  { id: 'bangla', name: 'বাংলা', short: 'বাংলা', english: 'Bangla', color: '#bc737b', tint: '#faedef', code: '101–102' },
  { id: 'english', name: 'ইংরেজি', short: 'ইংরেজি', english: 'English', color: '#4d8e99', tint: '#eaf4f6', code: '107–108' },
  { id: 'ict', name: 'আইসিটি', short: 'আইসিটি', english: 'ICT', color: '#7d859b', tint: '#eef0f6', code: '275' },
];
export const subjectById = Object.fromEntries(SUBJECTS.map(s => [s.id, s])) as Record<SubjectId, Subject>;
export const CORE: SubjectId[] = ['physics', 'chemistry', 'biology', 'math'];

const chapter = (subject: SubjectId, paper: 1 | 2, number: string, title: string, priority: Priority, effort: number, focus: string, note?: string): Chapter => ({
  id: `${subject}-${paper}-${number.replace(/[^\p{L}\p{N}]+/gu, '-')}`,
  subject, paper, number, title, priority, effort, focus, note,
});

// A is a study-order label, not an official board category or a prediction of exam questions.
// Every textbook chapter is retained. Edition-sensitive language lessons use skill-based units.
export const CHAPTERS: Chapter[] = [
  chapter('physics', 1, '2', 'ভেক্টর', 'A', 3, 'ডট–ক্রস গুণন, লব্ধি ও ভেক্টর সংক্রান্ত সমস্যা'),
  chapter('physics', 1, '3', 'গতিবিদ্যা', 'A', 3, 'প্রাসের গতি, লেখচিত্র ও আপেক্ষিক বেগ'),
  chapter('physics', 1, '4', 'নিউটনিয়ান বলবিদ্যা', 'A', 3, 'মুক্ত বস্তুচিত্র, ঘর্ষণ, ভরবেগ ও বৃত্তাকার গতি'),
  chapter('physics', 1, '5', 'কাজ, শক্তি ও ক্ষমতা', 'A', 2, 'কাজ–শক্তি উপপাদ্য ও শক্তির সংরক্ষণ'),
  chapter('physics', 1, '6', 'মহাকর্ষ ও অভিকর্ষ', 'A', 3, 'g-এর পরিবর্তন, মহাকর্ষীয় ক্ষেত্র ও উপগ্রহ'),
  chapter('physics', 1, '8', 'পর্যাবৃত্ত গতি', 'A', 2, 'সরল ছন্দিত স্পন্দন, দোলক ও শক্তি'),
  chapter('physics', 1, '9', 'তরঙ্গ', 'A', 2, 'তরঙ্গদৈর্ঘ্য, স্থির তরঙ্গ ও অনুনাদ'),
  chapter('physics', 1, '10', 'আদর্শ গ্যাস ও গ্যাসের গতিতত্ত্ব', 'A', 2, 'গ্যাস সূত্র, rms বেগ ও শক্তির সমবিভাজন'),
  chapter('physics', 1, '1', 'ভৌতজগৎ ও পরিমাপ', 'B', 1, 'মাত্রা, একক ও পরিমাপের ত্রুটি'),
  chapter('physics', 1, '7', 'পদার্থের গাঠনিক ধর্ম', 'B', 2, 'স্থিতিস্থাপকতা, পীড়ন–বিকৃতি ও তরলের ধর্ম'),
  chapter('physics', 2, '3', 'চলতড়িৎ', 'A', 3, 'ওহমের সূত্র, কির্শফ ও বর্তনী বিশ্লেষণ'),
  chapter('physics', 2, '2', 'স্থির তড়িৎ', 'A', 3, 'তড়িৎ ক্ষেত্র, বিভব, ধারক ও ধারকত্ব'),
  chapter('physics', 2, '1', 'তাপগতিবিদ্যা', 'A', 3, 'তাপগতীয় প্রক্রিয়া, কার্নো চক্র ও এনট্রপি'),
  chapter('physics', 2, '4', 'তড়িৎ প্রবাহের চৌম্বক ক্রিয়া ও চুম্বকত্ব', 'A', 2, 'চৌম্বক ক্ষেত্র, বল ও টর্ক'),
  chapter('physics', 2, '5', 'তড়িৎচুম্বকীয় আবেশ ও পরিবর্তী প্রবাহ', 'A', 3, 'ফ্যারাডে–লেন্জ, আবেশ ও RMS মান'),
  chapter('physics', 2, '6', 'জ্যামিতিক আলোকবিজ্ঞান', 'A', 2, 'লেন্স, প্রতিসরণ ও আলোকযন্ত্র'),
  chapter('physics', 2, '7', 'ভৌত আলোকবিজ্ঞান', 'A', 2, 'ব্যতিচার, অপবর্তন ও সমবর্তন'),
  chapter('physics', 2, '8', 'আধুনিক পদার্থবিজ্ঞানের সূচনা', 'A', 2, 'আপেক্ষিকতা, ফোটন ও আলোক-তড়িৎ ক্রিয়া'),
  chapter('physics', 2, '9', 'পরমাণুর মডেল ও নিউক্লিয়ার পদার্থবিজ্ঞান', 'A', 2, 'বোর মডেল, অর্ধায়ু ও ভরত্রুটি'),
  chapter('physics', 2, '10', 'সেমিকন্ডাক্টর ও ইলেকট্রনিকস', 'B', 2, 'ডায়োড, ট্রানজিস্টর ও লজিক গেট'),
  chapter('physics', 2, '11', 'জ্যোতির্বিজ্ঞান', 'B', 1, 'মহাবিশ্ব, নক্ষত্র ও দূরত্বের একক'),

  chapter('chemistry', 1, '2', 'গুণগত রসায়ন', 'A', 3, 'মোল, দ্রাব্যতা, টাইট্রেশন ও পরমাণুর গঠন'),
  chapter('chemistry', 1, '3', 'মৌলের পর্যাবৃত্ত ধর্ম ও রাসায়নিক বন্ধন', 'A', 4, 'পর্যায়বৃত্তি, সংকরণ, বন্ধন ও আন্তঃআণবিক বল'),
  chapter('chemistry', 1, '4', 'রাসায়নিক পরিবর্তন', 'A', 4, 'সাম্য, pH, বাফার, বিক্রিয়ার হার ও তাপ'),
  chapter('chemistry', 1, '1', 'রসায়নের ধারণা', 'B', 1, 'নিরাপদ ল্যাব অনুশীলন ও রসায়নের মৌলিক ধারণা'),
  chapter('chemistry', 1, '5', 'কর্মমুখী রসায়ন', 'B', 2, 'সাবান, প্রসাধনী ও ব্যবহারিক রসায়ন'),
  chapter('chemistry', 2, '2', 'জৈব রসায়ন', 'A', 8, 'নামকরণ, সমাণুতা, বিক্রিয়া কৌশল ও রূপান্তর'),
  chapter('chemistry', 2, '3', 'পরিমাণগত রসায়ন', 'A', 3, 'স্টয়কিওমেট্রি, টাইট্রেশন ও জারণ–বিজারণ হিসাব'),
  chapter('chemistry', 2, '4', 'তড়িৎ রসায়ন', 'A', 3, 'কোষ বিভব, তড়িৎ বিশ্লেষণ ও ফ্যারাডের সূত্র'),
  chapter('chemistry', 2, '1', 'পরিবেশ রসায়ন', 'B', 2, 'গ্যাস সূত্র, দূষণ, পানি ও পরিবেশগত ভারসাম্য'),
  chapter('chemistry', 2, '5', 'অর্থনৈতিক রসায়ন', 'B', 2, 'শিল্প উৎপাদন, সার, সিমেন্ট ও কাচ'),

  chapter('biology', 1, '1', 'কোষ ও এর গঠন', 'A', 3, 'কোষাঙ্গের চিত্র, কাজ ও তুলনা'),
  chapter('biology', 1, '2', 'কোষ বিভাজন', 'A', 3, 'মাইটোসিস–মিয়োসিস, ধাপ ও ক্রসিং ওভার'),
  chapter('biology', 1, '3', 'কোষ রসায়ন', 'A', 3, 'DNA–RNA, এনজাইম ও জৈব অণু'),
  chapter('biology', 1, '4', 'অণুজীব', 'A', 2, 'ভাইরাস, ব্যাকটেরিয়া ও ম্যালেরিয়া পরজীবী'),
  chapter('biology', 1, '5', 'শৈবাল ও ছত্রাক', 'A', 2, 'বৈশিষ্ট্য, শ্রেণিবিন্যাস ও অর্থনৈতিক গুরুত্ব'),
  chapter('biology', 1, '6', 'ব্রায়োফাইটা ও টেরিডোফাইটা', 'A', 1, 'জীবনচক্র ও অভিযোজন'),
  chapter('biology', 1, '7', 'নগ্নবীজী ও আবৃতবীজী', 'A', 2, 'বৈশিষ্ট্য, গুরুত্ব ও পার্থক্য'),
  chapter('biology', 1, '8', 'টিস্যু ও টিস্যুতন্ত্র', 'A', 2, 'উদ্ভিদ টিস্যু, মূল–কাণ্ড–পত্রের চিত্র'),
  chapter('biology', 1, '9', 'উদ্ভিদ শারীরতত্ত্ব', 'A', 4, 'পরিবহন, সালোকসংশ্লেষণ ও শ্বসন'),
  chapter('biology', 1, '10', 'উদ্ভিদের প্রজনন', 'A', 2, 'পরাগায়ন, নিষেক ও ফল–বীজ'),
  chapter('biology', 1, '11', 'জীবপ্রযুক্তি', 'A', 3, 'রিকম্বিন্যান্ট DNA, কালচার ও প্রয়োগ'),
  chapter('biology', 1, '12', 'জীবের পরিবেশ, বিস্তার ও সংরক্ষণ', 'B', 2, 'বাস্তুতন্ত্র, খাদ্যজাল ও জীববৈচিত্র্য'),
  chapter('biology', 2, '1', 'প্রাণীর বিভিন্নতা ও শ্রেণিবিন্যাস', 'A', 3, 'পর্বের বৈশিষ্ট্য ও শ্রেণিবিন্যাস'),
  chapter('biology', 2, '2', 'প্রাণীর পরিচিতি', 'A', 3, 'হাইড্রা ও ঘাসফড়িং: চিত্র, গঠন ও কাজ'),
  chapter('biology', 2, '3', 'পরিপাক ও শোষণ', 'A', 2, 'পরিপাকতন্ত্র, এনজাইম ও শোষণ'),
  chapter('biology', 2, '4', 'রক্ত ও সঞ্চালন', 'A', 3, 'হৃদযন্ত্র, রক্তগ্রুপ ও কার্ডিয়াক চক্র'),
  chapter('biology', 2, '5', 'শ্বসন ও শ্বাসক্রিয়া', 'A', 2, 'ফুসফুস, গ্যাস বিনিময় ও শ্বসনের নিয়ন্ত্রণ'),
  chapter('biology', 2, '6', 'বর্জ্য ও নিষ্কাশন', 'A', 2, 'নেফ্রন, মূত্র গঠন ও osmoregulation'),
  chapter('biology', 2, '7', 'চলন ও অঙ্গচালনা', 'A', 2, 'পেশি sarcomere, অস্থিসন্ধি ও চলন'),
  chapter('biology', 2, '8', 'সমন্বয় ও নিয়ন্ত্রণ', 'A', 3, 'নিউরন, reflex arc, মস্তিষ্ক ও হরমোন'),
  chapter('biology', 2, '9', 'মানব জীবনের ধারাবাহিকতা', 'A', 2, 'জননতন্ত্র, গ্যামেট ও ভ্রূণের বিকাশ'),
  chapter('biology', 2, '10', 'মানবদেহের প্রতিরক্ষা', 'A', 2, 'ইমিউনিটি, অ্যান্টিজেন ও টিকা'),
  chapter('biology', 2, '11', 'জিনতত্ত্ব ও বিবর্তন', 'A', 3, 'মেন্ডেলীয় cross, sex linkage ও বিবর্তন'),
  chapter('biology', 2, '12', 'প্রাণীর আচরণ', 'C', 1, 'সহজাত ও অর্জিত আচরণ', 'সংস্করণভেদে এই অধ্যায় নাও থাকতে পারে। তোমার বই ও পরীক্ষার পাঠ্যসূচি মিলিয়ে নাও; বইয়ে না থাকলে এই সময়ে দুর্বল অধ্যায় অনুশীলন করো।'),

  chapter('math', 1, '1', 'ম্যাট্রিক্স ও নির্ণায়ক', 'A', 3, 'নির্ণায়ক, বিপরীত ম্যাট্রিক্স ও সমীকরণ'),
  chapter('math', 1, '2', 'ভেক্টর', 'A', 3, 'ডট–ক্রস, ক্ষেত্রফল ও জ্যামিতিক প্রয়োগ'),
  chapter('math', 1, '3', 'সরলরেখা', 'A', 3, 'ঢাল, দূরত্ব, কোণ ও লেখচিত্র'),
  chapter('math', 1, '4', 'বৃত্ত', 'A', 3, 'সমীকরণ, স্পর্শক ও ছেদ'),
  chapter('math', 1, '5', 'বিন্যাস ও সমাবেশ', 'A', 2, 'গণনার নিয়ম, শর্তসহ বিন্যাস ও সমাবেশ'),
  chapter('math', 1, '6', 'ত্রিকোণমিতিক অনুপাত', 'A', 2, 'অভেদ, চতুর্ভাগ ও সাধারণ মান'),
  chapter('math', 1, '7', 'সংযুক্ত কোণের ত্রিকোণমিতিক অনুপাত', 'A', 3, 'যৌগিক কোণ, গুণিতক ও উপগুণিতক সূত্র'),
  chapter('math', 1, '8', 'ফাংশন ও ফাংশনের লেখচিত্র', 'A', 2, 'ডোমেইন–রেঞ্জ, composition ও inverse'),
  chapter('math', 1, '9', 'অন্তরীকরণ', 'A', 4, 'সূত্র, স্পর্শক–অভিলম্ব ও চরম মান'),
  chapter('math', 1, '10', 'যোগজীকরণ', 'A', 4, 'প্রতিস্থাপন, নির্দিষ্ট যোগজ ও ক্ষেত্রফল'),
  chapter('math', 2, '3', 'জটিল সংখ্যা', 'A', 2, 'আর্গ্যান্ড চিত্র, মডুলাস, আর্গুমেন্ট ও মূল'),
  chapter('math', 2, '4', 'বহুপদী ও বহুপদী সমীকরণ', 'A', 3, 'মূল ও সহগের সম্পর্ক, সমীকরণ গঠন'),
  chapter('math', 2, '5', 'দ্বিপদী বিস্তৃতি', 'A', 2, 'সাধারণ পদ, মধ্যপদ ও সহগ'),
  chapter('math', 2, '6', 'কণিক', 'A', 3, 'পরাবৃত্ত, উপবৃত্ত, অধিবৃত্ত ও উৎকেন্দ্রিকতা'),
  chapter('math', 2, '7', 'বিপরীত ত্রিকোণমিতিক ফাংশন ও সমীকরণ', 'A', 3, 'প্রধান মান, অভেদ ও সাধারণ সমাধান'),
  chapter('math', 2, '8', 'স্থিতিবিদ্যা', 'A', 3, 'বলের সাম্য, লব্ধি ও লামির উপপাদ্য'),
  chapter('math', 2, '9', 'সমতলে বস্তুকণার গতি', 'A', 3, 'গতির সমীকরণ, প্রাস ও আপেক্ষিক বেগ'),
  chapter('math', 2, '1', 'বাস্তব সংখ্যা ও অসমতা', 'B', 2, 'পরম মান, অসমতার সমাধান ও লেখচিত্র'),
  chapter('math', 2, '2', 'যোগাশ্রয়ী প্রোগ্রাম', 'B', 2, 'সম্ভাব্য অঞ্চল ও সর্বোচ্চ–সর্বনিম্ন মান'),
  chapter('math', 2, '10', 'বিস্তার পরিমাপ ও সম্ভাবনা', 'B', 3, 'পরিমিত ব্যবধান, ভেদাঙ্ক ও সম্ভাবনার নিয়ম'),

  chapter('bangla', 1, 'গদ্য ১', 'গদ্য: পাঠ ১–৩', 'A', 2, 'মূলভাব, চরিত্র/যুক্তি, শব্দার্থ ও ২টি সৃজনশীল'),
  chapter('bangla', 1, 'গদ্য ২', 'গদ্য: পাঠ ৪–৬', 'A', 2, 'মূলভাব, প্রসঙ্গ ও উদ্দীপক বিশ্লেষণ'),
  chapter('bangla', 1, 'গদ্য ৩', 'গদ্য: পাঠ ৭–৯', 'A', 2, 'তুলনামূলক পাঠ ও সৃজনশীল অনুশীলন'),
  chapter('bangla', 1, 'গদ্য ৪', 'গদ্য: পাঠ ১০–১২', 'A', 2, 'লেখক, মূলভাব ও পূর্ণ CQ সেট'),
  chapter('bangla', 1, 'পদ্য ১', 'কবিতা: পাঠ ১–৩', 'A', 2, 'চরণের অর্থ, প্রতীক ও মূলভাব'),
  chapter('bangla', 1, 'পদ্য ২', 'কবিতা: পাঠ ৪–৬', 'A', 2, 'কাব্যরীতি, অলংকার ও সৃজনশীল'),
  chapter('bangla', 1, 'পদ্য ৩', 'কবিতা: পাঠ ৭–৯', 'A', 2, 'কবি পরিচিতি, শব্দার্থ ও MCQ'),
  chapter('bangla', 1, 'পদ্য ৪', 'কবিতা: পাঠ ১০–১২', 'A', 2, 'মূলভাব ও উদ্দীপকের সঙ্গে তুলনা'),
  chapter('bangla', 1, 'সহপাঠ ১', 'সহপাঠ: উপন্যাস', 'A', 3, 'চরিত্র, ঘটনা, সমাজচিত্র ও সৃজনশীল'),
  chapter('bangla', 1, 'সহপাঠ ২', 'সহপাঠ: নাটক', 'A', 2, 'চরিত্র, সংলাপ ও নাট্যদ্বন্দ্ব'),
  chapter('bangla', 2, 'ব্যাকরণ ১', 'উচ্চারণ, বানান ও শব্দার্থ', 'A', 2, 'নিয়ম ও পাঠ্যবইয়ের অনুশীলনী'),
  chapter('bangla', 2, 'ব্যাকরণ ২', 'শব্দ গঠন: উপসর্গ–প্রত্যয়–সমাস', 'A', 2, 'শব্দ বিশ্লেষণ ও প্রয়োগ'),
  chapter('bangla', 2, 'ব্যাকরণ ৩', 'পদ, বাক্য, প্রয়োগ–অপপ্রয়োগ', 'A', 2, 'নিয়ম, উদাহরণ ও সংশোধন'),
  chapter('bangla', 2, 'ব্যাকরণ ৪', 'পারিভাষিক শব্দ ও অনুবাদ', 'A', 1, '২০টি শব্দ ও একটি অনুবাদ'),
  chapter('bangla', 2, 'নির্মিতি ১', 'সারাংশ, সারমর্ম ও ভাব-সম্প্রসারণ', 'A', 2, 'সময় ধরে ৩টি লেখা ও সংশোধন'),
  chapter('bangla', 2, 'নির্মিতি ২', 'প্রতিবেদন, সংলাপ ও খুদে গল্প', 'A', 2, 'কাঠামো ধরে লেখা ও self-review'),
  chapter('bangla', 2, 'নির্মিতি ৩', 'পত্র, দরখাস্ত, দিনলিপি ও প্রবন্ধ', 'A', 2, 'ফরম্যাট, যুক্তি ও ভাষার শুদ্ধতা'),

  chapter('english', 1, 'Reading 1', 'Reading: detail ও main idea', 'A', 2, 'Passage annotation, evidence ও summary'),
  chapter('english', 1, 'Reading 2', 'Reading: inference ও vocabulary', 'A', 2, 'Context clues, reference ও tone'),
  chapter('english', 1, 'Reading 3', 'Reading: information transfer', 'A', 2, 'Table, chart ও flow-chart timed practice'),
  chapter('english', 1, 'Reading 4', 'Reading: cloze ও short questions', 'A', 2, 'Comprehension ও context-based answers'),
  chapter('english', 1, 'Writing 1', 'Paragraph ও description', 'A', 2, 'Topic sentence, coherence ও timed writing'),
  chapter('english', 1, 'Writing 2', 'Letter, email ও application', 'A', 2, 'Format, register ও error correction'),
  chapter('english', 1, 'Writing 3', 'Graph, chart ও report', 'A', 2, 'Trend language, comparison ও accuracy'),
  chapter('english', 1, 'Writing 4', 'Reading + writing mixed practice', 'A', 2, 'Full paper sections under a timer'),
  chapter('english', 2, 'Grammar 1', 'Tense, right form of verbs ও agreement', 'A', 2, 'Rule → example → ২০টি exercise'),
  chapter('english', 2, 'Grammar 2', 'Preposition ও special phrases', 'A', 2, 'Context-based usage ও correction'),
  chapter('english', 2, 'Grammar 3', 'Narration ও completing sentences', 'A', 2, 'Passage narration, conditionals ও clauses'),
  chapter('english', 2, 'Grammar 4', 'Modifiers ও sentence connectors', 'A', 2, 'Position, meaning ও passage practice'),
  chapter('english', 2, 'Grammar 5', 'Synonym–antonym ও punctuation', 'A', 2, 'Context vocabulary ও capitalization'),
  chapter('english', 2, 'Writing 1', 'Paragraph, essay ও composition', 'A', 2, 'Outline, argument ও timed revision'),
  chapter('english', 2, 'Writing 2', 'Formal letter, email ও report', 'A', 2, 'Format ও model answer analysis'),
  chapter('english', 2, 'Writing 3', 'Grammar + composition mixed practice', 'A', 2, 'Full paper sections ও ভুলের তালিকা'),

  chapter('ict', 1, '3', 'সংখ্যা পদ্ধতি ও ডিজিটাল ডিভাইস', 'A', 3, 'বেস রূপান্তর, বুলিয়ান algebra, gate ও circuit'),
  chapter('ict', 1, '4', 'ওয়েব ডিজাইন পরিচিতি ও HTML', 'A', 3, 'HTML structure, table, link, image ও mini project'),
  chapter('ict', 1, '5', 'প্রোগ্রামিং ভাষা', 'A', 3, 'C: variable, condition, loop, array ও dry run'),
  chapter('ict', 1, '6', 'ডেটাবেজ ম্যানেজমেন্ট সিস্টেম', 'A', 2, 'Entity, key, relation, query ও normalization'),
  chapter('ict', 1, '2', 'কমিউনিকেশন সিস্টেমস ও নেটওয়ার্কিং', 'B', 2, 'Transmission, topology, device ও network security'),
  chapter('ict', 1, '1', 'তথ্য ও যোগাযোগ প্রযুক্তি: বিশ্ব ও বাংলাদেশ', 'B', 1, 'প্রয়োগ, ভার্চুয়াল রিয়ালিটি, ethics ও safety'),
];

export const PAPER_NAMES: Record<SubjectId, string[]> = {
  physics: ['প্রথম পত্র', 'দ্বিতীয় পত্র'], chemistry: ['প্রথম পত্র', 'দ্বিতীয় পত্র'],
  biology: ['উদ্ভিদবিজ্ঞান · প্রথম পত্র', 'প্রাণিবিজ্ঞান · দ্বিতীয় পত্র'],
  math: ['প্রথম পত্র', 'দ্বিতীয় পত্র'], bangla: ['সাহিত্যপাঠ ও সহপাঠ', 'ব্যাকরণ ও নির্মিতি'],
  english: ['Reading & Writing', 'Grammar & Composition'], ict: ['তত্ত্বীয় ও ব্যবহারিক'],
};
export const PAPERS = SUBJECTS.flatMap(s => (s.id === 'ict' ? [1] : [1, 2]).map(p => ({
  id: `${s.id}-${p}`, subject: s.id, paper: p as 1 | 2,
  name: `${s.name} ${PAPER_NAMES[s.id][p - 1]}`, maxScore: s.id === 'ict' ? 75 : 100,
})));
export const chapterById = Object.fromEntries(CHAPTERS.map(c => [c.id, c])) as Record<string, Chapter>;
export const SYLLABUS_NOTE = 'এটি পাঠ্যবইভিত্তিক পরিকল্পনা, বোর্ডের অনুমোদিত সিলেবাস বা কমন প্রশ্নের নিশ্চয়তা নয়। A মানে আগে পড়বে, B মানে এরপর—কোনো অধ্যায় বাদ নয়। বাংলা/ইংরেজিতে দক্ষতাভিত্তিক ইউনিট রাখা হয়েছে; পাঠ নম্বর তোমার HSC 2027 সংস্করণের বইয়ের সঙ্গে মিলাও। নতুন একাদশের ভিন্ন পাঠ্যতালিকা এখানে চাপিয়ে দেওয়া হয়নি।';
export const SOURCES = [
  { name: 'NCTB — একাদশ–দ্বাদশ পাঠ্যপুস্তক', url: 'https://nctb.gov.bd/pages/static-pages/6ae03d7be0cf994829342115', note: 'মূল পাঠ্যবই ও সংস্করণ যাচাইয়ের প্রাথমিক উৎস।' },
  { name: 'NCTB — পাঠ্যসূচি ও নমুনা প্রশ্ন', url: 'https://nctb.gov.bd/pages/static-pages/6922dff5933eb65569e24d31', note: 'তোমার পরীক্ষার বছরের সর্বশেষ নির্দেশনা এখান থেকে যাচাই করো।' },
  { name: 'পদার্থবিজ্ঞানের অধ্যায় তালিকা — 10 Minute School', url: 'https://10minuteschool.com/content/category/academic-subjects/physics/', note: 'সহায়ক অধ্যায়-নামের রেফারেন্স; সরকারি সিলেবাস নয়।' },
];

/** Combined full marks used by the GPA helper: two 100-mark papers, ICT 75+25. */
export const SUBJECT_FULL_MARKS: Record<SubjectId, number> = {
  physics: 200, chemistry: 200, biology: 200, math: 200, bangla: 200, english: 200, ict: 100,
};
export const FOURTH_SUBJECT: SubjectId = 'math';
