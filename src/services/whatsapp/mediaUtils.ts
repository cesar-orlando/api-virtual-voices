// Modular media handlers for WhatsApp messages
import { Message, MessageMedia } from 'whatsapp-web.js';
import { openai } from '../openai';
import * as fs from 'node:fs';
import * as path from 'node:path';
import axios from 'axios';

export async function handleAudioMessage(message: Message, statusText?: string): Promise<Message> {
  // Asegura el directorio de audios
  const audioDir = 'src/media/audios';
  if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
    console.log(`📁 Directorio creado: ${audioDir}`);
  }
  const filePath = `${audioDir}/${message.id.id}.ogg`;
  const media = await message.downloadMedia();
  if (!media || !media.data) {
    console.warn('⚠️ No se pudo descargar el archivo de audio o está incompleto');
    return message;
  }
  const binaryData = Buffer.from(media.data, 'base64');
  fs.writeFileSync(filePath, binaryData);
  const transcribedText = await transcribeAudio(filePath);
  if (statusText) {
    message.body = `Contexto: "${statusText}"\n\nMensaje de voz: ${transcribedText}`;
    console.log(`📝 Contexto agregado al audio de ${message.from}: "${statusText}"`);
  } else {
    message.body = transcribedText;
  }
  return message;
}

export async function handleImageMessage(message: Message, statusText?: string): Promise<Message> {
  // Asegura el directorio de imágenes
  const imageDir = 'src/media/images';
  if (!fs.existsSync(imageDir)) {
    fs.mkdirSync(imageDir, { recursive: true });
    console.log(`📁 Directorio creado: ${imageDir}`);
  }
  const media = await message.downloadMedia();
  if (!media || !media.mimetype || !media.data) {
    console.warn('⚠️ No se pudo descargar el archivo de imagen o está incompleto');
    return message;
  }
  const extension = media.mimetype.split('/')[1] || 'jpg';
  const filePath = `${imageDir}/${message.id.id}.${extension}`;
  const binaryData = Buffer.from(media.data, 'base64');
  fs.writeFileSync(filePath, binaryData);
  const imageAnalysis = await analyzeImage(media.data, media.mimetype);
  console.log(`🖼️ Imagen analizada: ${imageAnalysis.description}`);
  // Elimina el archivo después del análisis
  try {
    fs.unlinkSync(filePath);
    console.log(`🗑️  Archivo de imagen eliminado: ${filePath}`);
  } catch (deleteError) {
    console.warn(`⚠️  No se pudo eliminar el archivo de imagen: ${filePath}`, deleteError);
  }
  if (statusText) {
    message.body = `Contexto: "${statusText}"\n\nImagen: ${imageAnalysis.description}\nTexto en imagen: ${imageAnalysis.extractedText}`;
  } else {
    message.body = `Imagen: ${imageAnalysis.description}\nTexto en imagen: ${imageAnalysis.extractedText}`;
  }
  return message;
}

export async function handleVideoMessage(message: Message, statusText?: string): Promise<Message> {
  // Asegura el directorio de videos
  const videoDir = 'src/media/videos';
  if (!fs.existsSync(videoDir)) {
    fs.mkdirSync(videoDir, { recursive: true });
    console.log(`📁 Directorio creado: ${videoDir}`);
  }
  const media = await message.downloadMedia();
  if (!media || !media.mimetype || !media.data) {
    console.warn('⚠️ No se pudo descargar el archivo de video o está incompleto');
    return message;
  }
  const extension = media.mimetype.split('/')[1] || 'mp4';
  const filePath = `${videoDir}/${message.id.id}.${extension}`;
  const binaryData = Buffer.from(media.data, 'base64');
  fs.writeFileSync(filePath, binaryData);
  const videoAnalysis = await analyzeVideo(filePath, media.mimetype);
  // Elimina el archivo después del análisis
  try {
    fs.unlinkSync(filePath);
    console.log(`🗑️  Archivo de video eliminado: ${filePath}`);
  } catch (deleteError) {
    console.warn(`⚠️  No se pudo eliminar el archivo de video: ${filePath}`, deleteError);
  }
  if (statusText) {
    message.body = `Contexto: "${statusText}"\n\nVideo: ${videoAnalysis.description}\nAudio transcrito: ${videoAnalysis.transcribedAudio}\nTexto en video: ${videoAnalysis.extractedText}`;
  } else {
    message.body = `Video: ${videoAnalysis.description}\nAudio transcrito: ${videoAnalysis.transcribedAudio}\nTexto en video: ${videoAnalysis.extractedText}`;
  }
  return message;
}

