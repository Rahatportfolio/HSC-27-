import { chapterById } from "./data";
import type { SubjectId } from "./data";
import type { WorkStage } from './personalRoutine';

/** Short on-device instructions for existing work; no generated exercise content. */
export const studyBrainPlaybook = {
  class: ['উদাহরণের পর থামো। শিক্ষক কেন ওই পদ্ধতি নিলেন, এক বাক্যে বলো।', 'Pause after a worked example. Explain in one sentence why the teacher chose that method.'],
  reading: ['একটি উপশিরোনাম পড়ো। বই বন্ধ করে মূল ধারণা বলো, তারপর বই খুলে মিলিয়ে নাও।', 'Read one subsection. Close the book, explain the main idea, then reopen it to check.'],
  notes: ['পুরো পৃষ্ঠা কপি না করে নিজের ভাষায় মূল ধারণা আর তার একটি উদাহরণ লেখো।', 'Instead of copying the page, write the main idea and one example in your own words.'],
  mcqClass: ['সমাধান দেখানোর আগে থামো। পছন্দের উত্তর এবং একটি অপশন বাদ দেওয়ার কারণ ঠিক করো।', 'Pause before the explanation. Choose an answer and give a reason for eliminating one option.'],
  mcqPractice: ['আগে করা একটি প্রশ্ন উত্তর না দেখে করো। ভুল হলে কারণটা ধরো: ধারণা, হিসাব, নাকি প্রশ্ন পড়ায় ভুল?','Retry an existing question without the answer. If you miss it, identify the cause: concept, calculation, or misreading?'],
  cqClass: ['মডেল উত্তর দেখার আগে কোন তথ্য দেওয়া হয়েছে আর প্রশ্নে কী চাওয়া হয়েছে, আলাদা করো।', 'Before viewing the model answer, separate what is given from what the question asks for.'],
  cqPractice: ['আগে করা একটি সৃজনশীল প্রশ্নের উত্তরের কাঠামো লেখো। তারপর দেখো কোন ধাপে যুক্তি বা একক বাদ পড়েছে।', 'Outline an answer to an existing CQ. Then check which step is missing reasoning or units where applicable.'],
  revision: ['নোট বন্ধ করে একটি ধারণা বলো বা একটি পুরোনো ভুল আবার করো। তারপর শুধু যে অংশটি ভুল হয়েছে সেটি দেখো।', 'With notes closed, recall one idea or retry an old mistake. Then revisit only the part you missed.'],
} satisfies Record<WorkStage, readonly [string, string]>;

// Subject-level methods complement the chapter-specific focus map already shipped with the app.
const subjectMethods = {
  physics: ['বিদ্যমান উদাহরণে জানা রাশি, চাওয়া রাশি আর একক আলাদা করো। শেষে একক ও দিক মিলিয়ে নাও।', 'In an existing example, separate the known quantities, the unknown, and the units. Check units and direction at the end.'],
  chemistry: ['যে নিয়মটি ব্যবহার করছ, কোন অবস্থায় সেটা প্রযোজ্য আগে বলো। হিসাব থাকলে অনুপাত ও একক শেষে মিলিয়ে নাও।', 'State when the rule you are using applies. For calculations, check ratios and units at the end.'],
  biology: ['বই বন্ধ করে ধাপগুলোর ক্রম বা গঠন–কাজের সম্পর্ক বলো। তারপর চিত্র বা বইয়ের সঙ্গে মিলিয়ে নাও।', 'With the book closed, recall the sequence or how structure relates to function. Check against the diagram or text.'],
  math: ['উদাহরণের প্রথম ধাপ কীভাবে বেছে নেবে তা বলো। শেষে শর্ত ও ফল মূল সমস্যার সঙ্গে মিলিয়ে নাও।', 'Explain how you would choose the first step of the example. Check the conditions and result against the original problem.'],
  bangla: ['উত্তরের মূল বক্তব্য এক বাক্যে বলো। তারপর উৎস থেকে একটি প্রাসঙ্গিক অংশ দিয়ে সেটি সমর্থন করো।', 'State the main point in one sentence. Support it with a relevant detail from the source.'],
  english: ['আগের লেখা থেকে একটি অনুচ্ছেদ দেখো: মূল বাক্য, তার সমর্থন, আর একটি সংশোধন চিহ্নিত করো।', 'Review an existing paragraph: identify its main sentence, its support, and one edit.'],
  ict: ['বিদ্যমান উদাহরণের ইনপুট থেকে আউটপুট হাতে অনুসরণ করো। প্রথম অমিল কোথায় তা উৎসে মিলিয়ে নাও।', 'Trace an existing example from input to output by hand. Verify the first point where your result differs.'],
} satisfies Record<SubjectId, readonly [string, string]>;

export function brainChapterGuide(chapterId: string) {
  if (!Object.hasOwn(chapterById, chapterId)) return undefined;
  const chapter = chapterById[chapterId];
  return { title: chapter.title, focus: chapter.focus, method: subjectMethods[chapter.subject] };
}
