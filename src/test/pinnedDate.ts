/**
 * Import this FIRST in suites whose fixtures and hardcoded expectations anchor the
 * synthetic 2026-11-20 plan. `vi.useFakeTimers({ toFake: ['Date'] })` keeps timers,
 * storage and real time intact; only the wall clock is frozen — at 2026-11-20T17:30Z
 * (23:30 in Dhaka, still 20 November).
 */
import { vi } from 'vitest';
vi.useFakeTimers({ toFake: ['Date'] });
vi.setSystemTime(new Date('2026-11-20T17:30:00Z'));