export async function analyzeImage(data: string, mimetype: string): Promise<{ description: string; extractedText: string }> {
  try {
    // OpenAI Vision API implementation
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Most reliable and latest vision model
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analiza esta imagen y proporciona: 1) Una descripción detallada de lo que ves, 2) Todo el texto que puedas leer en la imagen. Responde en español."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimetype};base64,${data}`,
                detail: "auto" // Can be "low", "high", or "auto"
              }
            }
          ]
        }
      ],
      max_tokens: 500,
      temperature: 0.3
    });

    const analysis = response.choices[0]?.message?.content || "";
    
    // Parse the response to separate description and text
    const lines = analysis.split('\n');
    let description = "";
    let extractedText = "";
    
    let currentSection = "";
    for (const line of lines) {
      if (line.toLowerCase().includes('descripción') || line.includes('1)')) {
        currentSection = "description";
        description += line.replace(/^\d+\)\s*/, '').replace(/descripción:?/i, '').trim() + " ";
      } else if (line.toLowerCase().includes('texto') || line.includes('2)')) {
        currentSection = "text";
        extractedText += line.replace(/^\d+\)\s*/, '').replace(/texto:?/i, '').trim() + " ";
      } else if (currentSection === "description" && line.trim()) {
        description += line.trim() + " ";
      } else if (currentSection === "text" && line.trim()) {
        extractedText += line.trim() + " ";
      }
    }

    return {
      description: description.trim() || "Imagen analizada por IA",
      extractedText: extractedText.trim() || "Sin texto detectado"
    };

  } catch (error) {
    console.error('Error analyzing image with OpenAI Vision:', error);
    return {
      description: "Error al analizar la imagen",
      extractedText: "No se pudo extraer texto"
    };
  }
}

