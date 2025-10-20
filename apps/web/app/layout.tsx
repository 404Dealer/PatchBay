export const metadata = {
  title: 'Patchbay',
  description: 'Communications-first CRM',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}


