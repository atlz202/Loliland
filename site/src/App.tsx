import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import Layout from './components/Layout'
import RequireAuth from './components/RequireAuth'
import Cabinet from './pages/Cabinet'
import ChooseNickname from './pages/ChooseNickname'
import Home from './pages/Home'
import Join from './pages/Join'
import Login from './pages/Login'
import NotFound from './pages/NotFound'
import Register from './pages/Register'
import ResetPassword from './pages/ResetPassword'
import TeamPage from './pages/Team'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="login" element={<Login />} />
            <Route path="register" element={<Register />} />
            <Route path="reset" element={<ResetPassword />} />
            <Route path="nickname" element={<ChooseNickname />} />
            <Route path="cabinet" element={<RequireAuth><Cabinet /></RequireAuth>} />
            <Route path="team/:id" element={<RequireAuth><TeamPage /></RequireAuth>} />
            <Route path="join/:teamId/:token" element={<Join />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
