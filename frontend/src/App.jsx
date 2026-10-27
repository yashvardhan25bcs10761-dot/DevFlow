import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { ThemeProvider } from './contexts/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Repositories from './pages/Repositories';
import RepositoryDetail from './pages/RepositoryDetail';
import AnalysisHistory from './pages/AnalysisHistory';
import AnalysisDetail from './pages/AnalysisDetail';
import Issues from './pages/Issues';
import PullRequests from './pages/PullRequests';
import Landing from './pages/Landing';
import Settings from './pages/Settings';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route element={<ProtectedRoute><Navbar /></ProtectedRoute>}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/repositories" element={<Repositories />} />
              <Route path="/issues" element={<Issues />} />
              <Route path="/pull-requests" element={<PullRequests />} />
              <Route path="/history" element={<AnalysisHistory />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/repositories/:repoId" element={<RepositoryDetail />} />
              <Route path="/repositories/:repoId/history" element={<AnalysisHistory />} />
              <Route path="/analyses/:analysisId" element={<AnalysisDetail />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
