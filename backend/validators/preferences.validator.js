import { z } from 'zod';

export const updatePreferencesSchema = z
  .object({
    staleIssueDays: z
      .number({ invalid_type_error: 'staleIssueDays must be an integer' })
      .int('staleIssueDays must be an integer')
      .min(1, 'staleIssueDays must be between 1 and 365')
      .max(365, 'staleIssueDays must be between 1 and 365')
      .optional(),
    stalePullRequestDays: z
      .number({ invalid_type_error: 'stalePullRequestDays must be an integer' })
      .int('stalePullRequestDays must be an integer')
      .min(1, 'stalePullRequestDays must be between 1 and 365')
      .max(365, 'stalePullRequestDays must be between 1 and 365')
      .optional(),
    defaultRepositoryId: z.union([
      z.string().regex(/^[a-f\d]{24}$/i, 'defaultRepositoryId must be a valid repository id'),
      z.null(),
    ]).optional(),
  })
  .refine(
    (data) => data.staleIssueDays !== undefined
      || data.stalePullRequestDays !== undefined
      || data.defaultRepositoryId !== undefined,
    {
      message: 'At least one preference must be provided',
    }
  );

export function validatePreferences(req, res, next) {
  const result = updatePreferencesSchema.safeParse(req.body);
  if (!result.success) {
    const issue = result.error.issues[0];
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: issue ? issue.message : 'Invalid preferences payload',
        details: result.error.flatten().fieldErrors,
      },
    });
  }
  req.validatedBody = result.data;
  next();
}
