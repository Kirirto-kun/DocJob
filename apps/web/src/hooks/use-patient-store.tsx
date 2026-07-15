'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc/react';
import type { SerializedCase, SerializedCaseImage } from '@docjob/core';
import type { CaseBody } from '@/lib/case-schema';
import { useUserStore } from './use-user-store';

export type PatientScenario = {
  scenarioDescription: string;
  learningObjectives: string[];
  comorbidities: string;
};

export type PatientImage = {
  id: string;
  filename: string;
  mimeType: string;
  url: string;
  order: number;
};

export type Patient = {
  id: string;
  doctorId: string;
  name: string;
  age: number;
  gender: string;
  primaryCondition: string;
  history: string;
  scenario: PatientScenario;
  subgroup?: string | null;
  specialty?: string | null;
  tags?: string[];
  teaser?: string | null;
  body?: CaseBody;
  images?: PatientImage[];
  attachedImages?: PatientImage[]; // alias for backward compat
  createdAt?: string;
};

function serializedToPatient(c: SerializedCase): Patient {
  const images = c.images.map<PatientImage>((i: SerializedCaseImage) => ({
    id: i.id,
    filename: i.filename,
    mimeType: i.mimeType,
    url: i.url,
    order: i.order,
  }));
  return {
    id: c.id,
    doctorId: c.authorId,
    name: c.name,
    age: c.age ?? 0,
    gender: c.gender ?? '',
    primaryCondition: c.primaryCondition ?? '',
    history: c.history ?? '',
    scenario: {
      scenarioDescription: c.scenarioDescription ?? '',
      learningObjectives: c.learningObjectives,
      comorbidities: c.comorbidities ?? '',
    },
    subgroup: c.subgroup,
    specialty: c.specialty,
    tags: c.tags,
    teaser: c.teaser,
    body: c.body,
    images,
    attachedImages: images,
    createdAt: c.createdAt,
  };
}

type PatientStore = {
  patients: Patient[];
  addPatient: (patient: Patient) => Promise<void>;
  updatePatient: (patient: Patient) => Promise<void>;
  deletePatient: (id: string) => Promise<void>;
  activePatient: Patient | null;
  setActivePatient: (patientId: string | null) => void;
  refreshPatients: () => Promise<void>;
  isInitialized: boolean;
};

const PatientContext = createContext<PatientStore | null>(null);

const ACTIVE_PATIENT_KEY = (userId: string) => `activePatient_${userId}`;

/**
 * The case-catalog store (misleadingly named `Patient*` — a holdover from
 * the pre-rebuild chat-simulator product). Migrated off the `getCases`/
 * `createCase`/`updateCase`/`deleteCase` Server Actions to `trpc.cases.*`
 * (SP-2 Task 3): `trpc.cases.list.useQuery` backs `patients`/
 * `refreshPatients`, and `trpc.cases.{create,update,delete}.useMutation`
 * back the (currently uncalled, kept for public-API compat) `addPatient`/
 * `updatePatient`/`deletePatient` mutators. Public API is unchanged so
 * every existing consumer (`app/page.tsx`, `cases/[subgroup]/page.tsx`)
 * keeps working without modification.
 */
export function PatientProvider({ children }: { children: React.ReactNode }) {
  const [activePatientId, setActivePatientIdState] = useState<string | null>(null);
  const { currentUser, isInitialized: userIsInitialized } = useUserStore();
  const utils = trpc.useUtils();

  const hasUser = Boolean(currentUser);
  const listQuery = trpc.cases.list.useQuery(undefined, {
    enabled: userIsInitialized && hasUser,
  });

  const patients = useMemo(
    () => (hasUser ? (listQuery.data ?? []).map(serializedToPatient) : []),
    [hasUser, listQuery.data],
  );

  // Mirrors the original store's isLoaded bookkeeping: true once the fetch
  // attempt has settled (success or error) for a logged-in user, or
  // immediately once we know there's no user to fetch cases for.
  const isLoaded = !hasUser || listQuery.isFetched || listQuery.isError;

  const refreshPatients = useCallback(async () => {
    await listQuery.refetch();
  }, [listQuery.refetch]);

  useEffect(() => {
    if (currentUser && isLoaded) {
      const stored = typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_PATIENT_KEY(currentUser.id)) : null;
      if (stored && patients.some((p) => p.id === stored)) {
        setActivePatientIdState(stored);
      }
    }
  }, [currentUser, isLoaded, patients]);

  const activePatient = useMemo(
    () => patients.find((p) => p.id === activePatientId) ?? null,
    [patients, activePatientId]
  );

  const setActivePatient = useCallback(
    (patientId: string | null) => {
      setActivePatientIdState(patientId);
      if (currentUser && typeof window !== 'undefined') {
        if (patientId) {
          localStorage.setItem(ACTIVE_PATIENT_KEY(currentUser.id), patientId);
        } else {
          localStorage.removeItem(ACTIVE_PATIENT_KEY(currentUser.id));
        }
      }
    },
    [currentUser]
  );

  const invalidateLists = useCallback(async () => {
    await Promise.all([
      utils.cases.list.invalidate(),
      utils.cases.listPaged.invalidate(),
    ]);
  }, [utils]);

  const createMutation = trpc.cases.create.useMutation();
  const updateMutation = trpc.cases.update.useMutation();
  const deleteMutation = trpc.cases.delete.useMutation();

  const addPatient = useCallback(
    async (patient: Patient) => {
      await createMutation.mutateAsync({
        name: patient.name,
        age: patient.age,
        gender: patient.gender,
        primaryCondition: patient.primaryCondition,
        history: patient.history,
        scenarioDescription: patient.scenario.scenarioDescription,
        learningObjectives: patient.scenario.learningObjectives,
        comorbidities: patient.scenario.comorbidities,
        subgroup: patient.subgroup ?? undefined,
        specialty: patient.specialty ?? undefined,
        tags: patient.tags ?? [],
        imageFilenames: (patient.images ?? []).map((i) => ({ filename: i.filename, mimeType: i.mimeType })),
      });
      await invalidateLists();
    },
    [createMutation, invalidateLists]
  );

  const updatePatient = useCallback(
    async (patient: Patient) => {
      await updateMutation.mutateAsync({
        id: patient.id,
        name: patient.name,
        age: patient.age,
        gender: patient.gender,
        primaryCondition: patient.primaryCondition,
        history: patient.history,
        scenarioDescription: patient.scenario.scenarioDescription,
        learningObjectives: patient.scenario.learningObjectives,
        comorbidities: patient.scenario.comorbidities,
        subgroup: patient.subgroup ?? undefined,
        specialty: patient.specialty ?? undefined,
        tags: patient.tags ?? [],
      });
      await invalidateLists();
    },
    [updateMutation, invalidateLists]
  );

  const deletePatient = useCallback(
    async (id: string) => {
      await deleteMutation.mutateAsync(id);
      if (activePatientId === id) setActivePatient(null);
      await invalidateLists();
    },
    [deleteMutation, activePatientId, invalidateLists, setActivePatient]
  );

  return (
    <PatientContext.Provider
      value={{
        patients,
        addPatient,
        updatePatient,
        deletePatient,
        activePatient,
        setActivePatient,
        refreshPatients,
        isInitialized: userIsInitialized && isLoaded,
      }}
    >
      {children}
    </PatientContext.Provider>
  );
}

export function usePatientStore() {
  const context = useContext(PatientContext);
  if (!context) {
    throw new Error('usePatientStore must be used within a PatientProvider');
  }
  return context;
}
