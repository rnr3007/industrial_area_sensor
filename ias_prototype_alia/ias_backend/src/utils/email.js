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
    ? nodemailer.createTransport({ service: config.smtp.service, auth })
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
 * console when no SMTP_SERVICE/SMTP_HOST is configured.
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
      subject: 'Your Alia AUF750 sign-in link',
      text: `Sign in to the Alia AUF750 monitoring console:\n\n${link}\n\nThis link expires in ${config.jwt.magicLinkTtl} and can only be used once.`,
      html: `<p>Sign in to the Alia AUF750 monitoring console:</p><p><a href="${link}">${link}</a></p><p>This link expires in ${config.jwt.magicLinkTtl} and can only be used once.</p>`
    });
    return { delivered: true };
  } catch (err) {
    logger.error(`Failed to send magic-link email via SMTP: ${err.message}`);
    logger.info(`[fallback] magic link for ${email}: ${link}`);
    return { delivered: false, error: err.message };
  }
}
