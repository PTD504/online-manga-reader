/**
 * Authentication Component
 * 
 * Email/Password login and signup form for Supabase Auth.
 * Designed for Chrome extension popup environment.
 */

import { useState, FormEvent } from 'react';
import { supabase, syncTokenToStorage } from '../lib/supabase';

interface AuthProps {
    onAuthSuccess?: () => void;
}

/**
 * Auth component for email/password authentication.
 */
function Auth({ onAuthSuccess }: AuthProps) {
    const [isSignUp, setIsSignUp] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    /**
     * Handle form submission for login/signup
     */
    const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setMessage(null);

        try {
            if (isSignUp) {
                // Sign up new user
                const { error: signUpError } = await supabase.auth.signUp({
                    email,
                    password,
                });

                if (signUpError) {
                    throw signUpError;
                }

                setMessage('Check your email for confirmation link!');
            } else {
                // Sign in existing user
                const { error: signInError } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });

                if (signInError) {
                    throw signInError;
                }

                // Sync token to Chrome storage
                await syncTokenToStorage();
                onAuthSuccess?.();
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Authentication failed';
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <h2 className="auth-title">
                {isSignUp ? 'Create Account' : 'Sign In'}
            </h2>

            <form onSubmit={handleSubmit} className="auth-form">
                <div className="auth-field">
                    <label htmlFor="email">Email</label>
                    <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        required
                        disabled={loading}
                    />
                </div>

                <div className="auth-field">
                    <label htmlFor="password">Password</label>
                    <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Your password"
                        required
                        disabled={loading}
                        minLength={6}
                    />
                </div>

                {error && (
                    <div className="auth-error">{error}</div>
                )}

                {message && (
                    <div className="auth-message">{message}</div>
                )}

                <button
                    type="submit"
                    className="auth-button"
                    disabled={loading}
                >
                    {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
                </button>
            </form>

            <button
                type="button"
                className="auth-toggle"
                onClick={() => {
                    setIsSignUp(!isSignUp);
                    setError(null);
                    setMessage(null);
                }}
                disabled={loading}
            >
                {isSignUp
                    ? 'Already have an account? Sign In'
                    : "Don't have an account? Sign Up"}
            </button>
        </div>
    );
}

export default Auth;
