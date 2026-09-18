import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider, useApp } from './context/AppContext';
import { AutoBackupService } from './services/backup';

import { SplashScreen } from './components/common/SplashScreen';
import { LoginRegister } from './pages/Auth/LoginRegister';
import { Dashboard } from './pages/Dashboard';
import { CustomerList } from './pages/Customers/CustomerList';
import { CustomerDetail } from './pages/Customers/CustomerDetail';
import { CollectionManager } from './pages/Collections/CollectionManager';
import { BishiManager } from './pages/Bishi/BishiManager';
import { LoanManager } from './pages/Loans/LoanManager';
import { InterestManager } from './pages/Interest/InterestManager';
import { PenaltyManager } from './pages/Penalty/PenaltyManager';
import { ReportManager } from './pages/Reports/ReportManager';
import { SmsLogs } from './pages/Sms/SmsLogs';
import { BackupManager } from './pages/Backup/BackupManager';
import { ProfileManager } from './pages/Profile/ProfileManager';
import { SettingsManager } from './pages/Settings/SettingsManager';

import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { BottomNav } from './components/layout/BottomNav';
import { ToastContainer } from './components/common/ToastContainer';
import { ConfirmModal } from './components/common/ConfirmModal';

const ProtectedLayout: React.FC = () => {
  const { currentAdmin, logout } = useAuth();
  const { showToast, language } = useApp();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const location = useLocation();

  // Automatic Local 2-Day Backup Runner
  useEffect(() => {
    if (!currentAdmin) return;

    // Check shortly after app loads
    const timeoutId = setTimeout(() => {
      AutoBackupService.checkAndRunAutoBackup((snapshot, filename) => {
        showToast(
          language === 'EN'
            ? `Automatic 2-day backup saved to this device: ${filename}`
            : `स्वयंचलित २-दिवसीय बॅकअप डिव्हाइसवर सेव्ह झाला: ${filename}`,
          'success'
        );
      });
    }, 2500);

    // Periodic check every 1 hour while the app remains open
    const intervalId = setInterval(() => {
      AutoBackupService.checkAndRunAutoBackup((snapshot, filename) => {
        showToast(
          language === 'EN'
            ? `Automatic 2-day backup saved to this device: ${filename}`
            : `स्वयंचलित २-दिवसीय बॅकअप डिव्हाइसवर सेव्ह झाला: ${filename}`,
          'success'
        );
      });
    }, 60 * 60 * 1000);

    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [currentAdmin, language, showToast]);

  if (!currentAdmin) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-[#F4F6F5] flex flex-col lg:flex-row">
      {/* Dark Forest Green Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onLogoutClick={() => setIsLogoutModalOpen(true)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:pl-64 min-w-0 bg-[#F4F6F5]">
        <Header onMenuToggle={() => setIsSidebarOpen(!isSidebarOpen)} />
        <main className="flex-1 p-3 sm:p-6 pb-24 lg:pb-6 max-w-7xl w-full mx-auto bg-[#F4F6F5]">
          <div key={location.pathname} className="animate-page-enter">
            <Routes location={location}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/customers" element={<CustomerList />} />
              <Route path="/customers/:id" element={<CustomerDetail />} />
              <Route path="/collections" element={<CollectionManager />} />
              <Route path="/bishi" element={<BishiManager />} />
              <Route path="/loans" element={<LoanManager />} />
              <Route path="/interest" element={<InterestManager />} />
              <Route path="/penalty" element={<PenaltyManager />} />
              <Route path="/reports" element={<ReportManager />} />
              <Route path="/sms" element={<SmsLogs />} />
              <Route path="/backup" element={<BackupManager />} />
              <Route path="/profile" element={<ProfileManager />} />
              <Route path="/settings" element={<SettingsManager />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <BottomNav onMenuToggle={() => setIsSidebarOpen(true)} />

      {/* Toast Notifications */}
      <ToastContainer />

      {/* Logout Confirmation Modal */}
      <ConfirmModal
        isOpen={isLogoutModalOpen}
        title={language === 'EN' ? 'Logout' : 'बाहेर पडा'}
        message={language === 'EN' ? 'Are you sure you want to log out?' : 'तुम्हाला बाहेर पडायचे आहे का?'}
        confirmText={language === 'EN' ? 'Logout' : 'बाहेर पडा'}
        cancelText={language === 'EN' ? 'Cancel' : 'रद्द करा'}
        isDanger={true}
        onConfirm={() => {
          logout();
          setIsLogoutModalOpen(false);
        }}
        onCancel={() => setIsLogoutModalOpen(false)}
      />
    </div>
  );
};

export const AppContent: React.FC = () => {
  const { currentAdmin, loading } = useAuth();
  const { language } = useApp();
  const [showSplash, setShowSplash] = useState(true);

  if (showSplash) {
    return (
      <SplashScreen
        appName={language === 'EN' ? 'Sushant Bishi' : 'सुषांत भिशी'}
        tagline={language === 'EN' ? 'Trust & Prosperity Management' : 'विश्वासाची साथ, समृद्धीची वाट'}
        onFinish={() => setShowSplash(false)}
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B5C45] text-white flex items-center justify-center font-bold text-lg">
        {language === 'EN' ? 'Loading Sushant Bishi...' : 'सुषांत भिशी लोड होत आहे...'}
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={currentAdmin ? <Navigate to="/dashboard" replace /> : <LoginRegister />}
      />
      <Route path="/*" element={<ProtectedLayout />} />
    </Routes>
  );
};

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppProvider>
          <AppContent />
        </AppProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
