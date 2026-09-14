import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { email, memberName, taskTitle, taskNotes, taskLink, projectTitle, notificationType = 'new' } = body

        // Validar que el email existe
        if (!email) {
            return NextResponse.json(
                { error: 'El miembro no tiene un email configurado' },
                { status: 400 }
            )
        }

        console.log('[API] Check Env:', {
            hasUser: !!process.env.GMAIL_USER,
            hasPass: !!process.env.GMAIL_APP_PASSWORD,
            userLen: process.env.GMAIL_USER?.length
        })

        // Validar variables de entorno
        if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
            console.error('[API] Missing GMAIL credentials')
            return NextResponse.json(
                { error: 'GMAIL_USER y GMAIL_APP_PASSWORD deben estar configurados en las variables de entorno' },
                { status: 500 }
            )
        }

        // Determinar el tipo de notificación
        const isUpdate = notificationType === 'update'
        const emailSubject = isUpdate
            ? `Tarea actualizada: ${taskTitle}`
            : `Nueva tarea asignada: ${taskTitle}`
        const emailTitle = isUpdate ? 'Tarea Actualizada' : 'Nueva Tarea Asignada'
        const emailIntro = isUpdate
            ? 'Se ha actualizado una tarea asignada a ti:'
            : 'Se te ha asignado una nueva tarea:'

        const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${emailTitle}</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #f4f4f4; padding: 20px; border-radius: 5px;">
            <h2 style="color: #2563eb; margin-top: 0;">${emailTitle}</h2>
            
            <p>Hola <strong>${memberName}</strong>,</p>
            
            <p>${emailIntro}</p>
            
            <div style="background-color: white; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #2563eb;">
              <h3 style="margin-top: 0; color: #1e40af;">${taskTitle}</h3>
              ${projectTitle ? `<p style="color: #666; margin: 10px 0;"><strong>Proyecto:</strong> ${projectTitle}</p>` : ''}
              ${taskNotes ? `<p style="color: #666; margin: 10px 0;"><strong>Notas:</strong> ${taskNotes}</p>` : ''}
              ${taskLink ? `<p style="margin: 10px 0;"><a href="${taskLink}" style="color: #2563eb; text-decoration: none;">Ver enlace/archivo →</a></p>` : ''}
            </div>
            
            <p style="margin-top: 20px;">Por favor, revisa la tarea en el dashboard del proyecto.</p>
            
            <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
            
            <p style="color: #666; font-size: 11px; margin-top: 20px; margin-bottom: 0; text-align: center;">
              Sistema creado por la Dirección de Inteligencia Artificial de la Municipalidad de San Miguel de Tucumán<br>
              <strong style="color: #dc2626;">NO RESPONDA A ESTE CORREO ELECTRÓNICO</strong>
            </p>
          </div>
        </body>
      </html>
    `

        const emailText = `
${emailTitle}

Hola ${memberName},

${emailIntro}

${taskTitle}
${projectTitle ? `Proyecto: ${projectTitle}` : ''}
${taskNotes ? `Notas: ${taskNotes}` : ''}
${taskLink ? `Link: ${taskLink}` : ''}

Por favor, revisa la tarea en el dashboard del proyecto.

---
Sistema creado por la Dirección de Inteligencia Artificial de la Municipalidad de San Miguel de Tucumán
NO RESPONDA A ESTE CORREO ELECTRÓNICO
    `.trim()

        // Configurar el transportador de nodemailer con Gmail
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.GMAIL_USER,
                pass: process.env.GMAIL_APP_PASSWORD, // App Password de Gmail
            },
        })

        // Enviar el email
        const info = await transporter.sendMail({
            from: `"Dashboard Comunicaciones" <${process.env.GMAIL_USER}>`,
            to: email,
            subject: emailSubject,
            html: emailHtml,
            text: emailText,
        })

        return NextResponse.json({
            success: true,
            messageId: info.messageId
        })
    } catch (error) {
        console.error('Error en send-task-notification:', error)
        return NextResponse.json(
            {
                error: 'Error al enviar el email',
                details: error instanceof Error ? error.message : 'Error desconocido'
            },
            { status: 500 }
        )
    }
}
