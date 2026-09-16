import nodemailer from 'nodemailer';
import config from '../config/index.js';
import logger from './logger.js';

let transporter = null;
let warnedMissingAuth = false;

function isConfigured() {
  return Boolean(config.smtp.service || config.smtp.host);
}

function getTransporter() {
  if (transporter) return transporter;
  if (!isConfigured()) return null;

  if (!config.smtp.user || !config.smtp.password) {
    if (!warnedMissingAuth) {
      logger.warn(
        'SMTP_SERVICE/SMTP_HOST is set but SMTP_USER or SMTP_PASSWORD is missing - emails will fail to send'
      );
      warnedMissingAuth = true;
    }
  }

  const auth = config.smtp.user ? { user: config.smtp.user, pass: config.smtp.password } : undefined;

  transporter = config.smtp.service
    ? // Gmail (and other well-known providers) - nodemailer's preset gets
      // host/port/TLS right, so only credentials are needed here. For Gmail,
      // SMTP_PASSWORD must be a Google "app password", not the account
      // password (Gmail rejects plain SMTP auth with the real password).
      nodemailer.createTransport({ service: config.smtp.service, auth })
    : nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth
      });

  return transporter;
}

/**
 * Sends the magic sign-in link. Falls back to logging it to the server
 * console when no SMTP_SERVICE/SMTP_HOST is configured, so the prototype is
 * runnable without real email infrastructure - the operator (or whoever has
 * access to `docker compose logs`) reads the link there instead.
 */
export async function sendMagicLinkEmail(email, link) {
  const mail = getTransporter();

  if (!mail) {
    logger.info(`[dev email] No SMTP configured - magic link for ${email}: ${link}`);
    return { delivered: false };
  }

  try {
    await mail.sendMail({
      from: config.smtp.from,
      to: email,
      subject: 'Your IAS Rubber Dam sign-in link',
      text: `Sign in to the Rubber Dam console:\n\n${link}\n\nThis link expires in ${config.jwt.magicLinkTtl} and can only be used once.`,
      html: `<p>Sign in to the Rubber Dam console:</p><p><a href="${link}">${link}</a></p><p>This link expires in ${config.jwt.magicLinkTtl} and can only be used once.</p>`
    });
    return { delivered: true };
  } catch (err) {
    // Never let a broken mail provider surface SMTP internals (or leak
    // whether the address exists) to the caller - log it and fall back to
    // the console so the flow still works for local/dev use.
    logger.error(`Failed to send magic-link email via SMTP: ${err.message}`);
    logger.info(`[fallback] magic link for ${email}: ${link}`);
    return { delivered: false, error: err.message };
  }
}
