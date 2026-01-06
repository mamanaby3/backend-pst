import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { query } from "@/lib/db";

const handler = NextAuth({
    providers: [
        Credentials({
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" }
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) {
                    return null;
                }

                try {
                    const res = await query(
                        `SELECT id, email, name, password, role FROM users WHERE email = $1`,
                        [credentials.email]
                    );

                    const user = res.rows[0];

                    if (!user) {
                        return null;
                    }

                    // TODO: Remplacer par bcrypt.compare en production
                    const isValidPassword = credentials.password === user.password;

                    if (!isValidPassword) {
                        return null;
                    }

                    // ✅ Retourner avec role
                    return {
                        id: String(user.id),
                        email: user.email,
                        name: user.name,
                        role: user.role, // ✅ role est maintenant typé
                    };
                } catch (error) {
                    console.error('Auth error:', error);
                    return null;
                }
            }
        }),
    ],
    callbacks: {
        async jwt({ token, user }) {
            // ✅ user.role est maintenant reconnu
            if (user) {
                token.id = user.id;
            }
            return token;
        },
        async session({ session, token }) {
            //   token.role est maintenant reconnu
            if (session.user) {
                session.user.id = Number(token.id);
            }
            return session;
        },
    },
    session: {
        strategy: "jwt",
    },
});

export { handler as GET, handler as POST };
