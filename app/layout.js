import "./globals.css";
import Providers from "@/app/providers";

export const metadata = {
  title: "VITor",
  description: "Faculty Rating Platform",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
