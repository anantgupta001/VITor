"use client";

import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/app/context/auth-context";

export default function Providers({ children }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
    >
      <AuthProvider>
        {children}
      </AuthProvider>
    </ThemeProvider>
  );
}
