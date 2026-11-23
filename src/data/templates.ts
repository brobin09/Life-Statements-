import type { Area, Direction, Rubric, Section } from '../core/types';
import { defaultQualitativeWorst } from '../core/scoring';

export const DEFAULT_AREAS: Area[] = [
  ['finances', 'Finances', 8, 3], ['health', 'Health', 9, 7], ['relationships', 'Relationships', 9, 12],
  ['career', 'Career / Vocation', 7, 40], ['learning', 'Learning', 5, 5], ['home', 'Home / Environment', 5, 6],
  ['meaning', 'Spirituality / Meaning', 6, 4], ['recreation', 'Recreation', 4, 8],
].map(([id, name, weight, hrs], order) => ({
  id: id as string, name: name as string, weight: weight as number,
  intendedWeeklyHours: hrs as number, order, archived: false,
}));

export interface Template {
  key: string;
  areaId: string;
  name: string;
  section: Section;
  valueType: 'quantitative' | 'qualitative';
  unit?: string;
  direction: Direction;
  target: number;
  worst: number;
  weight: number;
  rubric?: Rubric;
  /** shown in the starter set and used by sample data: [Aug, Sep, Oct] 2026 */
  sample?: [number, number, number];
}

const dirFor = (s: Section): Direction => (s === 'liability' || s === 'outflow' ? 'lower' : 'higher');

const Q = (areaId: string, key: string, name: string, section: Section, unit: string, target: number,
  worst: number, weight: number, sample?: [number, number, number]): Template =>
  ({ key, areaId, name, section, valueType: 'quantitative', unit, direction: dirFor(section), target, worst, weight, sample });

const R = (areaId: string, key: string, name: string, section: Section, target: number, weight: number,
  question: string, a2: string, a5: string, a8: string, sample?: [number, number, number]): Template => {
  const direction = dirFor(section);
  return {
    key, areaId, name, section, valueType: 'qualitative', direction, target,
    worst: defaultQualitativeWorst(direction), weight,
    rubric: { question, anchors: { 2: a2, 5: a5, 8: a8 } }, sample,
  };
};

