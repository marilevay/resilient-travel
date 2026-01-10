import "../styles/globals.css";

export const metadata = {
  title: "Failproof Travel",
  description: "Agentic travel planning with memory"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
