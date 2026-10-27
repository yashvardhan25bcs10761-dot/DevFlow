import mongoose from 'mongoose';

const userPreferenceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    staleIssueDays: {
      type: Number,
      required: true,
      default: 14,
      min: [1, 'staleIssueDays must be at least 1 day'],
      max: [365, 'staleIssueDays must not exceed 365 days'],
    },
    stalePullRequestDays: {
      type: Number,
      required: true,
      default: 7,
      min: [1, 'stalePullRequestDays must be at least 1 day'],
      max: [365, 'stalePullRequestDays must not exceed 365 days'],
    },
    defaultRepositoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Repository',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

userPreferenceSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

export const UserPreference = mongoose.model('UserPreference', userPreferenceSchema);
