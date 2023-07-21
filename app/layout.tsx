import "./globals.css";
import { Inter, Open_Sans } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });
const opensans = Open_Sans({ subsets: ["latin"], weight: "500" });

export const metadata = {
  title: "My Spotify Notes",
  description: "Connecting your thoughts about music",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={opensans.className}>{children}</body>
    </html>
  );
}
