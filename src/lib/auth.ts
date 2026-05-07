import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import { authConfig } from './auth.config';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Пароль', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== 'string' || typeof password !== 'string') {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
        });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        // Block sign-in until an admin has approved the account.
        // Throwing a CredentialsSignin error with a descriptive message
        // surfaces it to the login form.
        if (!user.approvedAt) {
          throw new Error('PendingApproval');
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatar ?? null,
          role: user.role,
        };
      },
    }),
  ],
});
