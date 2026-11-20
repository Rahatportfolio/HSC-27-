import { CHAPTERS, chapterById } from './data';
import { BRAIN_LIMITS } from './studyBrain';
import type { BrainCheckInDraft } from './studyBrainTypes';

export type BrainMessageResult = { kind: 'draft'; patch: Partial<BrainCheckInDraft>; outsidePair: boolean }
  | { kind: 'next' | 'report' | 'memory' | 'help' | 'unsupported' | 'invalid-time' | 'pace' | 'preflight' | 'consistency' };
/** Deliberately small bilingual/Banglish intent parser, not a general chatbot.
 * Natural text only drafts fields. It is never executed or stored as an instruction.
 */
export function interpretBrainMessage(message: string, pair: string[]): BrainMessageResult {
  if (!message.trim() || message.length > BRAIN_LIMITS.message) return { kind: 'help' };
  const text = message.normalize('NFKC').toLowerCase().replace(/[০-৯]/g, digit => String('০১২৩৪৫৬৭৮৯'.indexOf(digit))).trim();
  if (/(?:delete|erase|clear|uninstall|মুছ|মুছে|ডিলিট|complete|finished|watched|studied|পড়েছি|পড়েছি|শেষ করেছি|porechi|porsi|dekhechi)/u.test(text)) return { kind: 'unsupported' };
  if (/(?:remember about me|what.*know.*me|memory|আমার সম্পর্কে|মনে রেখেছ|mone (?:ache|rekhecho))/u.test(text)) return { kind: 'memory' };
  if (/^(?:my report|show (?:my )?(?:report|progress)|how (?:can i improve|am i doing)|amar report|report dekhao|kivabe improve korbo|আমার রিপোর্ট|রিপোর্ট দেখাও|কীভাবে উন্নতি করব)[.!?।]?$/u.test(text)) return { kind: 'report' };
  if (/(?:preflight|fix first|revise first|priority|prioritise|ঠিক করব|age thik|ki thik|thik korbo|ভুল আগে|age kore|আগে করব)/u.test(text)) return { kind: 'preflight' };
  if (/(?:pace|gati|গতি|কবে শেষ|kobe shesh|how fast am i|finish date|শেষ হবে কবে)/u.test(text)) return { kind: 'pace' };
  if (/(?:streak|ধারাবাহিক|consistency|regular|নিয়মিত|niyomito|কত দিন পড়ি|koto din pori|kotobar)/u.test(text)) return { kind: 'consistency' };
  const patch: Partial<BrainCheckInDraft> = {};
  const noTime = /(?:পড়তে পারব না|পড়তে পারব না|আজ ছুটি|আজ বিশ্রাম|porte parbo na|aj (?:off|chuti)|no time|cannot study|can't study|rest today)/u.test(text);
  if (noTime) patch.availableMinutes = 0;
  // Do not turn negative, ambiguous or excessive numbers into a confident time promise.
  const times = [...text.matchAll(/(-?\d+(?:\.\d+)?)\s*(ঘণ্টা|ঘন্টা|ghonta|hours?|hrs?|h|মিনিট|মি\.?|minutes?|mins?|m)(?=\s|$|[,.!?।])/gu)];
  if (times.length) {
    const units = times.map(match => /^(?:ঘ|gh|h)/u.test(match[2]) ? 'hours' : 'minutes');
    const minutes = times.reduce((sum, match, index) => sum + Number(match[1]) * (units[index] === 'hours' ? 60 : 1), 0);
    if (noTime || new Set(units).size !== units.length || !Number.isInteger(minutes) || minutes < 0 || minutes > 720 || times.some(match => Number(match[1]) < 0)) return { kind: 'invalid-time' };
    patch.availableMinutes = minutes;
  }
  if (/(?:not tired|ক্লান্ত নই|klanto na)/u.test(text)) return { kind: 'help' };
  if (/(?:ক্লান্ত|klanto|tired|energy kom|ghum pacche)/u.test(text)) patch.energy = 'low';
  else if (/(?:চনমনে|fresh|energetic|bhalo lagche|ভালো লাগছে)/u.test(text)) patch.energy = 'fresh';
  else if (/(?:মোটামুটি|motamuti|normal|okay)/u.test(text)) patch.energy = 'okay';
  if (/(?:বুঝি না|বুঝতে পারছি না|bujhi na|bujhte parchi na|don't understand|do not understand)/u.test(text)) patch.obstacle = 'understanding';
  else if (/(?:মনে থাকে না|ভুলে যাই|mone thake na|vule jai|forget|can't remember)/u.test(text)) patch.obstacle = 'remembering';
  else if (/(?:শুরু করতে|মন বসে না|start korte|mon boshe na|can't start|cannot start)/u.test(text)) patch.obstacle = 'starting';
  const subjectNames: [string, RegExp][] = [
    ['physics', /(?:\bphysics\b|পদার্থ|podartho)/u], ['chemistry', /(?:\bchemistry\b|রসায়ন|রসায়ন|roshayon)/u],
    ['math', /(?:\bmath(?:s)?\b|গণিত|gonit)/u], ['biology', /(?:\bbiology\b|জীববিজ্ঞান|jibbiggan)/u],
    ['bangla', /(?:\bbangla\b|বাংলা)/u], ['english', /(?:\benglish\b|ইংরেজি)/u], ['ict', /(?:\bict\b|আইসিটি)/u],
  ];
  const subjects = subjectNames.filter(([, regex]) => regex.test(text)).map(([id]) => id);
  if (subjects.length > 1) return { kind: 'help' };
  const matching = pair.filter(id => chapterById[id]?.subject === subjects[0]);
  if (matching.length === 1) patch.chapterId = matching[0];
  const exactTitle = CHAPTERS.filter(item => pair.includes(item.id) && text.includes(item.title.toLowerCase()));
  if (exactTitle.length === 1) patch.chapterId = exactTitle[0].id;
  if (Object.keys(patch).length) return { kind: 'draft', patch, outsidePair: !!subjects.length && !matching.length };
  if (/(?:কি পড়ব|কী পড়ব|কি পড়ব|কী পড়ব|ki porbo|what.*(?:study|next)|next|পরের কাজ)/u.test(text)) return { kind: 'next' };
  return { kind: 'help' };
}
