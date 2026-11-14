import mongoose, { Document, Schema, Types } from 'mongoose';

export type AuditAction = 'listing_removed' | 'user_blocked' | 'user_unblocked';
export type AuditTargetType = 'listing' | 'user';

export interface IAuditLog {
  action: AuditAction;
  performedBy: Types.ObjectId;
  targetId: Types.ObjectId;
  targetType: AuditTargetType;
  reason: string;
  createdAt: Date;
}

export interface IAuditLogDocument extends IAuditLog, Document<Types.ObjectId> {}

const auditLogSchema = new Schema<IAuditLogDocument>(
  {
    action: {
      type: String,
      enum: ['listing_removed', 'user_blocked', 'user_unblocked'],
      required: true
    },
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    targetId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true
    },
    targetType: {
      type: String,
      enum: ['listing', 'user'],
      required: true
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: false
  }
);

auditLogSchema.index({ createdAt: -1 });

export const AuditLog = mongoose.model<IAuditLogDocument>('AuditLog', auditLogSchema);
