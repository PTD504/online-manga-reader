/**
 * Authentication Component
 * 
 * Email/Password login and signup form for Supabase Auth.
 * Features separate Login and Sign Up views with password confirmation.
 */

import { useState, FormEvent } from 'react';
import { supabase, syncTokenToStorage } from '../lib/supabase';

type AuthMode = 'login' | 'signup';

interface AuthProps {
    onAuthSuccess?: () => void;
}

/**
 * Map common Supabase error messages to user-friendly text.
 */
function getErrorMessage(error: Error): string {
    const message = error.message.toLowerCase();

    if (message.includes('invalid login credentials')) {
        return 'Invalid email or password. Please try again.';
    }
    if (message.includes('email not confirmed')) {
        return 'Please confirm your email before signing in.';
    }
    if (message.includes('user already registered')) {
        return 'An account with this email already exists.';
    }
    if (message.includes('password should be at least')) {
        return 'Password must be at least 6 characters long.';
    }
    if (message.includes('invalid email')) {
        return 'Please enter a valid email address.';
    }
    if (message.includes('rate limit')) {
        return 'Too many attempts. Please wait a moment and try again.';
    }

    return error.message || 'An unexpected error occurred.';
}

/**
 * Auth component for email/password authentication.
 */
function Auth({ onAuthSuccess }: AuthProps) {
    const [mode, setMode] = useState<AuthMode>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    /**
     * Switch between login and signup modes
     */
    const switchMode = (newMode: AuthMode): void => {
        setMode(newMode);
        setError(null);
        setMessage(null);
        setPassword('');
        setConfirmPassword('');
    };

    /**
     * Validate form inputs
     */
    const validateForm = (): boolean => {
        if (!email.trim()) {
            setError('Please enter your email address.');
            return false;
        }
        if (!password) {
            setError('Please enter your password.');
            return false;
        }
        if (password.length < 6) {
            setError('Password must be at least 6 characters long.');
            return false;
        }
        if (mode === 'signup' && password !== confirmPassword) {
            setError('Passwords do not match. Please try again.');
            return false;
        }
        return true;
    };

    /**
     * Handle form submission for login/signup
     */
    const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
        e.preventDefault();
        setError(null);
        setMessage(null);

        if (!validateForm()) {
            return;
        }

        setLoading(true);

        try {
            if (mode === 'signup') {
                const { error: signUpError } = await supabase.auth.signUp({
                    email,
                    password,
                });

                if (signUpError) {
                    throw signUpError;
                }

                setMessage('Account created. Check your email for confirmation link.');
            } else {
                const { error: signInError } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });

                if (signInError) {
                    throw signInError;
                }

                await syncTokenToStorage();
                onAuthSuccess?.();
            }
        } catch (err) {
            const errorMessage = err instanceof Error
                ? getErrorMessage(err)
                : 'Authentication failed. Please try again.';
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            {/* Mode Selector Tabs */}
            <div className="auth-tabs">
                <button
                    type="button"
                    className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
                    onClick={() => switchMode('login')}
                    disabled={loading}
                >
                    Login
                </button>
                <button
                    type="button"
                    className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
                    onClick={() => switchMode('signup')}
                    disabled={loading}
                >
                    Sign Up
                </button>
            </div>

            <form onSubmit={handleSubmit} className="auth-form">
                {/* Email Field */}
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
                        autoComplete="email"
                    />
                </div>

                {/* Password Field */}
                <div className="auth-field">
                    <label htmlFor="password">Password</label>
                    <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter password"
                        required
                        disabled={loading}
                        minLength={6}
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    />
                    {mode === 'signup' && (
                        <span className="auth-hint">Minimum 6 characters</span>
                    )}
                </div>

                {/* Confirm Password Field (Sign Up only) */}
                {mode === 'signup' && (
                    <div className="auth-field">
                        <label htmlFor="confirm-password">Confirm Password</label>
                        <input
                            id="confirm-password"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Confirm password"
                            required
                            disabled={loading}
                            minLength={6}
                            autoComplete="new-password"
                        />
                    </div>
                )}

                {/* Error Message */}
                {error && (
                    <div className="auth-error" role="alert">
                        {error}
                    </div>
                )}

                {/* Success Message */}
                {message && (
                    <div className="auth-message" role="status">
                        {message}
                    </div>
                )}

                {/* Submit Button */}
                <button
                    type="submit"
                    className="auth-button"
                    disabled={loading}
                >
                    {loading
                        ? 'Please wait...'
                        : mode === 'signup'
                            ? 'Create Account'
                            : 'Sign In'
                    }
                </button>
            </form>
        </div>
    );
}

export default Auth;
