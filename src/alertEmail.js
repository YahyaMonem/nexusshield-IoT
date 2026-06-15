import emailjs from '@emailjs/browser'

const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID
const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY

export function isAlertEmailConfigured() {
    return Boolean(EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID && EMAILJS_PUBLIC_KEY)
}

export const sendSecurityAlertEmail = async ({
    alertTitle,
    alertMessage,
    alertType,
    eventType,
    objectClass,
    deviceName,
    severity,
    time,
    details,
}) => {
    if (!isAlertEmailConfigured()) {
        console.warn('EmailJS alert email is not configured. Add VITE_EMAILJS_SERVICE_ID, VITE_EMAILJS_TEMPLATE_ID, and VITE_EMAILJS_PUBLIC_KEY to .env.')
        return { skipped: true }
    }

    const templateParams = {
        app_name: 'NexusShield',
        alert_title: alertTitle || 'Security Alert',
        alert_message: alertMessage || 'Motion or suspicious activity detected.',
        alert_type: alertType || 'Security',
        event_type: eventType || 'Detection',
        object_class: objectClass || 'Unknown',
        device_name: deviceName || 'Unknown Device',
        severity: severity || 'Medium',
        time: time || new Date().toLocaleString(),
        details: details || 'No extra details available.',
    }

    return emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        templateParams,
        EMAILJS_PUBLIC_KEY
    )
}
