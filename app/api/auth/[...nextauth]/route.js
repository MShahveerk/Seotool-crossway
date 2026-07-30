import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getUserByEmail, verifyPassword } from "../../../../lib/auth";
import { logger } from "../../../../lib/logger";
import { resolveModulePermissions } from "../../../../lib/modulePermissions";

/** Only use Secure / __Secure- cookies when the app is served over HTTPS (e.g. Vercel). On http://localhost, secure cookies are not stored — `npm run start` would break login/session. */
const useSecureCookies =
  typeof process.env.NEXTAUTH_URL === "string" && process.env.NEXTAUTH_URL.startsWith("https://");

function withTimeout(promise, timeoutMs, timeoutError) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(timeoutError), timeoutMs);
    }),
  ]);
}

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const normalizedEmail = credentials.email.toLowerCase().trim();
        const safeEmail =
          normalizedEmail.length > 3
            ? `${normalizedEmail.slice(0, 3)}***`
            : "***";

        let user;
        try {
          user = await withTimeout(
            getUserByEmail(normalizedEmail),
            9000,
            new Error("Database lookup timed out")
          );
        } catch (error) {
          logger.error("Credentials auth database lookup failed", {
            email: safeEmail,
            reason: error.message,
          });
          throw new Error("DATABASE_UNAVAILABLE");
        }

        if (!user) {
          logger.warn("Login rejected: user not found", { email: safeEmail });
          throw new Error("INVALID_CREDENTIALS");
        }

        if (user.isActive === false) {
          logger.warn("Login rejected: account inactive", { email: safeEmail });
          throw new Error("ACCOUNT_INACTIVE");
        }

        // Block unverified users from logging in
        if (user.emailVerified === false || user.status === "pending") {
          logger.warn("Login rejected: email not verified", { email: safeEmail });
          throw new Error("EMAIL_NOT_VERIFIED");
        }

        const isValid = await verifyPassword(credentials.password, user.password);
        if (!isValid) {
          logger.warn("Login rejected: invalid password", { email: safeEmail });
          throw new Error("INVALID_CREDENTIALS");
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role || "user",
          modulePermissions: user.modulePermissions ?? null,
          resolvedPermissions: resolveModulePermissions(user),
          siteLink: user.siteLink || null,
          gtmContainerId: user.gtmContainerId || null,
          facebookPageId: user.facebookPageId || null,
          instagramUserId: user.instagramUserId || null,
          accessibleSites: user.accessibleSites || (user.siteLink ? [user.siteLink] : []),
        };
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 24 hours
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.role = user.role;
        token.modulePermissions = user.modulePermissions ?? null;
        token.resolvedPermissions = user.resolvedPermissions ?? resolveModulePermissions(user);
        token.siteLink = user.siteLink;
        token.gtmContainerId = user.gtmContainerId || null;
        token.facebookPageId = user.facebookPageId || null;
        token.instagramUserId = user.instagramUserId || null;
        token.accessibleSites = user.accessibleSites;
      } else if (token.email) {
        // Refresh user data on each token refresh (must not throw — breaks /api/auth/session)
        try {
          const userData = await withTimeout(
            getUserByEmail(token.email),
            8000,
            new Error("JWT refresh user lookup timed out")
          );
          if (userData && userData.isActive !== false) {
            token.role = userData.role || "user";
            token.modulePermissions = userData.modulePermissions ?? null;
            token.resolvedPermissions = resolveModulePermissions(userData);
            token.siteLink = userData.siteLink || null;
            token.gtmContainerId = userData.gtmContainerId || null;
            token.facebookPageId = userData.facebookPageId || null;
            token.instagramUserId = userData.instagramUserId || null;
            token.accessibleSites =
              userData.accessibleSites || (userData.siteLink ? [userData.siteLink] : []);
          }
        } catch (err) {
          logger.warn("JWT refresh skipped; using existing token claims", { reason: err?.message });
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.email = token.email;
        session.user.name = token.name;
        session.user.role = token.role || "user";
        session.user.modulePermissions = token.modulePermissions ?? null;
        session.user.resolvedPermissions = token.resolvedPermissions ?? null;
        session.user.siteLink = token.siteLink || null;
        session.user.gtmContainerId = token.gtmContainerId || null;
        session.user.facebookPageId = token.facebookPageId || null;
        session.user.instagramUserId = token.instagramUserId || null;
        session.user.accessibleSites = token.accessibleSites || [];
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || (process.env.NODE_ENV === "production" ? undefined : "development-secret-change-in-production"),
  cookies: {
    sessionToken: {
      name: useSecureCookies ? "__Secure-next-auth.session-token" : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };

