/**
 * Login Page Component
 * Handles Email/Password login and signup with Supabase Auth.
 */

import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

type AuthMode = 'login' | 'signup';

/**
 * Map Supabase errors to user-friendly messages
 */
function getErrorMessage(error: Error): string {
    const message = error.message.toLowerCase();

    if (message.includes('invalid login credentials')) {
        return 'Invalid email or password.';
    }
    if (message.includes('email not confirmed')) {
        return 'Please confirm your email before signing in.';
    }
    if (message.includes('user already registered')) {
        return 'An account with this email already exists.';
    }
    if (message.includes('password should be at least')) {
        return 'Password must be at least 6 characters.';
    }
    if (message.includes('rate limit')) {
        return 'Too many attempts. Please wait and try again.';
    }

    return error.message || 'An unexpected error occurred.';
}

function LoginPage() {
    const navigate = useNavigate();
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
    const switchMode = (newMode: AuthMode) => {
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
            setError('Please enter your email.');
            return false;
        }
        if (!password) {
            setError('Please enter your password.');
            return false;
        }
        if (password.length < 6) {
            setError('Password must be at least 6 characters.');
            return false;
        }
        if (mode === 'signup' && password !== confirmPassword) {
            setError('Passwords do not match.');
            return false;
        }
        return true;
    };

    /**
     * Handle form submission
     */
    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setMessage(null);

        if (!validateForm()) return;

        setLoading(true);

        try {
            if (mode === 'signup') {
                const { error: signUpError } = await supabase.auth.signUp({
                    email,
                    password,
                });

                if (signUpError) throw signUpError;

                setMessage('Account created! Check your email for confirmation link.');
            } else {
                const { error: signInError } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });

                if (signInError) throw signInError;

                // Redirect to home on success
                navigate('/');
            }
        } catch (err) {
            const errorMessage = err instanceof Error
                ? getErrorMessage(err)
                : 'Authentication failed.';
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
            <div className="w-full max-w-md bg-white rounded border p-6">
                <h1 className="text-xl font-bold mb-4 text-center">
                    Manga Translator
                </h1>

                {/* Mode Tabs */}
                <div className="flex border-b mb-4">
                    <button
                        type="button"
                        className={`flex-1 py-2 text-center ${mode === 'login'
                                ? 'border-b-2 border-blue-500 font-medium'
                                : 'text-gray-500'
                            }`}
                        onClick={() => switchMode('login')}
                        disabled={loading}
                    >
                        Login
                    </button>
                    <button
                        type="button"
                        className={`flex-1 py-2 text-center ${mode === 'signup'
                                ? 'border-b-2 border-blue-500 font-medium'
                                : 'text-gray-500'
                            }`}
                        onClick={() => switchMode('signup')}
                        disabled={loading}
                    >
                        Sign Up
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Email */}
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium mb-1">
                            Email
                        </label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            required
                            disabled={loading}
                            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                    </div>

                    {/* Password */}
                    <div>
                        <label htmlFor="password" className="block text-sm font-medium mb-1">
                            Password
                        </label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter password"
                            required
                            disabled={loading}
                            minLength={6}
                            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        {mode === 'signup' && (
                            <p className="text-xs text-gray-500 mt-1">Minimum 6 characters</p>
                        )}
                    </div>

                    {/* Confirm Password (Sign Up only) */}
                    {mode === 'signup' && (
                        <div>
                            <label htmlFor="confirm-password" className="block text-sm font-medium mb-1">
                                Confirm Password
                            </label>
                            <input
                                id="confirm-password"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Confirm password"
                                required
                                disabled={loading}
                                minLength={6}
                                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                        </div>
                    )}

                    {/* Error Message */}
                    {error && (
                        <div className="p-3 bg-red-100 border border-red-300 text-red-700 rounded text-sm">
                            {error}
                        </div>
                    )}

                    {/* Success Message */}
                    {message && (
                        <div className="p-3 bg-green-100 border border-green-300 text-green-700 rounded text-sm">
                            {message}
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
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
        </div>
    );
}

export default LoginPage;
