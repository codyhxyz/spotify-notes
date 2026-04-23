"use client";
import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";
import { applyTheme, loadTheme } from "../util/theme";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    applyTheme(loadTheme());
  }, []);
  return <SessionProvider>{children}</SessionProvider>;
}
