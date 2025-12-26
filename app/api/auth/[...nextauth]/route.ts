import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { query } from "@/lib/db";

const handler = NextAuth({
    providers: [
        Credentials({
            credentials: undefined, id: "", name: "", type: "credentials",
            async authorize(credentials) {
                const res = await query(
                    `SELECT id, email, name FROM users WHERE email = $1`,
                    [credentials?.email]
                );
                return res.rows[0] ?? null;
            }
        }),
    ],
    callbacks: {
        async session({ session, token }) {
            if (session.user && token.sub) {
                session.user.id = Number(token.sub);
            }
            return session;
        },
    },
});

export { handler as GET, handler as POST };
