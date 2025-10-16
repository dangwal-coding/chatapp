import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login/Login'
import Signup from './pages/Signup/Signup'
import Home from './pages/Home/Home'
import ChatRoute from './pages/Chat/ChatRoute'

// ProtectedRoute wrapper
function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token')
  const username = localStorage.getItem('username')
  if (!token || !username) {
    return <Navigate to="/" replace />
  }
  return children
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/home" element={<Home />} />
        <Route path="/chat" element={
          <ProtectedRoute>
            <ChatRoute />
          </ProtectedRoute>
        } />
      </Routes>
    </BrowserRouter>
  )
}

export default App
