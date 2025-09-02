// Updated imports and instantiation
import { Request, Response } from 'express';
import ElevenLabsAgent from '../models/elevenLabsAgent.model';
import ElevenLabsService from '../services/elevenLabs/elevenLabsService';

const service = new ElevenLabsService();

// Create Agent
export const createElevenLabsAgent = async (req: Request, res: Response) => {
  try {
    const companySlug = req.query.companySlug as string;
    const agentData = { ...req.body, companySlug };
    const result = await service.createAgent(agentData);
    const localAgent = new ElevenLabsAgent(result);
    await localAgent.save();
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Similar for other functions, using service.method() and new for model

// Get All Agents (use local DB)
export const getElevenLabsAgents = async (req: Request, res: Response) => {
  try {
    const companySlug = req.query.companySlug as string;
    const agents = await ElevenLabsAgent.find({ companySlug });
    res.json(agents);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get Single Agent
export const getElevenLabsAgent = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const companySlug = req.query.companySlug as string;
    const agent = await ElevenLabsAgent.findOne({ _id: id, companySlug });
    if (!agent) return res.status(404).json({ message: 'Agent not found' });
    res.json(agent);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update Agent
export const updateElevenLabsAgent = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const companySlug = req.query.companySlug as string;
    const updateData = req.body;
    const updated = await ElevenLabsAgent.findOneAndUpdate({ _id: id, companySlug }, updateData, { new: true });
    if (!updated) return res.status(404).json({ message: 'Agent not found' });
    await service.updateAgent(updated.agentId, updateData);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete Agent
export const deleteElevenLabsAgent = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const companySlug = req.query.companySlug as string;
    const agent = await ElevenLabsAgent.findOne({ _id: id, companySlug });
    if (!agent) return res.status(404).json({ message: 'Agent not found' });
    await service.deleteAgent(agent.agentId);
    await agent.deleteOne();
    res.json({ message: 'Agent deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// List Conversations
export const getElevenLabsConversations = async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const conversations = await service.listConversations(agentId);
    res.json(conversations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get Conversation
export const getElevenLabsConversation = async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const conversation = await service.getConversation(conversationId);
    res.json(conversation);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get Conversation Audio
export const getElevenLabsConversationAudio = async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const audio = await service.getConversationAudio(conversationId);
    res.set('Content-Type', 'audio/mpeg');
    res.send(audio);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Generate Personalized Prompt
export const generatePersonalizedPrompt = async (req: Request, res: Response) => {
  try {
    const { basePrompt, customerInfo } = req.body;
    const prompt = service.generatePersonalizedPrompt(basePrompt, customerInfo);
    res.json({ prompt });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
