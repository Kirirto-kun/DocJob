import { RESET_TOKEN_TTL_MS } from './password-reset-tokens';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

const FROM = process.env.EMAIL_FROM ?? 'DocJob <noreply@docjob.kz>';

/**
 * Send an email via Resend. When RESEND_API_KEY is absent (local dev), the
 * message is logged to the console instead, so the whole flow can be exercised
 * without credentials or a verified domain.
 */
export async function sendEmail({ to, subject, html, text, replyTo }: SendEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log('[email:dev] No RESEND_API_KEY — skipping real send.');
    console.log(`[email:dev] To: ${to}`);
    if (replyTo) console.log(`[email:dev] Reply-To: ${replyTo}`);
    console.log(`[email:dev] Subject: ${subject}`);
    console.log(`[email:dev] Body:\n${text ?? html}`);
    return;
  }
  const { Resend } = await import('resend');
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({ from: FROM, to, subject, html, text, replyTo });
  if (error) {
    throw new Error(`Resend failed: ${error.message}`);
  }
}

const TTL_HOURS = Math.round(RESET_TOKEN_TTL_MS / (60 * 60 * 1000));

/** Build subject/html/text for the password-reset email. Pure + testable. */
export function buildPasswordResetEmail(resetUrl: string): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = 'Восстановление пароля — DocJob';

  const text =
    `Вы запросили восстановление пароля в DocJob.\n\n` +
    `Перейдите по ссылке, чтобы задать новый пароль (ссылка действует ${TTL_HOURS} ч):\n` +
    `${resetUrl}\n\n` +
    `Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.`;

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #111;">
      <h2 style="margin-bottom: 16px;">Восстановление пароля</h2>
      <p>Вы запросили восстановление пароля в DocJob.</p>
      <p style="margin: 24px 0;">
        <a href="${resetUrl}"
           style="display: inline-block; padding: 12px 20px; background: #2563eb; color: #fff; border-radius: 8px; text-decoration: none;">
          Задать новый пароль
        </a>
      </p>
      <p style="font-size: 13px; color: #555;">Ссылка действует ${TTL_HOURS} ч. Если вы не запрашивали сброс — проигнорируйте это письмо.</p>
      <p style="font-size: 12px; color: #888; word-break: break-all;">${resetUrl}</p>
    </div>
  `.trim();

  return { subject, html, text };
}

/** Escape HTML so user-supplied text can't inject markup into the email. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Build subject/html/text for a contact-form submission. Pure + testable. */
export function buildContactEmail(input: { name: string; email: string; message: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = 'Новое сообщение с сайта — DocJob';

  const text =
    `Новое сообщение с формы обратной связи DocJob.\n\n` +
    `Имя: ${input.name}\n` +
    `Email: ${input.email}\n\n` +
    `Сообщение:\n${input.message}`;

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: 0 auto; color: #111;">
      <h2 style="margin-bottom: 16px;">Новое сообщение с сайта DocJob</h2>
      <p><strong>Имя:</strong> ${escapeHtml(input.name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(input.email)}</p>
      <p style="margin-top: 16px;"><strong>Сообщение:</strong></p>
      <p style="white-space: pre-wrap;">${escapeHtml(input.message)}</p>
    </div>
  `.trim();

  return { subject, html, text };
}
