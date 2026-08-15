import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/ksv_test',
    FRONTEND_URL: 'http://localhost:5173',
    CORS_ORIGINS: 'http://localhost:5173',
    COOKIE_SAME_SITE: 'none',
    SESSION_SECRET: 'test-session-secret-at-least-32-characters',
    QR_TOKEN_SECRET: 'test-qr-token-secret-at-least-32-characters',
  });
  return {
    login: vi.fn(),
    getLoginChallenge: vi.fn(),
    completeLoginChallenge: vi.fn(),
    requestOtp: vi.fn(),
    verifyOtp: vi.fn(),
  };
});

vi.mock('../src/services/auth.js', () => ({
  login: mocks.login,
  getLoginChallenge: mocks.getLoginChallenge,
  completeLoginChallenge: mocks.completeLoginChallenge,
}));

vi.mock('../src/services/otp.js', () => ({
  requestOtp: mocks.requestOtp,
  verifyOtp: mocks.verifyOtp,
}));

import { app } from '../src/app.js';

const origin = 'http://localhost:5173';
const email = 'student@example.com';
const phone = '+919876543210';
const challengeToken = 'login-challenge-token';

/**
 * Build a mock challenge that mirrors the REAL Prisma result shape.
 *
 * getLoginChallenge() now uses:
 *   include: { user: { include: { student: true } }, device: true }
 *
 * So challenge.user.student is a Student record (or null for non-student
 * users).  Previous mocks had student nested artificially which hid the
 * fact that the production Prisma query did NOT include student.
 *
 * Pass `includeStudent: false` to simulate the old broken data shape
 * where student was not included at all (property absent on the user
 * object).
 */
