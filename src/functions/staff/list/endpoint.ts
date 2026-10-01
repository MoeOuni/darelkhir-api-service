import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { StaffRepository } from '@/repositories/StaffRepository';

const listStaffHandler = async (_event: ExtendedEvent, _context: Context) => {
  const result = await new StaffRepository().listAll();
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Staff retrieved successfully',
      data: { items: result.items.map((e) => e.toPublicDTO()), count: result.count },
    }),
  };
};

export const handler = middleware({
  auth: true,
  requires: 'staff.manage',
  cors: true,
})(listStaffHandler);
