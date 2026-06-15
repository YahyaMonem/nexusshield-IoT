-- ==========================================
-- AI Vision Tracking & Recognition Tables
-- Run this in your Supabase SQL Editor
-- ==========================================

CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Create table for Known Faces / Trusted People
CREATE TABLE IF NOT EXISTS public.known_faces (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL DEFAULT 'Unknown Visitor',
    relationship text DEFAULT 'trusted',
    is_trusted boolean DEFAULT true,
    alert_on_seen boolean DEFAULT false,
    -- Keep this unbounded so your edge model can use 128, 512, or another embedding size.
    -- If you standardize on one model later, change this to vector(512), vector(128), etc.
    face_embedding vector,
    visit_count int DEFAULT 1,
    total_time_spent_mins float DEFAULT 0.0,
    created_at timestamp with time zone DEFAULT now()
);

-- 2. Create table for child monitoring profiles / rules
CREATE TABLE IF NOT EXISTS public.child_monitor_profiles (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    child_name text NOT NULL,
    device_id uuid REFERENCES public.devices(id) ON DELETE CASCADE,
    active boolean DEFAULT true,
    wake_window_start time DEFAULT '20:00',
    wake_window_end time DEFAULT '07:00',
    alert_on_movement boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

-- 3. Create table for Tracking Events (Individual sessions)
CREATE TABLE IF NOT EXISTS public.tracking_events (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    device_id uuid REFERENCES public.devices(id) ON DELETE CASCADE,
    object_class text NOT NULL, -- 'person', 'dog', 'cat', 'child'
    face_id uuid REFERENCES public.known_faces(id) ON DELETE SET NULL,
    recognition_status text DEFAULT 'unrecognized', -- trusted, unknown, child, pet, unrecognized
    tracking_id int NOT NULL, -- ID assigned by the AI tracker
    first_seen_at timestamp with time zone DEFAULT now(),
    last_seen_at timestamp with time zone DEFAULT now(),
    duration_seconds int DEFAULT 0
);

-- 4. Security Policies
ALTER TABLE public.known_faces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_monitor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_events ENABLE ROW LEVEL SECURITY;

-- Development policies. For production, replace these with authenticated/admin/service-specific policies.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'known_faces'
          AND policyname = 'Allow all access to known_faces'
    ) THEN
        CREATE POLICY "Allow all access to known_faces"
        ON public.known_faces
        FOR ALL
        USING (true)
        WITH CHECK (true);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'child_monitor_profiles'
          AND policyname = 'Allow all access to child_monitor_profiles'
    ) THEN
        CREATE POLICY "Allow all access to child_monitor_profiles"
        ON public.child_monitor_profiles
        FOR ALL
        USING (true)
        WITH CHECK (true);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'tracking_events'
          AND policyname = 'Allow all access to tracking_events'
    ) THEN
        CREATE POLICY "Allow all access to tracking_events"
        ON public.tracking_events
        FOR ALL
        USING (true)
        WITH CHECK (true);
    END IF;
END $$;

-- Enable Realtime for the dashboard to listen to new tracking events
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'tracking_events'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.tracking_events;
    END IF;
END $$;
