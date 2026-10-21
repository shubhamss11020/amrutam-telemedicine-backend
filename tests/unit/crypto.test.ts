import { describe, it, expect } from 'vitest';
import { CryptoService } from '../../src/core/security/crypto.js';

describe('CryptoService (Security & PHI Encryption)', () => {
  it('should encrypt and decrypt Protected Health Information (PHI) correctly using AES-256-GCM', () => {
    const sensitiveDiagnosis = 'Patient exhibits acute Vata-Pitta dosha imbalance with migraine.';

    const encrypted = CryptoService.encrypt(sensitiveDiagnosis);
    expect(encrypted).not.toBe(sensitiveDiagnosis);
    expect(encrypted.split(':')).toHaveLength(3); // iv:authTag:ciphertext

    const decrypted = CryptoService.decrypt(encrypted);
    expect(decrypted).toBe(sensitiveDiagnosis);
  });

  it('should throw an error if encrypted payload has been tampered with', () => {
    const plainText = 'Strict confidential medical record';
    const encrypted = CryptoService.encrypt(plainText);
    const parts = encrypted.split(':');

    // Tamper with ciphertext
    const tamperedCipher = parts[2]!.slice(0, -2) + 'ff';
    const tamperedPayload = `${parts[0]}:${parts[1]}:${tamperedCipher}`;

    expect(() => CryptoService.decrypt(tamperedPayload)).toThrow();
  });

  it('should hash passwords and verify them securely', async () => {
    const password = 'SuperSecretDoctorPass2026!';
    const hash = await CryptoService.hashPassword(password);

    expect(hash).not.toBe(password);
    const isValid = await CryptoService.verifyPassword(password, hash);
    expect(isValid).toBe(true);

    const isInvalid = await CryptoService.verifyPassword('WrongPassword', hash);
    expect(isInvalid).toBe(false);
  });

  it('should generate and verify JWT Access and Refresh tokens', () => {
    const payload = { userId: 'user-uuid-123', role: 'DOCTOR', email: 'doc@amrutam.co' };
    const accessToken = CryptoService.generateAccessToken(payload);
    const refreshToken = CryptoService.generateRefreshToken({ userId: payload.userId });

    const decodedAccess = CryptoService.verifyAccessToken(accessToken);
    expect(decodedAccess.userId).toBe(payload.userId);
    expect(decodedAccess.role).toBe(payload.role);

    const decodedRefresh = CryptoService.verifyRefreshToken(refreshToken);
    expect(decodedRefresh.userId).toBe(payload.userId);
  });
});
