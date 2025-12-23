import "./globals.css";
import { AuthProvider } from "@/app/context/AuthContext";

export const metadata = {
  title: "VITor",
  description: "VIT-AP Faculty Rating Platform",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-white text-black">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
