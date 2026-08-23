import { Sidebar } from "@/components/sidebar"
import { Home } from "@/pages/home"

export function App() {
  return (
    <div className="relative flex h-svh min-w-0 bg-[#0f0f0f]">
      <span className="pointer-events-none absolute inset-x-0 top-10 flex h-8 items-center justify-center text-[1.25rem] font-medium text-white">
        Home
      </span>
      <Sidebar />
      <Home />
    </div>
  )
}

export default App
