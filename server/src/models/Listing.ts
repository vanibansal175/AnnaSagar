import mongoose, { Document, Schema, Types } from 'mongoose';

export type FoodCategory = 'veg' | 'non_veg' | 'egg';
export type ListingStatus = 'AVAILABLE' | 'CLAIMED' | 'COLLECTED' | 'EXPIRED' | 'CANCELLED';

export interface IListingImage {
  url: string;
  publicId: string;
}

export interface IListingAddress {
  house: string;
  street: string;
  landmark: string;
  city: string;
  state: string;
  pin: string;
}

export interface IListingClaim {
  receiver: Types.ObjectId;
  claimedAt: Date;
  disclaimerAcknowledgedAt: Date;
}

export interface IListingClaimHistory {
  receiver: Types.ObjectId;
  claimedAt: Date;
  disclaimerAcknowledgedAt: Date;
  cancelledAt: Date;
  cancelledBy: 'receiver' | 'donor';
}

export interface IListing {
  donor: Types.ObjectId;
  foodName: string;
  description?: string;
  category: FoodCategory;
  servings: number;
  allergens?: string;
  packaging?: string;
  cookedAt: Date;
  pickupDeadline: Date;
  images: IListingImage[];
  address: IListingAddress;
  cityKey: string;
  donorContact: string;
  status: ListingStatus;
  claim?: IListingClaim;
  claimHistory: IListingClaimHistory[];
  collectedAt?: Date;
  cancelledAt?: Date;
  cancelledBy?: 'donor';
  expiredAt?: Date;
  warningNotifiedAt?: Date;
  expiredNotifiedAt?: Date;
  isRemoved: boolean;
  removedBy?: Types.ObjectId;
  removedReason?: string;
  removedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IListingDocument extends IListing, Document<Types.ObjectId> {}

const listingImageSchema = new Schema<IListingImage>(
  {
    url: { type: String, required: true, trim: true },
    publicId: { type: String, required: true, trim: true }
  },
  { _id: false }
);

const listingAddressSchema = new Schema<IListingAddress>(
  {
    house: { type: String, required: true, trim: true, maxlength: 100 },
    street: { type: String, required: true, trim: true, maxlength: 150 },
    landmark: { type: String, required: true, trim: true, maxlength: 150 },
    city: { type: String, required: true, trim: true, maxlength: 100 },
    state: { type: String, required: true, trim: true, maxlength: 100 },
    pin: { type: String, required: true, trim: true, length: 6 }
  },
  { _id: false }
);

const listingClaimSchema = new Schema<IListingClaim>(
  {
    receiver: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    claimedAt: { type: Date, required: true, default: Date.now },
    disclaimerAcknowledgedAt: { type: Date, required: true }
  },
  { _id: false }
);

const listingClaimHistorySchema = new Schema<IListingClaimHistory>(
  {
    receiver: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    claimedAt: { type: Date, required: true },
    disclaimerAcknowledgedAt: { type: Date, required: true },
    cancelledAt: { type: Date, required: true, default: Date.now },
    cancelledBy: { type: String, enum: ['receiver', 'donor'], required: true }
  },
  { _id: false }
);

const listingSchema = new Schema<IListingDocument>(
  {
    donor: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    foodName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000
    },
    category: {
      type: String,
      enum: ['veg', 'non_veg', 'egg'],
      required: true
    },
    servings: {
      type: Number,
      required: true,
      min: 1
    },
    allergens: {
      type: String,
      trim: true,
      maxlength: 200
    },
    packaging: {
      type: String,
      trim: true,
      maxlength: 200
    },
    cookedAt: {
      type: Date,
      required: true
    },
    pickupDeadline: {
      type: Date,
      required: true,
      index: true
    },
    images: {
      type: [listingImageSchema],
      validate: {
        validator: (v: IListingImage[]) => Array.isArray(v) && v.length >= 1 && v.length <= 3,
        message: 'A listing must have between 1 and 3 images'
      },
      required: true
    },
    address: {
      type: listingAddressSchema,
      required: true
    },
    cityKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true
    },
    donorContact: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    status: {
      type: String,
      enum: ['AVAILABLE', 'CLAIMED', 'COLLECTED', 'EXPIRED', 'CANCELLED'],
      default: 'AVAILABLE',
      required: true,
      index: true
    },
    claim: {
      type: listingClaimSchema,
      required: false
    },
    claimHistory: {
      type: [listingClaimHistorySchema],
      default: []
    },
    collectedAt: {
      type: Date,
      required: false
    },
    cancelledAt: {
      type: Date,
      required: false
    },
    cancelledBy: {
      type: String,
      enum: ['donor'],
      required: false
    },
    expiredAt: {
      type: Date,
      required: false
    },
    warningNotifiedAt: {
      type: Date,
      required: false
    },
    expiredNotifiedAt: {
      type: Date,
      required: false
    },
    isRemoved: {
      type: Boolean,
      default: false,
      required: true,
      index: true
    },
    removedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false
    },
    removedReason: {
      type: String,
      trim: true,
      maxlength: 500,
      required: false
    },
    removedAt: {
      type: Date,
      required: false
    }
  },
  {
    timestamps: true
  }
);

// Compound indexes per ARCHITECTURE.md
listingSchema.index({ isRemoved: 1, status: 1, cityKey: 1, pickupDeadline: 1 });
listingSchema.index({ donor: 1 });
listingSchema.index({ 'claim.receiver': 1, status: 1 });

export const Listing = mongoose.model<IListingDocument>('Listing', listingSchema);
