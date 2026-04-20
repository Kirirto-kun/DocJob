'use client';

import { use, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import DashboardLayout from '@/components/dashboard-layout';
import ScenarioControls from '@/components/scenario-controls';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePatientStore } from '@/hooks/use-patient-store';
import { findSubgroup } from '@/lib/case-taxonomy';

const ALL_SPECIALTIES = '__all__';

export default function CasesBySubgroupPage({
  params,
}: {
  params: Promise<{ subgroup: string }>;
}) {
  const { subgroup: subgroupSlug } = use(params);
  const router = useRouter();
  const { patients, setActivePatient, isInitialized } = usePatientStore();
  const [specialtyFilter, setSpecialtyFilter] = useState<string>(ALL_SPECIALTIES);

  const subgroup = findSubgroup(subgroupSlug);

  const casesInSubgroup = useMemo(
    () => patients.filter((p) => p.subgroup === subgroupSlug),
    [patients, subgroupSlug]
  );

  const availableSpecialties = useMemo(() => {
    const set = new Set<string>();
    casesInSubgroup.forEach((c) => {
      if (c.specialty) set.add(c.specialty);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [casesInSubgroup]);

  const visibleCases = useMemo(() => {
    if (specialtyFilter === ALL_SPECIALTIES) return casesInSubgroup;
    return casesInSubgroup.filter((c) => c.specialty === specialtyFilter);
  }, [casesInSubgroup, specialtyFilter]);

  const sidebar = <ScenarioControls onScenarioGenerated={() => {}} />;

  if (!isInitialized) {
    return (
      <DashboardLayout sidebarContent={sidebar}>
        <main className="flex-1 flex items-center justify-center p-4 md:p-6 lg:p-8">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </main>
      </DashboardLayout>
    );
  }

  if (!subgroup) {
    return (
      <DashboardLayout sidebarContent={sidebar}>
        <main className="flex-1 flex items-center justify-center p-4 md:p-6 lg:p-8">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle>Подгруппа не найдена</CardTitle>
              <CardDescription>
                Запрошенная подгруппа кейсов не существует.
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Button variant="outline" onClick={() => router.push('/select-subgroup')}>
                Вернуться к выбору
              </Button>
            </CardFooter>
          </Card>
        </main>
      </DashboardLayout>
    );
  }

  const handleOpen = (caseId: string) => {
    setActivePatient(caseId);
    router.push('/');
  };

  return (
    <DashboardLayout sidebarContent={sidebar}>
      <main className="flex-1 p-4 md:p-6 lg:p-8 animate-fade-in">
        <div className="flex flex-col gap-6">
          <h1 className="text-3xl font-headline font-semibold text-foreground/90">
            {subgroup.label}
          </h1>

          {availableSpecialties.length > 0 && (
            <div className="w-full max-w-xs">
              <Select value={specialtyFilter} onValueChange={setSpecialtyFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Специальность" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SPECIALTIES}>Все</SelectItem>
                  {availableSpecialties.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {visibleCases.length === 0 ? (
            <Card className="bg-muted/30">
              <CardContent className="p-8 text-center text-muted-foreground">
                В этой подгруппе пока нет кейсов.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleCases.map((c) => {
                const imageCount = c.attachedImages?.length ?? c.images?.length ?? 0;
                return (
                  <Card key={c.id} className="flex flex-col">
                    <CardHeader>
                      <CardTitle className="text-xl">{c.name}</CardTitle>
                      <CardDescription>
                        {(c.specialty ?? 'Без специальности') + ' · ' + c.primaryCondition}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col gap-3">
                      {c.tags && c.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {c.tags.map((t) => (
                            <Badge key={t} variant="secondary">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <p className="text-sm text-muted-foreground">
                        Изображений: {imageCount}
                      </p>
                    </CardContent>
                    <CardFooter>
                      <Button onClick={() => handleOpen(c.id)}>Открыть</Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </DashboardLayout>
  );
}