function buildChallenge(opts?: {
  includeStudent?: boolean;
  studentPhone?: string | null;
  email?: string;
}) {
  const includeStudent = opts?.includeStudent ?? true;
  const studentPhone = opts?.studentPhone ?? phone;

  const user: Record<string, unknown> = {
    id: 'user-1',
    publicId: 'public-user-1',
    email: opts?.email ?? email,
    normalizedEmail: (opts?.email ?? email).toLowerCase(),
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$hash',
    role: 'STUDENT',
    status: 'ACTIVE',
    emailVerifiedAt: null,
    lastLoginAt: null,
    lastPasswordChangedAt: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Only add the student property when includeStudent is true.
  // When false, challenge.user.student is truly absent — mirroring
  // the old Prisma query that used `include: { user: true }` instead
  // of `include: { user: { include: { student: true } } }`.
  if (includeStudent) {
    user.student = studentPhone !== null
      ? { id: 'student-1', phone: studentPhone }
      : null;
  }

  return {
    id: 'challenge-1',
    tokenHash: 'irrelevant-for-mock',
    userId: 'user-1',
    deviceId: 'device-1',
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    completedAt: null,
    createdAt: new Date(),
    user,
    device: { id: 'device-1', status: 'PENDING' },
  };
}

function recipientFor(method: 'EMAIL' | 'SMS') {
  return method === 'EMAIL' ? email : phone;
}

function endpointFor(method: 'EMAIL' | 'SMS', action: 'request' | 'verify') {
  return `/api/v1/otp/${method.toLowerCase()}/${action}`;
}

async function startLogin(client: ReturnType<typeof request.agent>) {
  return client.post('/api/v1/auth/login').set('Origin', origin).send({
    identifier: email,
    password: 'correct-password',
    rememberDevice: true,
  });
}

describe('login OTP flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.login.mockResolvedValue({
      kind: 'otp_required',
      challengeToken,
      user: { role: 'STUDENT', email, student: { phone } },
    });
    mocks.getLoginChallenge.mockImplementation(async (token: string) =>
      token === challengeToken ? buildChallenge() : null,
    );
    mocks.requestOtp.mockResolvedValue({
      accepted: true,
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      resendAvailableAt: new Date(Date.now() + 60_000).toISOString(),
    });
    mocks.verifyOtp.mockResolvedValue({ verified: true, userId: 'user-1', resetToken: null });
    mocks.completeLoginChallenge.mockResolvedValue({
      raw: 'session-token',
      expires: new Date(Date.now() + 86_400_000),
      role: 'STUDENT',
    });
  });

  it.each(['EMAIL', 'SMS'] as const)('preserves the challenge cookie through a successful %s OTP login', async method => {
    const client = request.agent(app);
    const recipient = recipientFor(method);

    const login = await startLogin(client);
    expect(login.status).toBe(200);
    expect(login.body.data.status).toBe('OTP_REQUIRED');
    expect(login.headers['access-control-allow-origin']).toBe(origin);
    expect(login.headers['access-control-allow-credentials']).toBe('true');
    expect(login.headers['set-cookie']).toEqual(expect.arrayContaining([
      expect.stringContaining(`ksv_login_challenge=${challengeToken}`),
      expect.stringContaining('HttpOnly'),
      expect.stringContaining('Path=/'),
      expect.stringContaining('SameSite=None'),
    ]));

    const otpRequest = await client.post(endpointFor(method, 'request')).set('Origin', origin).send({ recipient, purpose: 'LOGIN' });
    expect(otpRequest.status).toBe(200);
    expect(mocks.requestOtp).toHaveBeenCalledTimes(1);
    expect(mocks.requestOtp).toHaveBeenCalledWith(expect.objectContaining({ method, recipient, purpose: 'LOGIN' }));

    const verify = await client.post(endpointFor(method, 'verify')).set('Origin', origin).send({
      recipient,
      otp: '123456',
      purpose: 'LOGIN',
    });
    expect(verify.status).toBe(200);
    expect(verify.body.data).toMatchObject({ verified: true, status: 'AUTHENTICATED', role: 'STUDENT' });
    expect(mocks.verifyOtp).toHaveBeenCalledTimes(1);
    expect(mocks.verifyOtp).toHaveBeenCalledWith(expect.objectContaining({ method, recipient, otp: '123456', purpose: 'LOGIN' }));
    expect(mocks.completeLoginChallenge).toHaveBeenCalledWith(challengeToken, expect.objectContaining({ rememberDevice: true }));
    expect(verify.headers['set-cookie']).toEqual(expect.arrayContaining([
      expect.stringContaining('ksv_session=session-token'),
      expect.stringContaining('ksv_login_challenge=;'),
    ]));
  });

  it('SMS login fails when getLoginChallenge does not include user.student (pre-fix data shape)', async () => {
    // Simulate the old bug: getLoginChallenge returned challenge.user WITHOUT
    // the nested student relation (includeStudent: false removes the property
    // entirely from the user object, just like the real Prisma result when
    // using `include: { user: true }` without nested student include).
    mocks.getLoginChallenge.mockImplementation(async (token: string) =>
      token === challengeToken
        ? buildChallenge({ includeStudent: false })
        : null,
    );

    const client = request.agent(app);
    await startLogin(client);

    const otpRequest = await client
      .post(endpointFor('SMS', 'request'))
      .set('Origin', origin)
      .send({ recipient: phone, purpose: 'LOGIN' });

    // With student absent on user object, recipientMatchesChallenge('SMS', ...)
    // computes digits(undefined?.phone || '') which is '' and never matches.
    expect(otpRequest.status).toBe(401);
    expect(otpRequest.body.error.code).toBe('AUTH_LOGIN_CHALLENGE_EXPIRED');
  });

  it('SMS login succeeds when getLoginChallenge includes user.student (post-fix data shape)', async () => {
    // With the fix, getLoginChallenge includes user.student
    mocks.getLoginChallenge.mockImplementation(async (token: string) =>
      token === challengeToken ? buildChallenge({ includeStudent: true }) : null,
    );

    const client = request.agent(app);
    await startLogin(client);

    const otpRequest = await client
      .post(endpointFor('SMS', 'request'))
      .set('Origin', origin)
      .send({ recipient: phone, purpose: 'LOGIN' });

    expect(otpRequest.status).toBe(200);
  });

  it('EMAIL login succeeds when user.student is null (non-student user)', async () => {
    // Admin users may not have a student record — student is null
    mocks.getLoginChallenge.mockImplementation(async (token: string) =>
      token === challengeToken ? buildChallenge({ studentPhone: null }) : null,
    );

    const client = request.agent(app);
    await startLogin(client);

    const otpRequest = await client
      .post(endpointFor('EMAIL', 'request'))
      .set('Origin', origin)
      .send({ recipient: email, purpose: 'LOGIN' });

    // EMAIL matching only uses challenge.user.email, so student: null is fine
    expect(otpRequest.status).toBe(200);
  });

  it('rejects an invalid OTP without completing the login challenge', async () => {
    const client = request.agent(app);
    await startLogin(client);
    mocks.verifyOtp.mockRejectedValueOnce(new Error('OTP_INVALID'));

    const response = await client.post(endpointFor('EMAIL', 'verify')).set('Origin', origin).send({ recipient: email, otp: '123456', purpose: 'LOGIN' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('OTP_INVALID');
    expect(mocks.completeLoginChallenge).not.toHaveBeenCalled();
  });

  it('rejects an expired OTP without reporting a login challenge failure', async () => {
    const client = request.agent(app);
    await startLogin(client);
    mocks.verifyOtp.mockRejectedValueOnce(new Error('OTP_INVALID_OR_EXPIRED'));

    const response = await client.post(endpointFor('EMAIL', 'verify')).set('Origin', origin).send({ recipient: email, otp: '123456', purpose: 'LOGIN' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('OTP_INVALID_OR_EXPIRED');
    expect(mocks.completeLoginChallenge).not.toHaveBeenCalled();
  });

  it('reports login verification expired when the challenge cookie is missing', async () => {
    const response = await request(app).post(endpointFor('EMAIL', 'verify')).set('Origin', origin).send({ recipient: email, otp: '123456', purpose: 'LOGIN' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_LOGIN_CHALLENGE_EXPIRED');
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.completeLoginChallenge).not.toHaveBeenCalled();
  });

  it('reports login verification expired when the stored challenge has expired', async () => {
    const client = request.agent(app);
    await startLogin(client);
    mocks.getLoginChallenge.mockResolvedValueOnce(null);

    const response = await client.post(endpointFor('EMAIL', 'verify')).set('Origin', origin).send({ recipient: email, otp: '123456', purpose: 'LOGIN' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_LOGIN_CHALLENGE_EXPIRED');
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.completeLoginChallenge).not.toHaveBeenCalled();
  });

  it('rejects OTP verify when recipient email does not match challenge user email', async () => {
    // Use the /verify endpoint to avoid the OTP generation rate limiter
    // (max 5 requests/hour) that may be exhausted by earlier tests.
    // The verify handler also calls requireLoginChallenge for LOGIN purpose.
    const client = request.agent(app);
    await startLogin(client);

    // Mock a challenge whose email is different from the request recipient
    mocks.getLoginChallenge.mockImplementation(async (token: string) =>
      token === challengeToken
        ? buildChallenge({ email: 'actual@example.com' })
        : null,
    );

    const otpVerify = await client
      .post(endpointFor('EMAIL', 'verify'))
      .set('Origin', origin)
      .send({ recipient: 'wrong@example.com', otp: '123456', purpose: 'LOGIN' });

    expect(otpVerify.status).toBe(401);
    expect(otpVerify.body.error.code).toBe('AUTH_LOGIN_CHALLENGE_EXPIRED');
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it('rejects SMS OTP verify when recipient phone does not match challenge user phone', async () => {
    const client = request.agent(app);
    await startLogin(client);

    // The default challenge has phone '+919876543210'; send a different number
    const otpVerify = await client
      .post(endpointFor('SMS', 'verify'))
      .set('Origin', origin)
      .send({ recipient: '+911111111111', otp: '123456', purpose: 'LOGIN' });

    expect(otpVerify.status).toBe(401);
    expect(otpVerify.body.error.code).toBe('AUTH_LOGIN_CHALLENGE_EXPIRED');
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });
});
