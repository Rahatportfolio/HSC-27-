/** Editorial study order, not an official NCTB category or a board-frequency prediction.
 * S is fixed independently so future A changes cannot silently change test scope.
 * A includes the 35 S units plus three second-paper physics foundations (38 total).
 * Language entries are skill/lesson groups, not single textbook chapters.
 */
export const SUPER_UNITS: Record<string, readonly string[]> = {
  physics: ['1:2', '1:4', '1:5', '1:8', '1:10'],
  chemistry: ['1:2', '1:3', '1:4', '2:2', '2:3', '2:4'],
  biology: ['1:1', '1:2', '1:9', '2:4', '2:8', '2:11'],
  math: ['1:1', '1:3', '1:9', '1:10', '2:3'],
  bangla: ['1:গদ্য ১', '1:পদ্য ১', '1:সহপাঠ ১', '2:ব্যাকরণ ৩', '2:নির্মিতি ৩'],
  english: ['1:Reading 1', '1:Writing 2', '2:Grammar 1', '2:Writing 1'],
  ict: ['1:3', '1:4', '1:5', '1:6'],
};
type Unit = { subject: string; paper: number; number: string };
export const superUnit = (c: Unit): boolean => SUPER_UNITS[c.subject]?.includes(`${c.paper}:${c.number}`) ?? false;
export const aUnit = (c: Unit): boolean => superUnit(c) || (c.subject === 'physics' && c.paper === 2 && ['1', '2', '3'].includes(c.number));
