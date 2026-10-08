import type { RadioEntry } from '../types';

/** Heuristic urgency for a scanner transcription. */
export function classifyUrgency(text: string): RadioEntry['urgency'] {
  const lower = text.toLowerCase();
  if (
    /10-52|code red|emergency|robbery|armed|fire alarm|10-70|backup requested|medical emergency|weapon|assault|shooting/i.test(
      lower,
    )
  ) {
    return 'emergency';
  }
  if (
    /be advised|suspicious|complaint|heads up|erratic|noise|unverified|fender bender|theft|trespass|disturbance|vandalism/i.test(
      lower,
    )
  ) {
    return 'caution';
  }
  return 'routine';
}
