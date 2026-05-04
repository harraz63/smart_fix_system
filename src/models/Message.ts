import mongoose, { Schema, Model } from 'mongoose';
import { IMessage, MessageType } from '../types';

const messageSchema = new Schema<IMessage>(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: Object.values(MessageType), default: MessageType.Text },
    content: { type: String, required: true },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

messageSchema.index({ bookingId: 1, createdAt: 1 });

const Message: Model<IMessage> = mongoose.model<IMessage>('Message', messageSchema);
export default Message;
