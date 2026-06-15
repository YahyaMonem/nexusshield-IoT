import { supabase } from './supabaseClient'

export async function ensureUserProfile(user) {
    if (!user?.id) return null

    const profile = {
        id: user.id,
        role: 'viewer',
        onboarding_complete: false,
        use_case: [],
        camera_access: 'only_me',
        camera_access_emails: [],
    }

    const { data, error } = await supabase
        .from('profiles')
        .upsert(profile, { onConflict: 'id', ignoreDuplicates: true })
        .select('id, role, onboarding_complete')
        .maybeSingle()

    if (error) throw error
    return data
}
