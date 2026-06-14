-- ==========================================
-- AI Vision Tracking & Recognition Tables
-- Run this in your Supabase SQL Editor
-- ==========================================

-- 1. Create table for Known Faces (Frequent Visitors)
CREATE TABLE IF NOT EXISTS public.known_faces (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL DEFAULT 'Unknown Visitor',
    visit_count int DEFAULT 1,
    total_time_spent_mins float DEFAULT 0.0,
    created_at timestamp with time zone DEFAULT now()
);

-- 2. Create table for Tracking Events (Individual sessions)
CREATE TABLE IF NOT EXISTS public.tracking_events (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    device_id uuid REFERENCES public.devices(id) ON DELETE CASCADE,
    object_class text NOT NULL, -- 'person', 'dog', 'cat'
    face_id uuid REFERENCES public.known_faces(id) ON DELETE SET NULL,
    tracking_id int NOT NULL, -- ID assigned by the AI tracker
    first_seen_at timestamp with time zone DEFAULT now(),
    last_seen_at timestamp with time zone DEFAULT now(),
    duration_seconds int DEFAULT 0
);

-- 3. Security Policies (Allow your edge script to write)
ALTER TABLE public.known_faces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_events ENABLE ROW LEVEL SECURITY;

-- Assuming you are using an anonymous key or service role for the Python script
CREATE POLICY "Allow all access to known_faces" ON public.known_faces FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to tracking_events" ON public.tracking_events FOR ALL USING (true) WITH CHECK (true);

-- Enable Realtime for the dashboard to listen to new tracking events
alter publication supabase_realtime add table tracking_events;
