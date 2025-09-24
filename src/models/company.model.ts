import { Schema, Document, Connection, Model, Types } from "mongoose";

export interface ICompany extends Document {
  name: string;
  address?: string;
  phone?: string;
  statuses: string[];
  internalPhones?: string[];
  conversationSummary?: {
    lastSummarizedChatIndex: number; // Last chat that was included in company summary
    summary: string; // AI-generated summary of all company conversations
    aggregatedFacts: {
      totalChats: number;
      activeCustomers: string[];
      commonQuestions: string[];
      businessInsights: string[];
      customerPreferences: string[];
      salesOpportunities: string[];
      supportIssues: string[];
    };
    businessMetrics: {
      averageResponseTime?: string;
      customerSatisfactionTrends: string[];
      mostActiveTimeframes: string[];
      popularProducts: string[];
    };
    lastUpdated: Date;
    tokensSaved: number;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

const CompanySchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    address: { type: String },
    phone: { type: String },
    statuses: { type: [String], default: ['Activo','Inactivo'] },
    internalPhones: { type: [String], default: [] },
    conversationSummary: {
      lastSummarizedChatIndex: { type: Number, default: 0 },
      summary: { type: String, maxlength: 3000 }, // Larger for company-wide insights
      aggregatedFacts: {
        totalChats: { type: Number, default: 0 },
        activeCustomers: [{ type: String, maxlength: 100 }],
        commonQuestions: [{ type: String, maxlength: 300 }],
        businessInsights: [{ type: String, maxlength: 300 }],
        customerPreferences: [{ type: String, maxlength: 200 }],
        salesOpportunities: [{ type: String, maxlength: 300 }],
        supportIssues: [{ type: String, maxlength: 300 }]
      },
      businessMetrics: {
        averageResponseTime: { type: String, maxlength: 50 },
        customerSatisfactionTrends: [{ type: String, maxlength: 200 }],
        mostActiveTimeframes: [{ type: String, maxlength: 100 }],
        popularProducts: [{ type: String, maxlength: 150 }]
      },
      lastUpdated: { type: Date, default: Date.now },
      tokensSaved: { type: Number, default: 0, min: 0 }
    }
  },
  { timestamps: true }
);

export default function getCompanyModel(conn: Connection): Model<ICompany>{
  // Verificar si el modelo ya existe en esta conexión
  if (conn.models.Company) {
    return conn.models.Company as Model<ICompany>;
  }
  return conn.model<ICompany>("Company", CompanySchema);
}