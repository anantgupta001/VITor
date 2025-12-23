import "./globals.css";
import { AuthProvider } from "@/app/context/AuthContext";

export const metadata = {
  title: "VITor",
  description: "Faculty Rating Platform",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-slate-100 text-gray-900">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
