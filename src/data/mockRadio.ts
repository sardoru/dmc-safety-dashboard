import type { RadioEntry } from '../types';
import { generateId } from '../utils/helpers';

const speakers = [
  { name: 'Dispatch', channel: 'DMC-1' },
  { name: 'Unit 7', channel: 'DMC-1' },
  { name: 'Unit 12', channel: 'DMC-1' },
  { name: 'Unit 3', channel: 'DMC-2' },
  { name: 'Sgt. Davis', channel: 'DMC-1' },
  { name: 'Unit 15', channel: 'DMC-2' },
  { name: 'Base', channel: 'DMC-1' },
  { name: 'Unit 9', channel: 'DMC-2' },
];

const routineMessages = [
  'All clear on Main Street between Union and Beale. Foot traffic normal for this hour.',
  '10-4, continuing patrol along the riverfront. No issues to report.',
  'Checking in — Court Square area is quiet. A few pedestrians, nothing unusual.',
  'Completed welfare check at 200 block of Monroe. Individual was sleeping, moved along without incident.',
  'Traffic flow normal on Union Avenue. Parking garages at about 60% capacity.',
  'Routine patrol check on South Main. All businesses appear secure.',
  'Copy that dispatch, heading to Beale Street for regular foot patrol.',
  'Just finished a walk-through of the Civic Center parking garage. All clear.',
  'Status check: Peabody area normal activity. Tourists taking photos of the ducks.',
  '10-4, rotating to the north end of the district. ETA 5 minutes.',
  'Parking enforcement sweep on Front Street complete. 3 citations issued.',
  'All units, reminder: special event at FedEx Forum tonight. Expect increased foot traffic after 10 PM.',
  'Copy, maintaining position at Main and Madison. Street performers packing up for the night.',
  'Completed rounds at AutoZone Park perimeter. Secured and quiet.',
];

const cautionMessages = [
  'Be advised — group of 6-8 individuals getting loud near Beale and 3rd. Monitoring.',
  'Possible panhandling complaint at Union and 2nd. Requesting unit to check.',
  'Vehicle parked illegally blocking fire lane on Monroe. Running plates now.',
  'Report of broken glass near A. Schwab. Could be a broken bottle. Will verify.',
  'Heads up — individual on bicycle riding erratically on Main Street heading south.',
  'Minor fender bender at Front and Beale. No injuries. Drivers exchanging info.',
  'Someone reported a suspicious package near Court Square fountain. Probably just litter. Going to check.',
  'Unverified report of someone trying car door handles on 2nd Street parking lot.',
  'Noise complaint from resident on South Main — live music from nearby venue.',
];

const emergencyMessages = [
  'All units — 10-52 reported at Beale and Main. EMT requested immediately.',
  'Code red — fight in progress outside venue on Beale Street. Multiple individuals. Backup requested.',
  'Report of a smash-and-grab at a retail location on South Main. Suspect fled on foot heading east.',
  'Medical emergency — individual down near FedEx Forum entrance. Bystander performing CPR.',
  '10-70 — fire alarm activated at The Peabody. FD responding. Units assist with crowd control.',
  'Armed robbery reported at convenience store, 2nd and Union. Suspect description forthcoming.',
];

export function generateRadioEntry(): RadioEntry {
  const rand = Math.random();
  let text: string;
  let urgency: RadioEntry['urgency'];

  if (rand < 0.1) {
    text = emergencyMessages[Math.floor(Math.random() * emergencyMessages.length)];
    urgency = 'emergency';
  } else if (rand < 0.35) {
    text = cautionMessages[Math.floor(Math.random() * cautionMessages.length)];
    urgency = 'caution';
  } else {
    text = routineMessages[Math.floor(Math.random() * routineMessages.length)];
    urgency = 'routine';
  }

  const speaker = speakers[Math.floor(Math.random() * speakers.length)];

  return {
    id: generateId(),
    timestamp: Date.now(),
    speaker: speaker.name,
    channel: speaker.channel,
    text,
    urgency,
  };
}

export function generateInitialRadioEntries(count: number): RadioEntry[] {
  const entries: RadioEntry[] = [];
  const now = Date.now();
  for (let i = count - 1; i >= 0; i--) {
    const entry = generateRadioEntry();
    entry.timestamp = now - i * 8000;
    entries.push(entry);
  }
  return entries;
}
