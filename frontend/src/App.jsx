import { Routes, Route, NavLink } from 'react-router-dom'
import { ShoppingCart, Tv2 } from 'lucide-react'
import OrdersPage from './pages/OrdersPage.jsx'
import LiveListingPage from './pages/LiveListingPage.jsx'

export default function App() {
  return (
    <div className="min-h-screen flex flex-col bg-[#0f0f0f]">
      {/* Top nav */}
      <nav className="sticky top-0 z-50 bg-[#161616] border-b border-white/10 px-4 py-3 flex items-center gap-6">
        <span className="text-pink-500 font-bold text-lg tracking-tight">TikShop Admin</span>
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-colors ${
              isActive ? 'bg-pink-600 text-white' : 'text-gray-400 hover:text-white'
            }`
          }
        >
          <ShoppingCart size={15} /> Orders
        </NavLink>
        <NavLink
          to="/live-listing"
          className={({ isActive }) =>
            `flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-colors ${
              isActive ? 'bg-pink-600 text-white' : 'text-gray-400 hover:text-white'
            }`
          }
        >
          <Tv2 size={15} /> Live Listing
        </NavLink>
      </nav>

      {/* Page content */}
      <main className="flex-1 p-4 max-w-5xl mx-auto w-full">
        <Routes>
          <Route path="/" element={<OrdersPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/live-listing" element={<LiveListingPage />} />
        </Routes>
      </main>
    </div>
  )
}
