export const metadata = {
  title: 'Chatbot',
  description: 'experiment',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}