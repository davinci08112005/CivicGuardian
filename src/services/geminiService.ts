import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

function checkApiKey() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing. Please configure it in environment variables.");
  }
}

export async function generateSafetyInsights(dataSummary: string, contextualData?: string) {
  checkApiKey();
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze this summary of 911 emergency calls for Montgomery County and provide EXACTLY 4 key safety insights as bullet points.
    
    The 4 bullet points MUST cover:
    1. Peak incident hours (identify the specific time window with highest volume).
    2. District with the highest incident density (name the top district and mention the call count).
    3. Dominant incident type (identify the most frequent category).
    4. Correlation with Bright Data contextual events (explain how specific events or locations impact incident rates).
    
    Data Summary:
    ${dataSummary}
    
    Contextual Web Data (Bright Data Crawl):
    ${contextualData || 'No contextual data available'}
    
    Format the response as a simple Markdown list with exactly 4 bullet points. Do not include a title, introductory text, or concluding remarks. Keep it concise, data-driven, and professional.`,
  });
  
  return response.text;
}

export async function generateSafetyActions(dataSummary: string, contextualData?: string) {
  checkApiKey();
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Based on the following public safety data summary and contextual events for Montgomery County, generate EXACTLY 3 highly specific, actionable "Recommended Safety Actions" for city officials.
    
    Guidelines:
    - Use specific locations (districts) and time windows (e.g., 18:00-21:00).
    - Reference specific incident types (e.g., traffic accidents, medical emergencies).
    - Incorporate contextual events from Bright Data (e.g., concerts, sports games).
    - MANDATORY: Suggest actions such as:
      1. Increasing patrols in the highest-risk districts (e.g., "Increase police patrols in Bethesda between 19:00-23:00").
      2. Implementing traffic control during peak hours (e.g., "Deploy traffic management units on I-270 during the 07:00-09:00 peak").
      3. Monitoring areas near large events (e.g., "Stage emergency medical services near Rockville Town Square during the concert").
    
    Data Summary:
    ${dataSummary}
    
    Contextual Web Data (Bright Data Crawl):
    ${contextualData || 'No contextual data available'}
    
    Format the response as a simple Markdown list with exactly 3 bullet points. Do not include a title or introductory text.`,
  });
  
  return response.text;
}

export async function chatWithAssistant(query: string, dataSummary: string, contextualData?: string) {
  checkApiKey();
  const chat = ai.chats.create({
    model: "gemini-3-flash-preview",
    config: {
      systemInstruction: `You are CivicGuardian AI, an expert in public safety and urban data analysis for Montgomery County. 
      You have access to a summary of recent 911 emergency calls and contextual public event data. 
      Answer user questions accurately based on the data provided. 
      If the data doesn't contain the answer, say so politely. 
      Keep answers concise and helpful.
      
      Data Summary:
      ${dataSummary}
      
      Contextual Public Events:
      ${contextualData || 'No contextual event data available'}`,
    },
  });
  
  const response = await chat.sendMessage({ message: query });
  return response.text;
}
