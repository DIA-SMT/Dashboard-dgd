This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### Configuración de Variables de Entorno

Crea un archivo `.env.local` en la raíz del proyecto con las siguientes variables:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Gmail Configuration (para notificaciones por email)
GMAIL_USER=tu_email@gmail.com
GMAIL_APP_PASSWORD=tu_app_password_de_gmail
```

**Configuración de Gmail API:**

Para enviar emails usando Gmail, necesitas crear una "App Password" (Contraseña de aplicación) de Google:

1. **Habilita la verificación en 2 pasos** en tu cuenta de Google:
   - Ve a [Google Account Security](https://myaccount.google.com/security)
   - Activa la "Verificación en 2 pasos" si no está activada

2. **Crea una App Password**:
   - Ve a [App Passwords](https://myaccount.google.com/apppasswords)
   - Selecciona "Correo" como aplicación
   - Selecciona "Otro (nombre personalizado)" como dispositivo y escribe "Dashboard Comunicaciones"
   - Haz clic en "Generar"
   - **Copia la contraseña de 16 caracteres** que Google te muestra (formato: xxxx xxxx xxxx xxxx)

3. **Configura las variables de entorno**:
   - `GMAIL_USER`: Tu dirección de Gmail completa (ej: `tuemail@gmail.com`)
   - `GMAIL_APP_PASSWORD`: La App Password de 16 caracteres que generaste (sin espacios)

**Nota importante:**
- La App Password es diferente a tu contraseña normal de Gmail
- No compartas tu App Password públicamente
- Si cambias tu contraseña de Gmail, necesitarás generar una nueva App Password

### Instalación

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
