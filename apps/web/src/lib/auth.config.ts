import type { NextAuthConfig } from 'next-auth';
import type { Role } from '@prisma/client';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & import('next-auth').DefaultSession['user'];
  }

  interface User {
    role: Role;
  }
}

export const authConfig: NextAuthConfig = {
  session: { strategy: 'jwt' },
  trustHost: true,
  pages: { signIn: '/login' },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as { id?: string; role?: Role };
        if (u.id) token.id = u.id;
        if (u.role) token.role = u.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string | undefined) ?? session.user.id;
        session.user.role = (token.role as Role | undefined) ?? session.user.role;
      }
      return session;
    },
  },
};
