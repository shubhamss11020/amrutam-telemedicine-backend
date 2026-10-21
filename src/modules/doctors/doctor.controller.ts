import { Request, Response, NextFunction } from 'express';
import { DoctorService } from './doctor.service.js';
import { doctorSearchSchema } from './doctor.dto.js';

export class DoctorController {
  constructor(private readonly doctorService: DoctorService) {}

  public search = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filters = doctorSearchSchema.parse(req.query);
      const doctors = await this.doctorService.searchDoctors(filters);
      res.status(200).json({
        success: true,
        count: doctors.length,
        data: doctors,
      });
    } catch (err) {
      next(err);
    }
  };

  public getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const doctor = await this.doctorService.getDoctorById(req.params.id as string);
      res.status(200).json({
        success: true,
        data: doctor,
      });
    } catch (err) {
      next(err);
    }
  };
}
