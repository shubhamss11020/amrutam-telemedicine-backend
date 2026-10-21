import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { UnauthorizedError } from '../errors/index.js';

// Algorithm for Field-Level Medical Encryption
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128-bit IV for AES-GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag

export class CryptoService {
  private static readonly key = Buffer.from(config.ENCRYPTION_KEY, 'hex');

  /**
   * Encrypts sensitive health information (PHI) using AES-256-GCM.
   * Format: iv:authTag:encryptedData (hex encoded)
   */
  public static encrypt(plainText: string): string {
    if (!plainText) return plainText;
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypts AES-256-GCM encrypted data.
   * Verifies authenticity tag to prevent tampering.
   */
  public static decrypt(cipherTextWithMeta: string): string {
    if (!cipherTextWithMeta) return cipherTextWithMeta;

    const parts = cipherTextWithMeta.split(':');
    if (parts.length !== 3) {
      throw new Error('Malformed encrypted payload format. Expected iv:authTag:ciphertext');
    }

    const [ivHex, authTagHex, encryptedHex] = parts as [string, string, string];
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Hashes passwords using bcrypt with high work factor
   */
  public static async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(12);
    return bcrypt.hash(password, salt);
  }

  /**
   * Compares plain password with hash
   */
  public static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generates JWT Access Token
   */
  public static generateAccessToken(payload: { userId: string; role: string; email: string }): string {
    return jwt.sign(payload, config.JWT_SECRET, {
      expiresIn: config.JWT_EXPIRES_IN as any,
      algorithm: 'HS256',
      issuer: 'amrutam-telemedicine',
      audience: 'amrutam-api-clients',
    });
  }

  /**
   * Generates JWT Refresh Token
   */
  public static generateRefreshToken(payload: { userId: string }): string {
    return jwt.sign(payload, config.JWT_REFRESH_SECRET, {
      expiresIn: config.JWT_REFRESH_EXPIRES_IN as any,
      algorithm: 'HS256',
      issuer: 'amrutam-telemedicine',
    });
  }

  /**
   * Verifies JWT Access Token
   */
  public static verifyAccessToken(token: string): { userId: string; role: string; email: string } {
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET, {
        issuer: 'amrutam-telemedicine',
        audience: 'amrutam-api-clients',
      });
      return decoded as { userId: string; role: string; email: string };
    } catch {
      throw new UnauthorizedError('Invalid or expired authentication token');
    }
  }

  /**
   * Verifies JWT Refresh Token
   */
  public static verifyRefreshToken(token: string): { userId: string } {
    try {
      const decoded = jwt.verify(token, config.JWT_REFRESH_SECRET, {
        issuer: 'amrutam-telemedicine',
      });
      return decoded as { userId: string };
    } catch {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }
  }
}
