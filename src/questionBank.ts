/** Full question definitions are only needed by practice/exam features. Startup
 * validation and analytics use questionBankIndex's exact ID/chapter metadata. */
import { STARTER_QUESTIONS } from './quiz-data';
import type { AppData } from './planner';
export function allQuestions(data: AppData) {
  return [...STARTER_QUESTIONS, ...data.questions];
}
