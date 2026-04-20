
'use client';

import { useRouter } from 'next/navigation';
import { usePatientStore } from '@/hooks/use-patient-store';
import { Button } from './ui/button';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Stethoscope, User, Calendar, Activity } from 'lucide-react';
import { Badge } from './ui/badge';

type PatientListProps = {
  doctorId: string;
};

export default function PatientList({ doctorId }: PatientListProps) {
  const { patients, setActivePatient, activePatient } = usePatientStore();
  const router = useRouter();

  const myPatients = patients.filter(p => p.doctorId === doctorId);

  const handleSelectPatient = (patientId: string) => {
    setActivePatient(patientId);
    router.push('/');
  };

  if (myPatients.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-10">
        <p>В вашем списке пока нет кейсов.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {myPatients.map(patient => (
        <Card key={patient.id} className="flex flex-col">
          <CardHeader>
            <div className="flex justify-between items-start">
              <CardTitle>{patient.name}</CardTitle>
              {activePatient?.id === patient.id && <Badge variant="default">Активен</Badge>}
            </div>
            <CardDescription className="flex items-center gap-4 pt-2">
                <span className="flex items-center gap-1"><User size={14}/> {patient.gender}</span>
                <span className="flex items-center gap-1"><Calendar size={14}/> {patient.age} лет</span>
            </CardDescription>
          </CardHeader>
          <div className="px-6 space-y-2 text-sm text-muted-foreground flex-1">
            <p className="flex items-start gap-2"><Stethoscope size={16} className="text-primary mt-0.5"/> <strong>Состояние:</strong> {patient.primaryCondition}</p>
            <p className="flex items-start gap-2"><Activity size={16} className="text-primary mt-0.5"/> <strong>Анамнез:</strong> {patient.history}</p>
          </div>
          <CardFooter className="mt-4">
            <Button
                className="w-full"
                onClick={() => handleSelectPatient(patient.id)}
                disabled={activePatient?.id === patient.id}
            >
              {activePatient?.id === patient.id ? 'Диалог активен' : 'Начать диалог'}
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
