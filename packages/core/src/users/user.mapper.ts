import type { Role, User } from '@docjob/db';

export type SerializedUser = {
  id: string;
  email: string;
  role: Role;
  name: string;
  fullName: string | null;
  region: string | null;
  age: number | null;
  specialty: string | null;
  phoneNumber: string | null;
  workplace: string | null;
  academicDegree: string | null;
  profilePhotoUrl: string | null;
  consentAcceptedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
};

/**
 * Moved verbatim from apps/web/src/app/actions.ts (SP-1b Task 3). Never
 * includes `passwordHash` — only the fields the old `serializeUser` exposed.
 */
export function serializeUser(u: User): SerializedUser {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    name: u.name,
    fullName: u.fullName,
    region: u.region,
    age: u.age,
    specialty: u.specialty,
    phoneNumber: u.phoneNumber,
    workplace: u.workplace,
    academicDegree: u.academicDegree,
    profilePhotoUrl: u.profilePhotoUrl,
    consentAcceptedAt: u.consentAcceptedAt ? u.consentAcceptedAt.toISOString() : null,
    approvedAt: u.approvedAt ? u.approvedAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
  };
}
