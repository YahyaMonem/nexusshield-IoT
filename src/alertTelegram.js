const BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN

export function isTelegramConfigured() {
    return Boolean(BOT_TOKEN)
}

export async function sendTelegramAlert({ chatId, title, deviceName, severity, time }) {
    if (!BOT_TOKEN || !chatId) return

    const icon = severity === 'high' ? '🔴' : severity === 'medium' ? '🟡' : '🟢'

    const text =
        `🚨 <b>NexusShield Alert</b>\n\n` +
        `📋 <b>Event:</b> ${title}\n` +
        `📹 <b>Device:</b> ${deviceName}\n` +
        `${icon} <b>Severity:</b> ${severity}\n` +
        `🕐 <b>Time:</b> ${time}`

    try {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
        })
    } catch (err) {
        console.error('[Telegram] Failed to send alert:', err)
    }
}
