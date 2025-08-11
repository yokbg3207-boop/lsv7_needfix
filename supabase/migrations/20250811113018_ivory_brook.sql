/*
  # Fix Authentication and User Creation Issues

  This migration addresses database issues preventing user signup and login by:
  
  1. Database Functions
     - Recreates the handle_new_user function to properly sync auth.users with public.users
     - Ensures proper user creation flow
     - Fixes any trigger issues
  
  2. Security & Policies
     - Verifies RLS policies on users table
     - Ensures proper permissions for user creation
     - Fixes any policy conflicts
  
  3. Triggers
     - Recreates auth triggers for user synchronization
     - Ensures proper user metadata handling
  
  4. Data Integrity
     - Checks for orphaned records
     - Ensures referential integrity
*/

-- First, let's recreate the handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- Insert into public.users table when a new user is created in auth.users
  INSERT INTO public.users (id, email, user_metadata, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data, '{}'::jsonb),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    user_metadata = EXCLUDED.user_metadata,
    updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Ensure the users table exists with proper structure
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  user_metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  is_super_admin boolean DEFAULT false
);

-- Ensure proper indexes exist
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_super_admin ON public.users(is_super_admin) WHERE is_super_admin = true;

-- Ensure RLS is enabled
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can read own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
DROP POLICY IF EXISTS "Service role can manage users" ON public.users;

-- Recreate policies with proper permissions
CREATE POLICY "Users can read own profile"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Users can insert own profile"
  ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "Service role can manage users"
  ON public.users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Ensure restaurants table has proper foreign key constraint
DO $$
BEGIN
  -- Check if the foreign key constraint exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'restaurants_owner_id_fkey' 
    AND table_name = 'restaurants'
  ) THEN
    -- Add the foreign key constraint if it doesn't exist
    ALTER TABLE public.restaurants 
    ADD CONSTRAINT restaurants_owner_id_fkey 
    FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Ensure subscriptions table has proper foreign key constraint
DO $$
BEGIN
  -- Check if the foreign key constraint exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'subscriptions_user_id_fkey' 
    AND table_name = 'subscriptions'
  ) THEN
    -- Add the foreign key constraint if it doesn't exist
    ALTER TABLE public.subscriptions 
    ADD CONSTRAINT subscriptions_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Sync any existing auth.users that might not be in public.users
INSERT INTO public.users (id, email, user_metadata, created_at, updated_at)
SELECT 
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data, '{}'::jsonb),
  au.created_at,
  au.updated_at
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.users pu WHERE pu.id = au.id
)
ON CONFLICT (id) DO NOTHING;

-- Create or replace the sync_auth_users function for ongoing synchronization
CREATE OR REPLACE FUNCTION public.sync_auth_users()
RETURNS trigger AS $$
BEGIN
  -- Handle INSERT
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.users (id, email, user_metadata, created_at, updated_at)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data, '{}'::jsonb),
      NEW.created_at,
      NEW.updated_at
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      user_metadata = EXCLUDED.user_metadata,
      updated_at = EXCLUDED.updated_at;
    RETURN NEW;
  END IF;

  -- Handle UPDATE
  IF TG_OP = 'UPDATE' THEN
    UPDATE public.users SET
      email = NEW.email,
      user_metadata = COALESCE(NEW.raw_user_meta_data, '{}'::jsonb),
      updated_at = NEW.updated_at
    WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  -- Handle DELETE
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.users WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the comprehensive auth sync trigger
DROP TRIGGER IF EXISTS sync_auth_users_trigger ON auth.users;
CREATE TRIGGER sync_auth_users_trigger
  AFTER INSERT OR UPDATE OR DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_auth_users();

-- Ensure the update_updated_at_column function exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at trigger to users table if it doesn't exist
DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Verify that all essential tables have proper RLS and policies
-- This ensures the auth system can function properly

-- Check restaurants table RLS
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;

-- Check subscriptions table RLS  
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Ensure customers table has proper restaurant relationship
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Grant necessary permissions to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.restaurants TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.subscriptions TO authenticated;

-- Grant service role full access for admin operations
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;