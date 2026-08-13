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
    mocks.getLoginChallenge.mockImplementation(async (token: string) => token === challengeToken ? {
      user: { id: 'user-1', email, student: { phone } },
      device: { status: 'PENDING' },
    } : null);
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
});
