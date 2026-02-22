import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? ""
    })
  ],
  session: {
    strategy: "jwt"
  },
  pages: {
    signIn: "/"
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      // Persist basic profile from Google
      if (account && profile && profile.email) {
        token.email = profile.email as string;
        token.name = (profile.name as string | undefined) ?? token.name;
        token.picture = ((profile as Record<string, unknown>).picture as string | undefined) ?? token.picture;
        token.sub = token.sub ?? (profile.sub as string | undefined) ?? account.providerAccountId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.sub as string | undefined) ?? (token.email as string | undefined) ?? "";
        session.user.email = (token.email as string | undefined) ?? session.user.email ?? "";
        session.user.name = (token.name as string | undefined) ?? session.user.name ?? undefined;
        session.user.image = (token.picture as string | undefined) ?? session.user.image ?? undefined;
      }
      return session;
    }
  }
};
