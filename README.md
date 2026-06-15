# BSAFE Dashboard

React/Vite dashboard for camera, door, and AI vision security events.

## Local Setup

Copy `.env.example` to `.env` and fill in the required values.

```bash
npm install
npm run dev
```

## EmailJS Alerts

The app sends alert emails through EmailJS when:

- AI vision detects a new `person`, `dog`, or `cat` in the live feed.
- A Supabase `events` row is inserted with `event_type = door`.

Create one EmailJS template and add these variables to the template:

```text
{{app_name}}
{{alert_title}}
{{alert_message}}
{{alert_type}}
{{event_type}}
{{object_class}}
{{device_name}}
{{severity}}
{{time}}
{{details}}
```

Then add your EmailJS values to `.env`:

```text
VITE_EMAILJS_SERVICE_ID=your_service_id
VITE_EMAILJS_TEMPLATE_ID=your_template_id
VITE_EMAILJS_PUBLIC_KEY=your_public_key
```

Restart `npm run dev` after changing `.env`.
