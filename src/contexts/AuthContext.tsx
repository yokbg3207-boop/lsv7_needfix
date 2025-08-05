import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { SubscriptionService } from '../services/subscriptionService';

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  settings: any;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  restaurant: Restaurant | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, metadata: {
    firstName: string;
    lastName: string;
    restaurantName: string;
  }) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let timeoutId: NodeJS.Timeout;

    const getInitialSession = async () => {
      try {
        console.log('🔄 Getting initial session...');
        
        // Set timeout to prevent infinite loading
        timeoutId = setTimeout(() => {
          if (mounted && loading) {
            console.warn('⏰ Auth operation timeout, continuing...');
            setLoading(false);
          }
        }, 15000); // Increased timeout

        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (!mounted) return;
        
        if (error) {
          console.error('❌ Error getting session:', error);
          setLoading(false);
          return;
        }

        console.log('✅ Session retrieved:', session?.user?.id || 'No user');
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          console.log('👤 User found, fetching restaurant...');
          fetchRestaurant(session.user.id).finally(() => {
            if (mounted) setLoading(false);
          });
        } else {
          console.log('👤 No user, setting loading to false');
          setLoading(false);
        }
      } catch (error) {
        console.error('💥 Error in getInitialSession:', error);
        if (mounted) {
          setLoading(false);
        }
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    };

    getInitialSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('🔄 Auth state changed:', event, session?.user?.id || 'No user');
        if (!mounted) return;
        
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          fetchRestaurant(session.user.id).finally(() => {
            if (mounted) setLoading(false);
          });
        } else {
          setRestaurant(null);
          setLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      subscription.unsubscribe();
    };
  }, []);

  const fetchRestaurant = async (userId: string) => {
    try {
      console.log('🏪 Fetching restaurant for user:', userId);
      
      const { data, error } = await Promise.race([
        supabase
          .from('restaurants')
          .select('id, name, slug, settings')
          .eq('owner_id', userId)
          .limit(1),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database query timeout')), 15000) // Increased timeout
        )
      ]) as any;

      if (error) {
        console.error('❌ Error fetching restaurant:', error);
        setRestaurant(null);
        return;
      }

      if (data && data.length > 0) {
        console.log('✅ Restaurant found:', data[0].name);
        setRestaurant(data[0]);
        return;
      }

      // If no restaurant exists, create one (but don't block the UI)
      console.log('🏗️ No restaurant found, creating default restaurant...');
      createDefaultRestaurant(userId).catch(error => {
        console.error('Failed to create default restaurant:', error);
      });
      
    } catch (error) {
      console.error('💥 Error in fetchRestaurant:', error);
      setRestaurant(null);
    }
  };

  const createDefaultRestaurant = async (userId: string) => {
    try {
      // First check if restaurant already exists for this user
      const { data: existingRestaurant, error: checkError } = await supabase
        .from('restaurants')
        .select('*')
        .eq('owner_id', userId)
        .limit(1);

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('❌ Error checking existing restaurant:', checkError);
        return;
      }

      if (existingRestaurant && existingRestaurant.length > 0) {
        console.log('🏪 Restaurant already exists for user, using existing...');
        setRestaurant(existingRestaurant[0]);
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      
      const restaurantName = user?.user_metadata?.restaurant_name || 'My Restaurant';
      // Create a more unique slug to prevent duplicates
      const baseSlug = restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const slug = `${baseSlug}-${timestamp}-${randomSuffix}`;

      console.log('🏗️ Creating restaurant:', restaurantName);

      const { data: restaurant, error: restaurantError } = await Promise.race([
        supabase
          .from('restaurants')
          .insert({
            name: restaurantName,
            owner_id: userId,
            slug: slug,
            settings: {
              points_per_dollar: 1,
              referral_bonus: 50,
              pointValueAED: 0.05,
              blanketMode: {
                enabled: true,
                type: 'manual',
                manualSettings: {
                  pointsPerAED: 0.1
                }
              },
              tier_thresholds: {
                silver: 500,
                gold: 1000
              },
              loyalty_program: {
                name: 'Loyalty Program',
                description: 'Earn points with every purchase and redeem for rewards!'
              }
            }
          })
          .select()
          .single(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Restaurant creation timeout')), 15000) // Increased timeout
        )
      ]) as any;

      if (restaurantError) {
        console.error('❌ Error creating restaurant:', restaurantError);
        // If it's a duplicate error, the restaurant might have been created by another process
        if (restaurantError.code === '23505') {
          console.log('🔄 Duplicate detected, fetching existing restaurant...');
          const { data: existingRestaurant } = await supabase
            .from('restaurants')
            .select('*')
            .eq('owner_id', userId)
            .limit(1);
          
          if (existingRestaurant && existingRestaurant.length > 0) {
            setRestaurant(existingRestaurant[0]);
            return;
          }
        }
        return;
      }

      console.log('✅ Restaurant created:', restaurant.name);

      // Create sample rewards in background (don't block UI)
      createSampleRewards(restaurant.id).catch(error => {
        console.warn('⚠️ Failed to create sample rewards:', error);
      });
      
      // Create sample menu items in background
      createSampleMenuItems(restaurant.id).catch(error => {
        console.warn('⚠️ Failed to create sample menu items:', error);
      });

      setRestaurant(restaurant);
      
    } catch (error) {
      console.error('💥 Error creating default restaurant:', error);
    }
  };

  const createSampleRewards = async (restaurantId: string) => {
    try {
      const sampleRewards = [
        { name: 'Free Appetizer', description: 'Choose any appetizer from our menu', points_required: 100, category: 'food', min_tier: 'bronze' },
        { name: 'Free Dessert', description: 'Complimentary dessert of your choice', points_required: 150, category: 'food', min_tier: 'bronze' },
        { name: 'Free Drink', description: 'Any beverage from our drink menu', points_required: 75, category: 'beverage', min_tier: 'bronze' },
        { name: '10% Off Next Visit', description: 'Get 10% discount on your next meal', points_required: 200, category: 'discount', min_tier: 'bronze' },
        { name: 'Free Main Course', description: 'Choose any main course from our menu', points_required: 300, category: 'food', min_tier: 'silver' },
        { name: '20% Off Next Visit', description: 'Get 20% discount on your next meal', points_required: 400, category: 'discount', min_tier: 'silver' },
        { name: 'VIP Table Reservation', description: 'Priority seating and VIP treatment', points_required: 500, category: 'experience', min_tier: 'gold' },
        { name: 'Chef\'s Special Tasting', description: 'Exclusive tasting menu by our chef', points_required: 750, category: 'experience', min_tier: 'gold' }
      ];

      await Promise.race([
        supabase
          .from('rewards')
          .insert(
            sampleRewards.map(reward => ({
              ...reward,
              restaurant_id: restaurantId
            }))
          ),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Rewards creation timeout')), 10000) // Increased timeout
        )
      ]);
      
      console.log('✅ Sample rewards created');
    } catch (error) {
      console.warn('⚠️ Failed to create sample rewards:', error);
    }
  };
  
  const createSampleMenuItems = async (restaurantId: string) => {
    try {
      const { MenuItemService } = await import('../services/menuItemService');
      await MenuItemService.createSampleMenuItems(restaurantId);
      console.log('✅ Sample menu items created');
    } catch (error) {
      console.warn('⚠️ Failed to create sample menu items:', error);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setLoading(false);
        // Provide user-friendly message for invalid credentials
        if (error.message === 'Invalid login credentials') {
          return { error: 'Incorrect email or password. Please try again.' };
        }
        return { error: error.message };
      }

      return { error: null };
    } catch (error: any) {
      setLoading(false);
      return { error: error.message };
    }
  };

  const signUp = async (
    email: string, 
    password: string, 
    metadata: {
      firstName: string;
      lastName: string;
      restaurantName: string;
    }
  ) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: metadata.firstName,
            last_name: metadata.lastName,
            restaurant_name: metadata.restaurantName,
          }
        }
      });

      if (error) {
        return { error: error.message };
      }

      // Create trial subscription for new users
      if (data.user) {
        try {
          await SubscriptionService.createSubscription(data.user.id, 'trial');
        } catch (subscriptionError) {
          console.warn('Failed to create trial subscription:', subscriptionError);
          // Don't fail the signup if subscription creation fails
        }
      }

      return { error: null };
    } catch (error: any) {
      return { error: error.message };
    }
  };

  const signOut = async () => {
    try {
      console.log('🔄 Starting sign out process...');
      
      // Clear local state first
      setUser(null);
      setSession(null);
      setRestaurant(null);
      
      // Then sign out from Supabase
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        console.error('❌ Supabase sign out error:', error);
        // Don't throw error, just log it and continue
      } else {
        console.log('✅ Sign out successful');
      }
    } catch (error) {
      console.error('💥 Error during sign out:', error);
      // Clear state anyway to ensure user is logged out locally
      setUser(null);
      setSession(null);
      setRestaurant(null);
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        return { error: error.message };
      }

      return { error: null };
    } catch (error: any) {
      return { error: error.message };
    }
  };

  const value = {
    user,
    session,
    restaurant,
    loading,
    signIn,
    signUp,
    signOut,
    resetPassword,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};