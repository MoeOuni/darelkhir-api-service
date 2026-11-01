/**
 * A secret that could not be read is asked for again next time.
 *
 * The configuration was cached as a promise, and a rejected promise was
 * cached just the same: once the first read failed — the secret not created
 * yet — every later email from that warm container failed too, even after the
 * secret existed.
 */
const getJsonSecret = jest.fn();
jest.mock('@libs/secrets', () => ({ getJsonSecret: (...a: unknown[]) => getJsonSecret(...a) }));

describe('reading the email settings', () => {
  it('tries again after a failure instead of repeating it', async () => {
    process.env.GMAIL_SMTP_SECRET_NAME = 'test/gmail-smtp';
    const { getSmtpConfig } = await import('@libs/email/smtp');

    getJsonSecret.mockRejectedValueOnce(new Error("Secrets Manager can't find the specified secret."));
    await expect(getSmtpConfig()).rejects.toThrow('find the specified secret');

    getJsonSecret.mockResolvedValueOnce({ host: 'smtp.gmail.com', port: 465, secure: true, user: 'u@gmail.com', pass: 'x',
      fromEmail: 'u@gmail.com', fromName: 'Dar El Khir' });
    await expect(getSmtpConfig()).resolves.toMatchObject({ host: 'smtp.gmail.com', fromName: 'Dar El Khir' });
    expect(getJsonSecret).toHaveBeenCalledTimes(2);
  });
});
