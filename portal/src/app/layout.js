import './globals.css'

export const metadata = {
  title: 'SIPaaS — SIP as a Service',
  description: 'Your SIP Trunk & DID Management Portal',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 min-h-screen">{children}</body>
    </html>
  )
}
