import mongoose from 'mongoose';

export function validateObjectId(paramName = 'id') {
  return (req, res, next) => {
    const id = req.params[paramName];
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ID',
          message: `Invalid ID format for "${paramName}". Must be a 24-character hexadecimal string.`,
        },
      });
    }
    next();
  };
}
