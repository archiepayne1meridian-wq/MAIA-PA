import MaiaChatBar from './components/MaiaChatBar'

export const dynamic = 'force-dynamic'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <MaiaChatBar />
    </>
  )
}
