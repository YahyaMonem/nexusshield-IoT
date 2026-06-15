import { supabase } from './supabaseClient'

export async function ensureUserProfile(user) {
    if (!user?.id) return null

    const profile = {
        id: user.id,
        role: 'admin',
        onboarding_complete: false,
        use_case: [],
        camera_access: 'only_me',
        camera_access_emails: [],
    }

    // 1. Ensure the profile exists
    await supabase
        .from('profiles')
        .upsert(profile, { onConflict: 'id', ignoreDuplicates: true })

    // 2. Fetch the profile
    const { data, error } = await supabase
        .from('profiles')
        .select('id, role, onboarding_complete')
        .eq('id', user.id)
        .single()

    if (error) throw error
    return data
}
