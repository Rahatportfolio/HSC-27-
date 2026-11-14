/* Optional partial Bangla interface. User-entered content is never translated. */
'use strict';
const UI_LABELS = {
  home:['Home','হোম'], subjects:['Subjects','বিষয়সমূহ'], planner:['Planner','পরিকল্পনা'], focus:['Focus','মনোযোগ'], progress:['Progress','অগ্রগতি'], more:['More','আরও'],
  focusTitle:['Focus timer','স্টাডি টাইমার'], notesTitle:['Notes & documents','নোট ও ডকুমেন্ট'], formulasTitle:['Formula library','সূত্র ভান্ডার'], videosTitle:['Video library','ভিডিও ভান্ডার'], practiceTitle:['Practice tracker','অনুশীলনের হিসাব'], examsTitle:['Exams','পরীক্ষা'], revisionsTitle:['Revisions','রিভিশন'], weaknessesTitle:['Weaknesses & mistakes','দুর্বলতা ও ভুল'], reviewTitle:['Weekly review','সাপ্তাহিক পর্যালোচনা'], journalTitle:['Study journal','স্টাডি জার্নাল'], calendarTitle:['Calendar','ক্যালেন্ডার'], searchTitle:['Search','অনুসন্ধান'], settingsTitle:['Settings','সেটিংস'], backupTitle:['Backup & restore','ব্যাকআপ ও পুনরুদ্ধার'],
  targetTitle:['Study target','পড়াশোনার লক্ষ্য'], studentName:['Your name (optional)','আপনার নাম (ঐচ্ছিক)'], dailyTarget:['Daily study target (minutes)','প্রতিদিনের পড়ার লক্ষ্য (মিনিট)'], preferredStart:['Preferred study start (optional)','পড়ার পছন্দের শুরুর সময় (ঐচ্ছিক)'], preferredEnd:['Preferred study end (optional)','পড়ার পছন্দের শেষ সময় (ঐচ্ছিক)'], examDate:['HSC exam date (set it yourself — never guessed)','HSC পরীক্ষার তারিখ (নিজে নির্ধারণ করুন)'], revisionIntervals:['Revision intervals (days, comma separated)','রিভিশনের বিরতি (দিন, কমা দিয়ে পৃথক)'], theme:['Theme','থিম'], saveSettings:['Save settings','সেটিংস সংরক্ষণ'], language:['Interface language (partial translation)','ইন্টারফেসের ভাষা (আংশিক অনুবাদ)'], notifications:['Notifications','বিজ্ঞপ্তি'], data:['Data','ডেটা'],
  'menu-notes':['🗒 Notes & documents','🗒 নোট ও ডকুমেন্ট'], 'menu-formulas':['∑ Formula library','∑ সূত্র ভান্ডার'], 'menu-library':['▶ Video library','▶ ভিডিও ভান্ডার'], 'menu-practice':['✍ Practice tracker','✍ অনুশীলনের হিসাব'], 'menu-exams':['📝 Exams','📝 পরীক্ষা'], 'menu-revisions':['🔁 Revisions','🔁 রিভিশন'], 'menu-weaknesses':['⚠ Weaknesses','⚠ দুর্বলতা'], 'menu-review':['✅ Weekly review','✅ সাপ্তাহিক পর্যালোচনা'], 'menu-journal':['📓 Journal','📓 জার্নাল'], 'menu-calendar':['📅 Calendar','📅 ক্যালেন্ডার'], 'menu-search':['🔍 Search','🔍 অনুসন্ধান'], 'menu-sync':['☁ Account & sync','☁ অ্যাকাউন্ট ও সিঙ্ক'], 'menu-ai':['🤖 AI assistant','🤖 AI সহকারী'], 'menu-backup':['💾 Backup & restore','💾 ব্যাকআপ ও পুনরুদ্ধার'], 'menu-settings':['⚙ Settings','⚙ সেটিংস'],
};
function applyLanguage(root = document) {
  const lang = getState().settings.language === 'bn' ? 'bn' : 'en';
  // Most labels remain English; mark translated labels individually for screen readers.
  document.documentElement.lang = 'en';
  root.querySelectorAll('[data-i18n]').forEach((node) => {
    const labels = UI_LABELS[node.dataset.i18n];
    if (labels) { node.textContent = labels[lang === 'bn' ? 1 : 0]; node.lang = lang; }
  });
}
