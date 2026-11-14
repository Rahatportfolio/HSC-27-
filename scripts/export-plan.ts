import { writeFileSync } from 'node:fs';
import { buildPlan, DEFAULT_SETTINGS, freshData } from '../src/planner';
import { makeMarkdown } from '../src/exports';
const plan = buildPlan(DEFAULT_SETTINGS);
const data = freshData();
writeFileSync('HSC-27-STUDY-PLAN.md', makeMarkdown(plan, data), 'utf8');
console.log(`Exported ${plan.length} days, ${plan.flatMap(d => d.tasks).length} tasks to HSC-27-STUDY-PLAN.md`);
