import mongoose from 'mongoose';

const repositorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    githubId: {
      type: Number,
      required: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
      lowercase: true, // stored lowercase for dedup per SPEC section 7
    },
    ownerLogin: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    htmlUrl: {
      type: String,
      required: true,
      trim: true,
    },
    defaultBranch: {
      type: String,
      default: 'main',
    },
    visibility: {
      type: String,
      default: 'public',
    },
    stars: {
      type: Number,
      default: 0,
    },
    forks: {
      type: Number,
      default: 0,
    },
    openIssuesCount: {
      type: Number,
      default: 0,
    },
    githubCreatedAt: {
      type: Date,
      default: null,
    },
    githubUpdatedAt: {
      type: Date,
      default: null,
    },
    githubPushedAt: {
      type: Date,
      default: null,
    },
    lastAnalyzedAt: {
      type: Date,
      default: null,
    },
    latestHealthScore: {
      type: Number,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Dedup strategy (decision per SPEC Section 7):
// unique compound index { userId: 1, fullName: 1 } with fullName lowercased.
repositorySchema.index({ userId: 1, fullName: 1 }, { unique: true });

repositorySchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

export const Repository = mongoose.model('Repository', repositorySchema);
