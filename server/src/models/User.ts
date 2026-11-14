import mongoose, { Document, Schema, Types } from 'mongoose';

export type UserRole = 'user' | 'admin';
export type DonorType = 'individual' | 'hostel_pg' | 'restaurant_cafe' | 'ngo' | 'event_organizer';

export interface IUser {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  tokenVersion: number;
  donorType?: DonorType;
  isBlocked: boolean;
  blockedReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserDocument extends IUser, Document<Types.ObjectId> {}

const userSchema = new Schema<IUserDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 255
    },
    passwordHash: {
      type: String,
      required: true,
      select: false
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
      required: true
    },
    tokenVersion: {
      type: Number,
      default: 0,
      required: true
    },
    donorType: {
      type: String,
      enum: ['individual', 'hostel_pg', 'restaurant_cafe', 'ngo', 'event_organizer'],
      required: false
    },
    isBlocked: {
      type: Boolean,
      default: false,
      required: true
    },
    blockedReason: {
      type: String,
      trim: true,
      maxlength: 500,
      required: false
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret['passwordHash'];
        return ret;
      }
    }
  }
);

// Email unique index is created automatically by `unique: true` on the field.

export const User = mongoose.model<IUserDocument>('User', userSchema);
