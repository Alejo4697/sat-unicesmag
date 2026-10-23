/* ==========================================================================
   SAT-UNICESMAG - Servicio de Envío de Correos y Notificaciones OTP
   ========================================================================== */

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import nodemailer from "nodemailer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config();

function crearTransporterConfig(port, secure) {
  const host = (process.env.SMTP_HOST || "smtp.gmail.com").trim();
  const user = (process.env.SMTP_USER || process.env.EMAIL_USER || process.env.GMAIL_USER || "adviser@unicesmag.edu.co").trim();
  const rawPass = (process.env.SMTP_PASS || process.env.EMAIL_PASS || process.env.GMAIL_PASS || "").trim();
  const pass = rawPass.replace(/\s+/g, ""); // Normalizar contraseñas de aplicación de Google (16 caracteres continuos)

  if (!user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass
    },
    tls: {
      rejectUnauthorized: false
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });
}

/**
 * Intenta despachar un correo con estrategia de fallback de puertos (587 STARTTLS -> 465 SSL)
 */
async function enviarConFallback(opcionesCorreo) {
  const user = (process.env.SMTP_USER || "adviser@unicesmag.edu.co").trim();
  const rawFrom = (process.env.SMTP_FROM || "").replace(/^["']|["']$/g, "").trim();
  const remitente = rawFrom || `"SAT UNICESMAG" <${user}>`;

  const mailOptions = {
    ...opcionesCorreo,
    from: remitente
  };

  // 1. Intentar primero puerto 587 (STARTTLS estándar para Google Workspace)
  const portConfigurado = Number(process.env.SMTP_PORT) || 587;
  const primTransporter = crearTransporterConfig(portConfigurado, portConfigurado === 465);

  if (!primTransporter) {
    return { ok: false, error: "Credenciales SMTP no configuradas en .env (SMTP_USER / SMTP_PASS faltantes)" };
  }

  try {
    const info = await primTransporter.sendMail(mailOptions);
    console.log(`[OK] Correo enviado exitosamente vía SMTP (${portConfigurado}):`, info?.response || info?.messageId || "OK");
    return { ok: true, info };
  } catch (errPrim) {
    console.warn(`[WARN] Falló envío por puerto ${portConfigurado}: ${errPrim.message}. Probando puerto alternativo...`);

    // 2. Si falló 587, intentar 465 (o viceversa)
    const altPort = portConfigurado === 587 ? 465 : 587;
    const secTransporter = crearTransporterConfig(altPort, altPort === 465);

    try {
      const infoSec = await secTransporter.sendMail(mailOptions);
      console.log(`[OK] Correo enviado exitosamente vía puerto alternativo (${altPort}):`, infoSec?.response || infoSec?.messageId || "OK");
      return { ok: true, info: infoSec };
    } catch (errSec) {
      console.error(`[ERROR] Falló envío alternativo por puerto ${altPort}: ${errSec.message}`);
      return { ok: false, error: `Puerto ${portConfigurado}: ${errPrim.message} | Puerto ${altPort}: ${errSec.message}` };
    }
  }
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
            Este código expira en <strong>${expiraMinutos} minutos</strong>.
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
  console.log(`[EMAIL SERVICE] Código OTP para: ${correo}`);
  console.log(`Estudiante: ${nombre}`);
  console.log(`CÓDIGO OTP: [ ${codigoOtp} ] (Válido por ${expiraMinutos} min)`);
  console.log("=================================================================");

  const resultadoEnvio = await enviarConFallback({
    to: correo,
    subject: asunto,
    html: cuerpoHtml
  });

  return {
    ok: true,
    correo,
    codigoOtp,
    asunto,
    expiraMinutos,
    envioRealizado: resultadoEnvio.ok,
    error: resultadoEnvio.error || null
  };
}