export async function analyzeVideo(filePath: string, mimetype: string): Promise<{ description: string; transcribedAudio: string; extractedText: string }> {
  try {
    const path = require('path');
    const { execSync } = require('child_process');
    
    // Try to get ffmpeg path - first system, then npm package
    let ffmpegPath = 'ffmpeg';
    try {
      // Check if system ffmpeg exists
      execSync('ffmpeg -version', { stdio: 'ignore' });
      console.log('✅ Using system FFmpeg');
    } catch (systemError) {
      try {
        // Fallback to npm package
        ffmpegPath = require('ffmpeg-static');
        console.log('📦 Using ffmpeg-static npm package');
      } catch (npmError) {
        console.warn('⚠️ FFmpeg not available - skipping audio/frame extraction');
        console.warn('💡 To enable video analysis, install FFmpeg:');
        console.warn('   Windows: choco install ffmpeg');
        console.warn('   Or: npm install ffmpeg-static');
        return {
          description: "Video recibido (FFmpeg no disponible para análisis completo)",
          transcribedAudio: "Se necesita FFmpeg para transcribir audio",
          extractedText: "Se necesita FFmpeg para extraer texto de frames"
        };
      }
    }
    
    // Extract audio from video for transcription
    const audioPath = filePath.replace(path.extname(filePath), '_audio.mp3');
    let transcribedAudio = "Sin audio detectado";
    
    try {
      // Use ffmpeg to extract audio
      execSync(`"${ffmpegPath}" -i "${filePath}" -vn -acodec mp3 -y "${audioPath}"`, { stdio: 'ignore' });
      
      // Transcribe the extracted audio with Whisper
      const audioTranscription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: 'whisper-1',
        language: 'es',
      });
      
      transcribedAudio = audioTranscription.text || "Audio sin contenido detectado";
      
      // Clean up audio file
      try {
        fs.unlinkSync(audioPath);
        console.log(`🗑️ Archivo de audio temporal eliminado: ${audioPath}`);
      } catch (deleteError) {
        console.warn(`⚠️ No se pudo eliminar archivo de audio temporal: ${audioPath}`);
      }
      
    } catch (audioError) {
      console.warn('⚠️ No se pudo extraer/transcribir audio del video:', audioError.message);
      transcribedAudio = "No se pudo procesar el audio del video";
    }

    // Extract key frames for visual analysis
    const frameExtracted = await extractVideoFrame(filePath, ffmpegPath);
    let description = "Video procesado";
    let extractedText = "Sin texto visible detectado";
    
    if (frameExtracted.success && frameExtracted.frameData) {
      // Analyze the extracted frame with OpenAI Vision
      const frameAnalysis = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analiza este frame de video y proporciona: 1) Una descripción detallada de lo que ves en el video, 2) Todo el texto que puedas leer en la imagen. Responde en español."
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${frameExtracted.frameData}`,
                  detail: "auto"
                }
              }
            ]
          }
        ],
        max_tokens: 500,
        temperature: 0.3
      });

      const analysis = frameAnalysis.choices[0]?.message?.content || "";
      
      // Parse the response to separate description and text
      const lines = analysis.split('\n');
      let tempDescription = "";
      let tempExtractedText = "";
      
      let currentSection = "";
      for (const line of lines) {
        if (line.toLowerCase().includes('descripción') || line.includes('1)')) {
          currentSection = "description";
          tempDescription += line.replace(/^\d+\)\s*/, '').replace(/descripción:?/i, '').trim() + " ";
        } else if (line.toLowerCase().includes('texto') || line.includes('2)')) {
          currentSection = "text";
          tempExtractedText += line.replace(/^\d+\)\s*/, '').replace(/texto:?/i, '').trim() + " ";
        } else if (currentSection === "description" && line.trim()) {
          tempDescription += line.trim() + " ";
        } else if (currentSection === "text" && line.trim()) {
          tempExtractedText += line.trim() + " ";
        }
      }
      
      description = tempDescription.trim() || "Video analizado visualmente";
      extractedText = tempExtractedText.trim() || "Sin texto visible detectado";
    }

    console.log(`🎬 Video analizado: ${description}`);
    console.log(`🎤 Audio transcrito: ${transcribedAudio}`);
    console.log(`📝 Texto extraído: ${extractedText}`);

    return {
      description: description,
      transcribedAudio: transcribedAudio,
      extractedText: extractedText
    };

  } catch (error) {
    console.error('Error analyzing video:', error);
    return {
      description: "Error al analizar el video",
      transcribedAudio: "No se pudo transcribir el audio",
      extractedText: "No se pudo extraer texto"
    };
  }
}

// Helper function to extract a frame from video
export async function extractVideoFrame(videoPath: string, ffmpegPath: string = 'ffmpeg'): Promise<{ success: boolean; frameData?: string }> {
  try {
    const path = require('path');
    const { execSync } = require('child_process');
    
    // Extract frame at 1 second mark (or middle of video)
    const framePath = videoPath.replace(path.extname(videoPath), '_frame.jpg');
    
    // Use ffmpeg to extract a frame
    execSync(`"${ffmpegPath}" -i "${videoPath}" -ss 00:00:01 -vframes 1 -y "${framePath}"`, { stdio: 'ignore' });
    
    // Read the frame and convert to base64
    const frameBuffer = fs.readFileSync(framePath);
    const frameData = frameBuffer.toString('base64');
    
    // Clean up frame file
    try {
      fs.unlinkSync(framePath);
      console.log(`🗑️ Frame temporal eliminado: ${framePath}`);
    } catch (deleteError) {
      console.warn(`⚠️ No se pudo eliminar frame temporal: ${framePath}`);
    }
    
    return { success: true, frameData };
    
  } catch (error) {
    console.warn('⚠️ No se pudo extraer frame del video:', error.message);
    return { success: false };
  }
}

export async function transcribeAudio(filePath: string): Promise<string> {
  try {
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: 'whisper-1',
      language: 'es', // Optional: specify language for better accuracy
    });
    console.log("Transcripción completada:", transcription.text);
    
    // Delete the audio file after successful transcription
    try {
      fs.unlinkSync(filePath);
      console.log(`🗑️  Archivo de audio eliminado: ${filePath}`);
    } catch (deleteError) {
      console.warn(`⚠️  No se pudo eliminar el archivo de audio: ${filePath}`, deleteError);
    }
    
    return transcription.text;
  } catch (error) {
    console.error('Error transcribing audio:', error);
    
    // Try to delete the file even if transcription failed
    try {
      fs.unlinkSync(filePath);
      console.log(`🗑️  Archivo de audio eliminado después de error: ${filePath}`);
    } catch (deleteError) {
      console.warn(`⚠️  No se pudo eliminar el archivo de audio después de error: ${filePath}`, deleteError);
    }
    
    throw error;
  }
}

// Utility to download and send images from URLs via WhatsApp
export async function getImageFromUrl({ imageUrls, i }: {
  imageUrls: string,
  i: number
}): Promise<MessageMedia> {
  try {
    const imgUrl = imageUrls;
    const ext = imgUrl.split('.').pop()?.split('?')[0] || 'jpg';
    const mimeType = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
    const imgResp = await axios.get(imgUrl, { responseType: 'arraybuffer' });
    const fileName = `whatsapp_img_${Date.now()}_${i}.${ext}`;
    const filePath = path.join('src/media/images', fileName);
    // Crear carpeta si no existe
    if (!fs.existsSync(path.dirname(filePath))) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }
    fs.writeFileSync(filePath, imgResp.data);
    return MessageMedia.fromFilePath(filePath);
  } catch (err) {
    console.error('Error sending image:', err);
  }
}