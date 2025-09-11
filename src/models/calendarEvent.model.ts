import { Schema, Document, Connection, Model } from 'mongoose';

export interface ICalendarEvent extends Document {
  // User identification
  phoneUser: string;          // WhatsApp phone number
  company: string;           // Company name
  
  // Google Calendar details
  googleEventId: string;     // Google Calendar event ID
  calendarId: string;        // Google Calendar ID (usually 'primary')
  
  // Event details
  title: string;             // Event title/summary
  description?: string;      // Event description
  startDateTime: Date;       // Start date and time
  endDateTime: Date;         // End date and time
  location?: string;         // Event location
  attendees?: string[];      // Array of email addresses
  timeZone: string;          // Timezone (default: America/Mexico_City)
  
  // Event management
  status: 'active' | 'cancelled' | 'deleted';  // Event status
  googleCalendarUrl?: string; // Direct link to Google Calendar event
  
  // User-friendly reference
  userReference?: string;     // User-friendly name for the event
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  createdVia: 'whatsapp' | 'api' | 'web';  // How was it created
}

const CalendarEventSchema = new Schema<ICalendarEvent>({
  phoneUser: { type: String, required: true, index: true },
  company: { type: String, required: true, index: true },
  
  googleEventId: { type: String, required: true, unique: true },
  calendarId: { type: String, required: true, default: 'primary' },
  
  title: { type: String, required: true },
  description: { type: String, default: '' },
  startDateTime: { type: Date, required: true },
  endDateTime: { type: Date, required: true },
  location: { type: String, default: '' },
  attendees: [{ type: String }],
  timeZone: { type: String, default: 'America/Mexico_City' },
  
  status: { 
    type: String, 
    enum: ['active', 'cancelled', 'deleted', 'inactive'], 
    default: 'active' 
  },
  googleCalendarUrl: { type: String },
  userReference: { type: String },
  
  createdVia: { 
    type: String, 
    enum: ['whatsapp', 'api', 'web'], 
    default: 'whatsapp' 
  }
}, {
  timestamps: true,
  collection: 'calendar_events'
});

// Indexes for efficient querying
CalendarEventSchema.index({ phoneUser: 1, company: 1 });
// Note: googleEventId already has unique index from schema definition
CalendarEventSchema.index({ status: 1 });
CalendarEventSchema.index({ startDateTime: 1 });

// Method to get user-friendly event list
CalendarEventSchema.methods.getUserFriendlyInfo = function() {
  return {
    id: this._id,
    reference: this.userReference || this.title,
    title: this.title,
    date: this.startDateTime.toLocaleDateString('es-MX'),
    time: this.startDateTime.toLocaleTimeString('es-MX', { 
      hour: '2-digit', 
      minute: '2-digit' 
    }),
    status: this.status
  };
};

// Static method to automatically update expired events to inactive
CalendarEventSchema.statics.updateExpiredEvents = async function() {
  const now = new Date();
  try {
    const result = await this.updateMany(
      { 
        endDateTime: { $lt: now },
        status: 'active'
      },
      { 
        status: 'inactive',
        updatedAt: now
      }
    );
    
    if (result.modifiedCount > 0) {
      console.log(`📅 Updated ${result.modifiedCount} expired events to inactive status`);
    }
    
    return result.modifiedCount;
  } catch (error) {
    console.error('❌ Error updating expired events:', error);
    return 0;
  }
};

// Instance method to check if event has expired and update if needed
CalendarEventSchema.methods.checkAndUpdateIfExpired = async function() {
  const now = new Date();
  if (this.endDateTime < now && this.status === 'active') {
    this.status = 'inactive';
    this.updatedAt = now;
    await this.save();
    console.log(`📅 Event "${this.title}" automatically marked as inactive (expired)`);
    return true;
  }
  return false;
};

// Pre-find middleware to automatically update expired events
CalendarEventSchema.pre(['find', 'findOne', 'findOneAndUpdate'], async function() {
  // Auto-update expired events before any query
  const now = new Date();
  try {
    await this.model.updateMany(
      { 
        endDateTime: { $lt: now },
        status: 'active'
      },
      { 
        status: 'inactive',
        updatedAt: now
      }
    );
  } catch (error) {
    // Silent fail to not break queries, but log the error
    console.error('❌ Error in pre-query expired event update:', error);
  }
});

export default function getCalendarEventModel(connection: Connection): Model<ICalendarEvent> {
  // Verificar si el modelo ya existe en esta conexión
  if (connection.models.CalendarEvent) {
    return connection.models.CalendarEvent as Model<ICalendarEvent>;
  }
  return connection.model<ICalendarEvent>('CalendarEvent', CalendarEventSchema);
}

export { CalendarEventSchema };
