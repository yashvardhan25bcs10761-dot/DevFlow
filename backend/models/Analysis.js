import mongoose from 'mongoose';

const analysisSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    repositoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Repository',
      required: true,
      index: true,
    },
    analyzedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    healthScore: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },
    scoreStatus: {
      type: String,
      enum: ['complete', 'partial', 'insufficient_data'],
      required: true,
    },
    scoreBreakdown: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    repositoryMetrics: {
      stars: { type: Number, default: 0 },
      forks: { type: Number, default: 0 },
      openIssuesCount: { type: Number, default: 0 },
    },
    activitySummary: {
      commits30d: { type: Number, default: 0 },
      activeAuthorsCount: { type: Number, default: 0 },
    },
    issueSummary: {
      totalObserved: { type: Number, default: 0 },
      observedOpenIssues: { type: Number, default: 0 },
      observedClosedIssues: { type: Number, default: 0 },
      staleOpenIssues: { type: Number, default: 0 },
    },
    pullRequestSummary: {
      totalObserved: { type: Number, default: 0 },
      observedOpenPRs: { type: Number, default: 0 },
      staleOpenPRs: { type: Number, default: 0 },
      draftPRs: { type: Number, default: 0 },
    },
    staleIssues: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    stalePullRequests: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    recommendations: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    dataWarnings: {
      type: [String],
      default: [],
    },
    thresholdsUsed: {
      issueDays: { type: Number, required: true },
      prDays: { type: Number, required: true },
    },
    observationScope: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Indexes per SPEC Section 7:
// { userId: 1, repositoryId: 1, analyzedAt: -1 } and { repositoryId: 1, analyzedAt: -1 }
analysisSchema.index({ userId: 1, repositoryId: 1, analyzedAt: -1 });
analysisSchema.index({ repositoryId: 1, analyzedAt: -1 });

analysisSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

export const Analysis = mongoose.model('Analysis', analysisSchema);
