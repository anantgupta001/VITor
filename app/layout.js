import "./globals.css";
import Providers from "@/app/providers";
import Navbar from "@/components/Navbar";

export const metadata = {
  title: "VITor",
  description: "Faculty Rating Platform",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          <Navbar />
          {children}
        </Providers>
      </body>
    </html>
  );
}
