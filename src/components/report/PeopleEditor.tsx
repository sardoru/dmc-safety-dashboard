import { Car, Plus, Trash2, UserRound } from 'lucide-react';
import type { SubjectDescription, VehicleDescription } from '../../types';
import { generateId } from '../../lib/format';
import { Button, IconButton } from '../ui/Button';
import { Input } from '../ui/Form';

type SubjectKey = Exclude<keyof SubjectDescription, 'id'>;
type VehicleKey = Exclude<keyof VehicleDescription, 'id'>;

const SUBJECT_FIELDS: { key: SubjectKey; label: string; placeholder: string; wide?: boolean }[] = [
  { key: 'ageRange', label: 'Approx. age', placeholder: '20s, about 40…' },
  { key: 'sex', label: 'Gender (as seen)', placeholder: 'Man, woman…' },
  { key: 'height', label: 'Height', placeholder: "About 5'10\"" },
  { key: 'build', label: 'Build', placeholder: 'Thin, medium, heavy…' },
  { key: 'hair', label: 'Hair / hat', placeholder: 'Black beanie, braids…' },
  { key: 'clothingTop', label: 'Top', placeholder: 'Gray hoodie, red letters' },
  { key: 'clothingBottom', label: 'Bottom', placeholder: 'Black joggers' },
  { key: 'footwear', label: 'Shoes', placeholder: 'White sneakers' },
  { key: 'distinguishing', label: 'Anything distinctive', placeholder: 'Backpack, tattoo, bicycle…', wide: true },
  { key: 'behavior', label: 'What they did', placeholder: 'Pulling car door handles', wide: true },
  { key: 'direction', label: 'Which way they went', placeholder: 'South on Main toward Beale', wide: true },
];

const VEHICLE_FIELDS: { key: VehicleKey; label: string; placeholder: string; wide?: boolean }[] = [
  { key: 'color', label: 'Color', placeholder: 'Silver' },
  { key: 'make', label: 'Make', placeholder: 'Nissan' },
  { key: 'model', label: 'Model', placeholder: 'Altima' },
  { key: 'bodyType', label: 'Type', placeholder: 'Sedan, SUV, van…' },
  { key: 'plate', label: 'Plate (even partial)', placeholder: '7G4…' },
  { key: 'plateState', label: 'Plate state', placeholder: 'TN' },
  { key: 'notes', label: 'Distinctive details', placeholder: 'Tinted windows, dented bumper', wide: true },
  { key: 'direction', label: 'Which way it went', placeholder: 'West on Peabody Pl', wide: true },
];

interface PeopleEditorProps {
  subjects: SubjectDescription[];
  vehicles: VehicleDescription[];
  onSubjects: (s: SubjectDescription[]) => void;
  onVehicles: (v: VehicleDescription[]) => void;
  /** Which kinds to offer. */
  people?: boolean;
  cars?: boolean;
}

/** Structured descriptions of people and vehicles — behavior and clothing first. */
export default function PeopleEditor({ subjects, vehicles, onSubjects, onVehicles, people = true, cars = true }: PeopleEditorProps) {
  const setSubject = (id: string, key: SubjectKey, value: string) =>
    onSubjects(subjects.map((s) => (s.id === id ? { ...s, [key]: value } : s)));
  const setVehicle = (id: string, key: VehicleKey, value: string) =>
    onVehicles(vehicles.map((v) => (v.id === id ? { ...v, [key]: value } : v)));

  return (
    <div className="space-y-3">
      {subjects.map((s, idx) => (
        <fieldset key={s.id} className="rounded-2xl border border-line bg-surface-2 p-4">
          <legend className="sr-only">Person {idx + 1}</legend>
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <UserRound className="h-4 w-4 text-accent" /> Person {idx + 1}
            </p>
            <IconButton label={`Remove person ${idx + 1}`} size="sm" onClick={() => onSubjects(subjects.filter((x) => x.id !== s.id))}>
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {SUBJECT_FIELDS.map((f) => (
              <label key={f.key} className={f.wide ? 'col-span-2' : ''}>
                <span className="mb-1 block text-[12px] font-medium text-muted">{f.label}</span>
                <Input value={s[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => setSubject(s.id, f.key, e.target.value)} className="py-2 text-[13px]" />
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      {vehicles.map((v, idx) => (
        <fieldset key={v.id} className="rounded-2xl border border-line bg-surface-2 p-4">
          <legend className="sr-only">Vehicle {idx + 1}</legend>
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Car className="h-4 w-4 text-accent" /> Vehicle {idx + 1}
            </p>
            <IconButton label={`Remove vehicle ${idx + 1}`} size="sm" onClick={() => onVehicles(vehicles.filter((x) => x.id !== v.id))}>
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {VEHICLE_FIELDS.map((f) => (
              <label key={f.key} className={f.wide ? 'col-span-2' : ''}>
                <span className="mb-1 block text-[12px] font-medium text-muted">{f.label}</span>
                <Input value={v[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => setVehicle(v.id, f.key, e.target.value)} className="py-2 text-[13px]" />
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      <div className="flex flex-wrap gap-2">
        {people && (
          <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => onSubjects([...subjects, { id: generateId() }])}>
            Add a person
          </Button>
        )}
        {cars && (
          <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => onVehicles([...vehicles, { id: generateId() }])}>
            Add a vehicle
          </Button>
        )}
      </div>
    </div>
  );
}
