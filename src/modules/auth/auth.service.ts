import { IUserRepository, IDoctorRepository } from '../../core/database/repositories.interface.js';
import { CryptoService } from '../../core/security/crypto.js';
import { ConflictError, UnauthorizedError, NotFoundError } from '../../core/errors/index.js';
import { RegisterInput, LoginInput } from './auth.dto.js';
import { logger } from '../../core/logging/logger.js';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export class AuthService {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly doctorRepo: IDoctorRepository
  ) {}

  public async register(input: RegisterInput): Promise<{ user: any; tokens: AuthTokens }> {
    const existing = await this.userRepo.findByEmail(input.email);
    if (existing) {
      throw new ConflictError(`User with email '${input.email}' already exists.`);
    }

    const passwordHash = await CryptoService.hashPassword(input.password);

    // Create user and profile
    const createdUser = await this.userRepo.create(
      {
        email: input.email.toLowerCase(),
        passwordHash,
        role: input.role,
        isMfaEnabled: false,
      },
      {
        fullName: input.fullName,
        phone: input.phone,
      }
    );

    let doctorProfile: any = undefined;

    // If registering as a doctor, automatically scaffold doctor profile
    if (input.role === 'DOCTOR') {
      doctorProfile = await this.doctorRepo.create({
        userId: createdUser.id,
        fullName: input.fullName,
        specialization: input.specialization || 'General Physician',
        experienceYears: input.experienceYears || 5,
        consultationFee: input.consultationFee || 500,
        rating: 5.0,
        bio: input.bio || 'Ayurvedic & Telemedicine Specialist',
      });
    }

    logger.info({ userId: createdUser.id, role: createdUser.role }, 'User successfully registered');

    const tokens = this.generateTokens(createdUser.id, createdUser.role, createdUser.email);

    return {
      user: {
        id: createdUser.id,
        email: createdUser.email,
        role: createdUser.role,
        isMfaEnabled: createdUser.isMfaEnabled,
        profile: createdUser.profile,
        doctor: doctorProfile,
      },
      tokens,
    };
  }

  public async login(input: LoginInput): Promise<{ user: any; tokens: AuthTokens }> {
    const user = await this.userRepo.findByEmail(input.email);
    if (!user) {
      throw new UnauthorizedError('Invalid email or password.');
    }

    const isValid = await CryptoService.verifyPassword(input.password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedError('Invalid email or password.');
    }

    logger.info({ userId: user.id, email: user.email }, 'User logged in successfully');

    const tokens = this.generateTokens(user.id, user.role, user.email);

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        isMfaEnabled: user.isMfaEnabled,
        profile: user.profile,
        doctor: user.doctor,
      },
      tokens,
    };
  }

  public async refreshToken(token: string): Promise<AuthTokens> {
    const decoded = CryptoService.verifyRefreshToken(token);
    const user = await this.userRepo.findById(decoded.userId);
    if (!user) {
      throw new UnauthorizedError('User associated with refresh token no longer exists.');
    }

    return this.generateTokens(user.id, user.role, user.email);
  }

  public async getProfile(userId: string): Promise<any> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError('User', userId);
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      isMfaEnabled: user.isMfaEnabled,
      profile: user.profile,
      doctor: user.doctor,
    };
  }

  public async toggleMfa(userId: string, enable: boolean): Promise<{ isMfaEnabled: boolean }> {
    await this.userRepo.updateMfa(userId, enable);
    logger.info({ userId, enable }, 'Updated user MFA setting');
    return { isMfaEnabled: enable };
  }

  private generateTokens(userId: string, role: string, email: string): AuthTokens {
    const accessToken = CryptoService.generateAccessToken({ userId, role, email });
    const refreshToken = CryptoService.generateRefreshToken({ userId });
    return {
      accessToken,
      refreshToken,
      expiresIn: '3600s',
    };
  }
}
