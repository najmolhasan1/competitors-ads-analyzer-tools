import './globals.css';

export const metadata = {
  title: 'Meta Ads Intelligence',
  description: 'যেকোনো ব্র্যান্ডের Meta Ad Strategy ডিকোড করুন নিমিষেই',
};

export default function RootLayout({ children }) {
  return (
    <html lang="bn">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Mozilla+Text:wght@200..700&family=Noto+Serif+Bengali:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js" />
        <script src="https://cdn.jsdelivr.net/npm/chart.js" />
        {children}
      </body>
    </html>
  );
}
