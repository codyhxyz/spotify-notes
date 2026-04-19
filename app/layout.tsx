import "./globals.css";
import { Providers } from "./providers";

export const metadata = {
  title: "My Song Notes",
  description: "A private journal for the songs you're listening to.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