export const TEMPLATES: Template[] = [
  // Finances
  Q('finances', 'fin-savings', 'Emergency savings', 'asset', '$', 15000, 0, 8, [6200, 7100, 8000]),
  Q('finances', 'fin-invest', 'Retirement / investments', 'asset', '$', 100000, 0, 5, [38000, 40000, 42500]),
  Q('finances', 'fin-debt', 'Consumer debt', 'liability', '$', 0, 12000, 7, [7800, 7200, 6600]),
  Q('finances', 'fin-income', 'Monthly income', 'inflow', '$', 6000, 0, 6, [5400, 5400, 5600]),
  Q('finances', 'fin-spend', 'Monthly spending', 'outflow', '$', 4000, 6500, 6, [4700, 4400, 4300]),
  R('finances', 'fin-clarity', 'Financial clarity', 'asset', 8, 5,
    'How well do I know where my money goes and what is coming?',
    'I avoid looking at accounts; surprises are common.',
    'I check roughly monthly and know the big numbers.',
    'I have a simple plan, review it regularly, and rarely get surprised.', [4, 5, 6]),
  // Health
  Q('health', 'hl-sleep', 'Sleep', 'asset', 'h/night', 7.5, 4, 8, [6.3, 6.5, 6.9]),
  Q('health', 'hl-exercise', 'Exercise', 'inflow', 'days/wk', 4, 0, 7, [1, 2, 3]),
  R('health', 'hl-energy', 'Physical energy and fitness', 'asset', 8, 6,
    'How capable and energetic does my body feel day to day?',
    'Everyday tasks tire me; frequent aches or low energy.',
    'Fine for normal days; tire quickly with extra effort.',
    'Strong, energetic, and able to do what I want physically.', [4, 5, 5]),
  R('health', 'hl-stress', 'Chronic stress', 'liability', 3, 8,
    'How heavy is ongoing stress? (10 = overwhelming)',
    'Occasional tension that clears up quickly.',
    'Noticeable most weeks; affects sleep or mood at times.',
    'Constant; hard to switch off and it spills into everything.', [8, 7, 6]),
  Q('health', 'hl-checkups', 'Overdue checkups / health tasks', 'liability', 'items', 0, 4, 4, [3, 3, 2]),
  // Relationships
  R('relationships', 'rel-friends', 'Close friendships', 'asset', 8, 8,
    'How supported and connected do I feel with friends?',
    'I have few people to turn to and rarely talk.',
    'A couple of good friends; contact is irregular.',
    'Several people I trust, and we stay in regular touch.', [5, 6, 6]),
  R('relationships', 'rel-home', 'Family / partner connection', 'asset', 8, 8,
    'How close and warm are my relationships at home or with family?',
    'Distant; most interaction is logistics.',
    'Generally good with some drift or tension.',
    'Close, open, and I feel known.', [6, 6, 7]),
  Q('relationships', 'rel-conflict', 'Unresolved conflicts', 'liability', 'conflicts', 0, 4, 6, [2, 2, 1]),
  Q('relationships', 'rel-time', 'Quality time with people', 'inflow', 'hours/wk', 10, 0, 7, [4, 5, 6]),
  R('relationships', 'rel-obligation', 'Social obligations I resent', 'liability', 3, 4,
    'How heavy are commitments to others that I do not want? (10 = overwhelming)',
    'One or two that barely register.',
    'A few that I regularly dread.',
    'Many; I feel stretched and resentful.', [6, 5, 5]),
  // Career
  R('career', 'car-fulfil', 'Work fulfilment', 'asset', 8, 7,
    'How meaningful and engaging is my work?',
    'Mostly a means to an end; often flat.',
    'Some good days; mixed overall.',
    'Engaged most days and proud of what I do.', [5, 5, 6]),
  R('career', 'car-skills', 'Marketable skills', 'asset', 8, 6,
    'How well do my skills hold up if I needed to change roles?',
    'Narrow or dated; hard to move.',
    'Solid in my current role; some gaps elsewhere.',
    'Broad, current, and in demand.', [6, 6, 6]),
  Q('career', 'car-hours', 'Work hours', 'outflow', 'hours/wk', 40, 65, 6, [52, 50, 46]),
  R('career', 'car-overcommit', 'Overcommitments at work', 'liability', 3, 6,
    'How much more have I agreed to than I can deliver comfortably? (10 = far too much)',
    'Slightly full but manageable.',
    'Regularly behind; occasionally drop things.',
    'Far beyond capacity; things slip constantly.', [8, 7, 6]),
  R('career', 'car-progress', 'Progress on key work goal', 'inflow', 7, 5,
    'How much real progress did I make on what matters most?',
    'Little moved forward.',
    'Steady but slower than hoped.',
    'Clear, meaningful milestones reached.', [4, 5, 6]),
  // Learning
  Q('learning', 'lrn-hours', 'Deliberate learning', 'inflow', 'hours/wk', 5, 0, 6, [1, 2, 3]),
  R('learning', 'lrn-growth', 'Skill growth', 'asset', 7, 5,
    'How much am I getting better at something I care about?',
    'Little sense of growth.',
    'Some progress, mostly by chance.',
    'Deliberate and visible improvement.', [4, 5, 5]),
  Q('learning', 'lrn-backlog', 'Unfinished courses / books', 'liability', 'items', 2, 12, 2, [8, 8, 7]),
  // Home
  R('home', 'home-comfort', 'Home comfort and order', 'asset', 8, 6,
    'How restful and functional is my living space?',
    'Chaotic or uncomfortable.',
    'Livable; some areas work better than others.',
    'Calm, tidy enough, and works for how I live.', [5, 6, 6]),
  Q('home', 'home-maint', 'Deferred maintenance', 'liability', 'tasks', 0, 12, 5, [7, 6, 5]),
  R('home', 'home-clutter', 'Clutter and unfinished projects', 'liability', 3, 3,
    'How much physical backlog weighs on me? (10 = overwhelming)',
    'A little, easily dealt with.',
    'Visible in several rooms; I avoid some of it.',
    'Pervasive; it affects how I use the space.', [6, 6, 5]),
  // Meaning
  R('meaning', 'mea-purpose', 'Sense of purpose', 'asset', 8, 7,
    'How clear is what I am here to do or care about?',
    'Unclear; I mostly react to what arrives.',
    'Some direction, with frequent doubt.',
    'Clear and steady; it guides my choices.', [5, 5, 6]),
  Q('meaning', 'mea-practice', 'Reflective practice', 'inflow', 'days/wk', 5, 0, 5, [1, 2, 2]),
  R('meaning', 'mea-gap', 'Gap between values and actions', 'liability', 3, 6,
    'How far is how I spend my time from what I say matters? (10 = very far)',
    'Small, easy to adjust.',
    'Noticeable in a few areas.',
    'Wide; my days feel disconnected from my values.', [6, 6, 5]),
  // Recreation
  Q('recreation', 'rec-play', 'Play and hobbies', 'inflow', 'hours/wk', 6, 0, 6, [2, 3, 3]),
  Q('recreation', 'rec-screen', 'Passive screen time', 'outflow', 'hours/wk', 10, 35, 4, [24, 22, 20]),
  R('recreation', 'rec-rested', 'Feeling rested', 'asset', 8, 6,
    'How restored do I feel after downtime?',
    'Rarely; downtime does not help.',
    'Sometimes; depends on the week.',
    'Usually refreshed and ready.', [4, 5, 5]),
];

export const STARTER_TEMPLATES = TEMPLATES.filter((t) => t.sample);
