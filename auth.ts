import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages:   { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email:    { label: "Email",    type: "email"    },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // Import db lazily to avoid edge-runtime issues
        const { default: db } = await import("@/lib/db");
        const user = db
          .prepare("SELECT * FROM users WHERE email = ?")
          .get(credentials.email) as {
            id: number; name: string; email: string;
            password_hash: string; role: string; foreman_name: string | null;
          } | undefined;

        if (!user) return null;

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.password_hash,
        );
        if (!valid) return null;

        return {
          id:          String(user.id),
          name:        user.name,
          email:       user.email,
          role:        user.role,
          foremanName: user.foreman_name ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        // @ts-expect-error custom fields
        token.role        = user.role;
        // @ts-expect-error custom fields
        token.foremanName = user.foremanName;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        // @ts-expect-error custom fields
        session.user.role        = token.role;
        // @ts-expect-error custom fields
        session.user.foremanName = token.foremanName;
      }
      return session;
    },
  },
});
