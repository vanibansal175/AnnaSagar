import mongoose, { Document, Schema, Types } from 'mongoose';

export type NotificationType =
  | 'claimed'
  | 'claim_cancelled_by_receiver'
  | 'claim_cancelled_by_donor'
  | 'collected'
  | 'deadline_warning'
  | 'expired';

export interface INotification {
  recipient: Types.ObjectId;
  type: NotificationType;
  listing: Types.ObjectId;
  message: string;
  isRead: boolean;
  createdAt: Date;
}

export interface INotificationDocument extends INotification, Document<Types.ObjectId> {}

const notificationSchema = new Schema<INotificationDocument>(
  {
    recipient: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: [
        'claimed',
        'claim_cancelled_by_receiver',
        'claim_cancelled_by_donor',
        'collected',
        'deadline_warning',
        'expired'
      ],
      required: true
    },
    listing: {
      type: Schema.Types.ObjectId,
      ref: 'Listing',
      required: true
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500
    },
    isRead: {
      type: Boolean,
      default: false,
      required: true
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

// Compound index per ARCHITECTURE.md
notificationSchema.index({ recipient: 1, isRead: 1 });
notificationSchema.index({ createdAt: 1 });

export const Notification = mongoose.model<INotificationDocument>('Notification', notificationSchema);
