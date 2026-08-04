/**
 * Send SEO Autopilot pitch emails via per-site SMTP (env fallback).
 */
import nodemailer from "nodemailer";
import prisma from "../prisma.js";
import { getAutopilotConfig, SECRET_MASK } from "./engine.js";

function resolveSmtp(config) {
  const host = String(config.smtpHost || process.env.SMTP_HOST || "").trim();
  const port = Number(config.smtpPort || process.env.SMTP_PORT || 587);
  const user = String(config.smtpUser || process.env.SMTP_USER || "").trim();
  const pass = String(config.smtpPass || process.env.SMTP_PASS || "").trim();
  const from = String(config.smtpFrom || process.env.SMTP_FROM || user || "").trim();
  if (!host || !user || !pass || !from) {
    return null;
  }
  return { host, port, user, pass, from };
}

export async function sendAutopilotPitch(pitchId, { siteLink } = {}) {
  const pitch = await prisma.seoAutopilotPitch.findUnique({ where: { id: pitchId } });
  if (!pitch) {
    const err = new Error("Pitch not found.");
    err.status = 404;
    throw err;
  }
  if (siteLink && pitch.siteLink !== siteLink) {
    const err = new Error("Pitch does not belong to this site.");
    err.status = 403;
    throw err;
  }
  if (!pitch.targetEmail) {
    const err = new Error("Pitch is missing a target email address.");
    err.status = 400;
    throw err;
  }
  if (!pitch.subject || !String(pitch.bodyText || pitch.bodyHtml || "").trim()) {
    const err = new Error("Pitch needs a subject and body before sending.");
    err.status = 400;
    throw err;
  }

  const config = await getAutopilotConfig(pitch.siteLink);
  const smtp = resolveSmtp(config);
  if (!smtp) {
    const err = new Error(
      "SMTP is not configured. Fill Host, Port, User, Password, and From on the Autopilot SMTP tab (or set SMTP_* env vars)."
    );
    err.status = 400;
    throw err;
  }

  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.pass },
  });

  try {
    await transport.sendMail({
      from: smtp.from,
      to: pitch.targetEmail,
      subject: pitch.subject,
      text: pitch.bodyText || undefined,
      html: pitch.bodyHtml || `<p>${String(pitch.bodyText || "").replace(/\n/g, "<br/>")}</p>`,
    });
  } catch (err) {
    await prisma.seoAutopilotPitch.update({
      where: { id: pitch.id },
      data: {
        status: "failed",
        errorMessage: err.message || "SMTP send failed",
      },
    });
    throw err;
  }

  return prisma.seoAutopilotPitch.update({
    where: { id: pitch.id },
    data: {
      status: "sent",
      sentAt: new Date(),
      errorMessage: null,
    },
  });
}

export function smtpConfiguredForClient(config) {
  const pass = config?.smtpPass;
  const hasPass = Boolean(pass && pass !== SECRET_MASK) || Boolean(process.env.SMTP_PASS);
  return Boolean(
    (config?.smtpHost || process.env.SMTP_HOST) &&
      (config?.smtpUser || process.env.SMTP_USER) &&
      hasPass &&
      (config?.smtpFrom || process.env.SMTP_FROM || config?.smtpUser || process.env.SMTP_USER)
  );
}
