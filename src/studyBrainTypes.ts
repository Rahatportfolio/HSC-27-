/** Small, optional local memory. No chat transcript, private notes or API credentials. */
export type BrainEnergy = 'low' | 'okay' | 'fresh';
export type BrainObstacle = 'none' | 'understanding' | 'remembering' | 'starting';
export type BrainDifficulty = 'hard' | 'okay' | 'easy';
export interface BrainCheckIn {
  date: string;
  at: string;
  energy: BrainEnergy;
  /** Time offered for THIS focus session, not replacement weekly availability. */
  availableMinutes: number | null;
  obstacle: BrainObstacle;
  chapterId?: string;
}
export interface BrainFeedback {
  date: string;
  at: string;
  chapterId: string;
  difficulty: BrainDifficulty;
}
export interface StudyBrainMemory {
  version: 1;
  enabled: boolean;
  focusMinutes: number;
  checkIns: BrainCheckIn[];
  feedback: BrainFeedback[];
}
export type BrainCheckInDraft = Pick<BrainCheckIn, 'energy' | 'availableMinutes' | 'obstacle' | 'chapterId'>;
