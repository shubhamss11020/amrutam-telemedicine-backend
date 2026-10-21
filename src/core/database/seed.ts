import { container } from '../container/index.js';
import { CryptoService } from '../security/crypto.js';
import { logger } from '../logging/logger.js';
import { dbService } from './connection.js';

export async function seedDatabase(): Promise<void> {
  logger.info('🌱 Starting database seed script...');

  // 1. Seed Admin
  const adminEmail = 'admin@amrutam.co';
  let admin = await container.userRepository.findByEmail(adminEmail);
  if (!admin) {
    const passwordHash = await CryptoService.hashPassword('AdminPass123!');
    admin = await container.userRepository.create(
      {
        email: adminEmail,
        passwordHash,
        role: 'ADMIN',
        isMfaEnabled: true,
      },
      {
        fullName: 'Amrutam System Administrator',
        phone: '+919876543210',
      }
    );
    logger.info({ email: adminEmail }, 'Admin user created');
  }

  // 2. Seed Doctors
  const doctorsData = [
    {
      email: 'dr.ananya@amrutam.co',
      fullName: 'Dr. Ananya Sharma',
      specialization: 'Ayurvedic Medicine & Panchakarma',
      experienceYears: 12,
      consultationFee: 800,
      rating: 4.9,
      bio: 'Gold medalist in Ayurvedic Medicine with over 12 years of clinical experience treating chronic lifestyle disorders.',
    },
    {
      email: 'dr.rajesh@amrutam.co',
      fullName: 'Dr. Rajesh Varma',
      specialization: 'Dermatology & Skin Wellness',
      experienceYears: 8,
      consultationFee: 600,
      rating: 4.8,
      bio: 'Expert dermatologist specializing in integrative herbal skin treatments and allergy care.',
    },
    {
      email: 'dr.priya@amrutam.co',
      fullName: 'Dr. Priya Nair',
      specialization: 'General Medicine & Nutrition',
      experienceYears: 10,
      consultationFee: 500,
      rating: 4.95,
      bio: 'Senior consultant specializing in preventative healthcare, metabolic health, and nutrition counseling.',
    },
  ];

  const seededDoctors = [];
  for (const doc of doctorsData) {
    let user = await container.userRepository.findByEmail(doc.email);
    if (!user) {
      const passwordHash = await CryptoService.hashPassword('DoctorPass123!');
      user = await container.userRepository.create(
        {
          email: doc.email,
          passwordHash,
          role: 'DOCTOR',
          isMfaEnabled: false,
        },
        {
          fullName: doc.fullName,
          phone: '+919800000001',
        }
      );

      const doctorProfile = await container.doctorRepository.create({
        userId: user.id,
        fullName: doc.fullName,
        specialization: doc.specialization,
        experienceYears: doc.experienceYears,
        consultationFee: doc.consultationFee,
        rating: doc.rating,
        bio: doc.bio,
      });

      seededDoctors.push(doctorProfile);
      logger.info({ email: doc.email, doctorId: doctorProfile.id }, 'Doctor profile seeded');
    } else if (user.doctor) {
      seededDoctors.push(user.doctor);
    }
  }

  // 3. Seed Patients
  const patientsData = [
    {
      email: 'patient1@example.com',
      fullName: 'Rahul Verma',
      phone: '+919999900001',
    },
    {
      email: 'patient2@example.com',
      fullName: 'Sneha Patel',
      phone: '+919999900002',
    },
  ];

  for (const patient of patientsData) {
    let user = await container.userRepository.findByEmail(patient.email);
    if (!user) {
      const passwordHash = await CryptoService.hashPassword('PatientPass123!');
      user = await container.userRepository.create(
        {
          email: patient.email,
          passwordHash,
          role: 'PATIENT',
          isMfaEnabled: false,
        },
        {
          fullName: patient.fullName,
          phone: patient.phone,
          encryptedMedicalHistory: CryptoService.encrypt('No known drug allergies. History of seasonal sinusitis.'),
        }
      );
      logger.info({ email: patient.email, patientId: user.id }, 'Patient seeded');
    }
  }

  // 4. Seed Availability Slots for Tomorrow
  if (seededDoctors.length > 0) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0]!;

    for (const doc of seededDoctors) {
      const existingSlots = await container.slotRepository.findAvailable(doc.id);
      if (existingSlots.length === 0) {
        const slotsToCreate = [];
        const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number];

        // 10:00 to 14:00 (4 slots)
        for (let hour = 10; hour < 14; hour++) {
          slotsToCreate.push({
            doctorId: doc.id,
            startTime: new Date(Date.UTC(year, month - 1, day, hour, 0, 0)),
            endTime: new Date(Date.UTC(year, month - 1, day, hour, 30, 0)),
            status: 'AVAILABLE' as const,
          });
        }
        await container.slotRepository.createBatch(slotsToCreate);
        logger.info({ doctorId: doc.id, count: slotsToCreate.length }, 'Seeded availability slots');
      }
    }
  }

  logger.info('✅ Database seed completed successfully!');
}

// Allow direct execution: `tsx src/core/database/seed.ts`
if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  (async () => {
    await dbService.connect();
    await seedDatabase();
    await dbService.close();
    process.exit(0);
  })();
}
