/* ==========================================================================
   SAT-UNICESMAG - Servicio de Envío de Correos y Notificaciones OTP
   ========================================================================== */

import nodemailer from "nodemailer";

let transporter = null;

function obtenerTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS;

  if (host && user && pass) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      tls: { rejectUnauthorized: false }
    });
  } else if (process.env.GMAIL_USER && process.env.GMAIL_PASS) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
      }
    });
  }

  return transporter;
}

/**
 * Envía el código OTP al correo institucional del estudiante.
 * @param {Object} params
 * @param {string} params.correo - Correo institucional del estudiante
 * @param {string} params.nombre - Nombre del estudiante
 * @param {string} params.codigoOtp - Código de 6 dígitos
 * @param {number} params.expiraMinutos - Minutos de vigencia (default 15)
 */
export async function enviarCorreoOtp({ correo, nombre, codigoOtp, expiraMinutos = 15 }) {
  const asunto = `Código de verificación SAT-UNICESMAG: ${codigoOtp}`;
  
  // Plantilla HTML con identidad visual institucional CESMAG
  const cuerpoHtml = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 580px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
      <div style="background: linear-gradient(135deg, #002855 0%, #001f3f 100%); padding: 24px; text-align: center; color: #ffffff;">
        <h1 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">UNIVERSIDAD CESMAG</h1>
        <p style="margin: 4px 0 0; font-size: 13px; color: #93c5fd;">Sistema de Alertas Tempranas y Permanencia (SAT)</p>
      </div>
      
      <div style="padding: 32px 24px; color: #1e293b;">
        <p style="font-size: 16px; margin: 0 0 16px;">Estimado(a) <strong>${nombre || "Estudiante"}</strong>,</p>
        <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 24px;">
          Has solicitado ingresar al <strong>Portal de Caracterización Estudiantil</strong>. Utiliza el siguiente código de seguridad de un solo uso (OTP) para completar tu autenticación:
        </p>
        
        <div style="background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
          <div style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #002855; font-family: monospace;">
            ${codigoOtp}
          </div>
          <p style="margin: 8px 0 0; font-size: 12px; color: #64748b;">
            <i class="fas fa-clock"></i> Este código expira en <strong>${expiraMinutos} minutos</strong>.
          </p>
        </div>
        
        <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px 16px; border-radius: 0 6px 6px 0; margin-bottom: 24px;">
          <p style="margin: 0; font-size: 12px; color: #1e40af; line-height: 1.5;">
            <strong>Importante:</strong> Este código es personal e intransferible. Si no solicitaste este acceso, por favor haz caso omiso a este mensaje.
          </p>
        </div>
        
        <p style="font-size: 13px; color: #64748b; margin: 0;">
          Atentamente,<br>
          <strong>Vicerrectoría de Evangelización de las Culturas</strong><br>
          Programa de Permanencia y Acompañamiento Institucional
        </p>
      </div>
      
      <div style="background: #f1f5f9; padding: 16px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
        Universidad CESMAG • Pasto, Nariño, Colombia • Mensaje automático generado por SAT-UNICESMAG
      </div>
    </div>
  `;

  // Log visible en consola para monitoreo y desarrollo
  console.log("=================================================================");
  console.log(`📧 [EMAIL SERVICE] Código OTP para: ${correo}`);
  console.log(`👤 Estudiante: ${nombre}`);
  console.log(`🔑 CÓDIGO OTP: [ ${codigoOtp} ] (Válido por ${expiraMinutos} min)`);
  console.log("=================================================================");

  const mailer = obtenerTransporter();
  let envioRealizado = false;

  if (mailer) {
    try {
      const remitente = process.env.SMTP_FROM || process.env.SMTP_USER || process.env.GMAIL_USER || '"SAT UNICESMAG" <no-reply@unicesmag.edu.co>';
      await mailer.sendMail({
        from: remitente,
        to: correo,
        subject: asunto,
        html: cuerpoHtml
      });
      console.log(`✅ Correo enviado exitosamente a la bandeja de ${correo}`);
      envioRealizado = true;
    } catch (err) {
      console.error(`⚠️ Error al despachar correo vía SMTP a ${correo}:`, err.message);
    }
  } else {
    console.log(`ℹ️ [SMTP no configurado en .env]: El código OTP [${codigoOtp}] está disponible en consola y en la interfaz para pruebas.`);
  }

  return {
    ok: true,
    correo,
    codigoOtp,
    asunto,
    expiraMinutos,
    envioRealizado
  };
}

