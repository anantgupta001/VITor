import "./globals.css";
import Providers from "./providers";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata = {
  title: "VITor",
  description: "Faculty Rating Platform",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen flex flex-col bg-slate-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        
        <Providers>

          {/* 🌐 GLOBAL NAVBAR */}
          <Navbar />

          {/* 📄 PAGE CONTENT */}
          <main className="flex-1">
            {children}
          </main>

          {/* 🌐 GLOBAL FOOTER */}
          <Footer />

        </Providers>

      </body>
    </html>
  );
}
