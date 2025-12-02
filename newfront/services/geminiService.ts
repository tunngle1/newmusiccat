import { GoogleGenAI } from "@google/genai";
import { Track } from "../types";

const apiKey = process.env.API_KEY || '';
// Note: In a real production app, ensure the API key is handled securely. 
// For this demo, we assume it's available in the env.

const ai = new GoogleGenAI({ apiKey });

export const getAiCritique = async (currentTrack: Track): Promise<string> => {
  if (!apiKey) return "API KEY REQUIRED";

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are a pretentious, brutalist art director and music critic similar to the style of Artemy Lebedev. 
      Analyze this track: "${currentTrack.title}" by "${currentTrack.artist}". 
      Genre: ${currentTrack.genre}.
      
      Write a very short, punchy, slightly cynical or highly intellectual 2-sentence review in RUSSIAN. 
      Do not be polite. Be objective and stylish. Use lowercase mostly, maybe one exclamation mark.`,
    });
    
    return response.text || "Нет слов.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Нейросеть устала.";
  }
};

export const suggestVibe = async (prompt: string, tracks: Track[]): Promise<{ message: string; suggestedIds: string[] }> => {
    if (!apiKey) return { message: "Ключ не найден.", suggestedIds: [] };

    const trackListString = tracks.map(t => `${t.id}: ${t.artist} - ${t.title} (${t.genre})`).join('\n');

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `User request: "${prompt}".
            
            Available tracks:
            ${trackListString}
            
            Task:
            1. Select the IDs of the tracks that best fit the user's request.
            2. Write a short, stylish comment in Russian explaining the selection (max 10 words).
            
            Return JSON format only:
            {
                "ids": ["id1", "id2"],
                "comment": "description"
            }`
        });

        const text = response.text;
        // Basic cleanup to ensure we get JSON
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const data = JSON.parse(jsonStr);

        return {
            message: data.comment,
            suggestedIds: data.ids || []
        };

    } catch (error) {
        console.error("Gemini Suggestion Error", error);
        return { message: "Ничего не найдено.", suggestedIds: [] };
    }
}
