/**
 * Dashboard App Component
 * Handles routing and auth state management.
 */

import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { supabase, initAuthListener } from '../lib/supabase';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';

/**
 * Protected Route wrapper
 * Redirects to /login if not authenticated
 */
function ProtectedRoute({
    children,
    session,
    loading
}: {
    children: React.ReactNode;
    session: Session | null;
    loading: boolean;
}) {
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p>Loading...</p>
            </div>
        );
    }

    if (!session) {
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
}

/**
 * Main Dashboard App
 */
function App() {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Initialize auth listener
        initAuthListener();

        // Check current session
        const checkSession = async () => {
            try {
                const { data: { session: currentSession } } = await supabase.auth.getSession();
                setSession(currentSession);
            } catch (error) {
                console.error('Failed to get session:', error);
            } finally {
                setLoading(false);
            }
        };

        checkSession();

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    return (
        <Routes>
            <Route
                path="/login"
                element={
                    session && !loading ? (
                        <Navigate to="/" replace />
                    ) : (
                        <LoginPage />
                    )
                }
            />
            <Route
                path="/"
                element={
                    <ProtectedRoute session={session} loading={loading}>
                        <HomePage session={session} />
                    </ProtectedRoute>
                }
            />
            {/* Catch all - redirect to home */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

export default App;
