/**
 * Home Page Component
 * Displays user profile info, credits, and logout functionality.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { supabase, signOut } from '../../lib/supabase';

interface UserProfile {
    id: string;
    email: string;
    credits: number;
    subscription_tier: string;
    created_at: string;
}

interface HomePageProps {
    session: Session | null;
}

function HomePage({ session }: HomePageProps) {
    const navigate = useNavigate();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    /**
     * Fetch user profile from Supabase
     */
    useEffect(() => {
        const fetchProfile = async () => {
            if (!session?.user?.id) {
                setLoading(false);
                return;
            }

            try {
                const { data, error: fetchError } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', session.user.id)
                    .single();

                if (fetchError) {
                    throw fetchError;
                }

                setProfile(data);
            } catch (err) {
                console.error('Failed to fetch profile:', err);
                setError('Failed to load profile data.');
            } finally {
                setLoading(false);
            }
        };

        fetchProfile();
    }, [session]);

    /**
     * Handle logout
     */
    const handleLogout = async () => {
        await signOut();
        navigate('/login');
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <p>Loading profile...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 p-4">
            <div className="max-w-md mx-auto bg-white rounded border p-6">
                <h1 className="text-xl font-bold mb-4">
                    Manga Translator Dashboard
                </h1>

                {error && (
                    <div className="p-3 mb-4 bg-red-100 border border-red-300 text-red-700 rounded text-sm">
                        {error}
                    </div>
                )}

                {/* User Info */}
                <div className="space-y-3 mb-6">
                    <div className="flex justify-between items-center py-2 border-b">
                        <span className="text-gray-600">Email</span>
                        <span className="font-medium">
                            {profile?.email || session?.user?.email || 'N/A'}
                        </span>
                    </div>

                    <div className="flex justify-between items-center py-2 border-b">
                        <span className="text-gray-600">Credits</span>
                        <span className="font-medium text-blue-600">
                            {profile?.credits ?? 'Loading...'}
                        </span>
                    </div>

                    <div className="flex justify-between items-center py-2 border-b">
                        <span className="text-gray-600">Subscription</span>
                        <span className="font-medium capitalize">
                            {profile?.subscription_tier || 'free'}
                        </span>
                    </div>

                    <div className="flex justify-between items-center py-2 border-b">
                        <span className="text-gray-600">Member Since</span>
                        <span className="font-medium">
                            {profile?.created_at
                                ? new Date(profile.created_at).toLocaleDateString()
                                : 'N/A'
                            }
                        </span>
                    </div>
                </div>

                {/* Logout Button */}
                <button
                    onClick={handleLogout}
                    className="w-full py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                >
                    Logout
                </button>
            </div>
        </div>
    );
}

export default HomePage;
