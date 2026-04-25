// Auth.js v5: the NextAuth() factory in lib/auth.ts produced the route
// handlers; we destructure them onto GET/POST exports here.
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
