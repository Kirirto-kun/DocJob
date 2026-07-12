'use client';

import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import {
  PREVENTABILITY,
  type CaseSolution,
  type IncidentSolution,
  type ReflectionSolution,
} from '@/lib/case-schema';
import { StringListField } from './string-list-field';

const PREVENTABILITY_LABELS: Record<(typeof PREVENTABILITY)[number], string> = {
  full: 'Полностью предотвратим',
  conditional: 'Условно предотвратим',
  none: 'Непредотвратим',
};

export type SolutionFormProps = {
  value: CaseSolution;
  onChange: (next: CaseSolution) => void;
};

export function SolutionForm({ value, onChange }: SolutionFormProps) {
  if (value.kind === 'incident') {
    return <IncidentForm value={value} onChange={onChange} />;
  }
  return <ReflectionForm value={value} onChange={onChange} />;
}

function IncidentForm({
  value,
  onChange,
}: {
  value: IncidentSolution;
  onChange: (next: IncidentSolution) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="solution-diagnosis">Диагноз (МКБ-10 + текст)</Label>
        <Textarea
          id="solution-diagnosis"
          rows={3}
          value={value.diagnosis}
          onChange={(e) => onChange({ ...value, diagnosis: e.target.value })}
        />
      </div>

      <StringListField
        label="Ошибки в ведении пациента"
        items={value.errors}
        placeholder="Описание ошибки"
        addLabel="Добавить ошибку"
        onChange={(errors) => onChange({ ...value, errors })}
      />

      <div>
        <Label htmlFor="solution-algorithm">Правильный алгоритм действий (markdown)</Label>
        <Textarea
          id="solution-algorithm"
          rows={6}
          value={value.correctAlgorithm}
          onChange={(e) => onChange({ ...value, correctAlgorithm: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label>Предотвратимость</Label>
        <RadioGroup
          value={value.preventability}
          onValueChange={(v) =>
            onChange({ ...value, preventability: v as IncidentSolution['preventability'] })
          }
        >
          {PREVENTABILITY.map((option) => (
            <div key={option} className="flex items-center space-x-2">
              <RadioGroupItem value={option} id={`preventability-${option}`} />
              <Label htmlFor={`preventability-${option}`} className="cursor-pointer font-normal">
                {PREVENTABILITY_LABELS[option]}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>
    </div>
  );
}

function ReflectionForm({
  value,
  onChange,
}: {
  value: ReflectionSolution;
  onChange: (next: ReflectionSolution) => void;
}) {
  return (
    <div className="space-y-4">
      <StringListField
        label="Ключевые инсайты"
        items={value.keyInsights}
        placeholder="Что нового или правильного"
        addLabel="Добавить инсайт"
        onChange={(keyInsights) => onChange({ ...value, keyInsights })}
      />

      <StringListField
        label="Правильные решения"
        items={value.correctDecisions}
        placeholder="Принятое верное решение"
        addLabel="Добавить решение"
        onChange={(correctDecisions) => onChange({ ...value, correctDecisions })}
      />

      <div>
        <Label htmlFor="solution-lessons">Извлечённые уроки (markdown)</Label>
        <Textarea
          id="solution-lessons"
          rows={6}
          value={value.lessonsLearned}
          onChange={(e) => onChange({ ...value, lessonsLearned: e.target.value })}
        />
      </div>
    </div>
  );
}

export default SolutionForm;
