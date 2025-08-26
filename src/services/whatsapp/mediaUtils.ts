// Modular media handlers for WhatsApp messages
import { Message, MessageMedia } from 'whatsapp-web.js';
import { openai } from '../../config/openai';
import * as fs from 'node:fs';
import * as path from 'node:path';
import axios from 'axios';
import { s3 } from '../../config/aws';
import { PutObjectCommand } from '@aws-sdk/client-s3';

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
  } else if (typeof message.body === 'string' && message.body.trim().length > 0){
    message.body = `Mensaje escrito: ${message.body}\n\nMensaje de voz: ${transcribedText}`;
  } else {
    message.body = `Mensaje de voz: ${transcribedText}`;
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

  // Subir a AWS S3
  const bucketName = process.env.AWS_BUCKET_NAME;
  const s3Key = `whatsapp-images/${message.id.id}.${extension}`;
  const uploadParams = {
    Bucket: bucketName,
    Key: s3Key,
    Body: fs.createReadStream(filePath),
    ContentType: media.mimetype,
  };
  await s3.send(new PutObjectCommand(uploadParams));
  const s3Url = `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

  // Elimina el archivo después del análisis
  fs.unlink(filePath, (err) => {
    if (err) console.warn(`⚠️  No se pudo eliminar el archivo de imagen: ${filePath}`, err);
    else console.log(`🗑️  Archivo de imagen eliminado: ${filePath}`);
  });

  const imageAnalysis = await analyzeImage(media.data, media.mimetype);
  console.log(`🖼️ Imagen analizada: ${imageAnalysis.description}`);
  if (statusText) {
    message.body = `Contexto: "${statusText}"\n\nImagen: ${imageAnalysis.description}\n\nTexto en imagen: ${imageAnalysis.extractedText}\n${s3Url}`;
  } else if (typeof message.body === 'string' && message.body.trim().length > 0){
    message.body = `Mensaje escrito: ${message.body}\n\nImagen: ${imageAnalysis.description}\n\nTexto en imagen: ${imageAnalysis.extractedText}\n${s3Url}`;
  } else {
    message.body = `Imagen: ${imageAnalysis.description}\n\nTexto en imagen: ${imageAnalysis.extractedText}\n${s3Url}`;
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

  // Subir a AWS S3
  const bucketName = process.env.AWS_BUCKET_NAME;
  const s3Key = `whatsapp-videos/${message.id.id}.${extension}`;
  const uploadParams = {
    Bucket: bucketName,
    Key: s3Key,
    Body: fs.createReadStream(filePath),
    ContentType: media.mimetype,
  };
  await s3.send(new PutObjectCommand(uploadParams));
  const s3Url = `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

  // Elimina el archivo después del análisis
  try {
    fs.unlinkSync(filePath);
    console.log(`🗑️  Archivo de video eliminado: ${filePath}`);
  } catch (deleteError) {
    console.warn(`⚠️  No se pudo eliminar el archivo de video: ${filePath}`, deleteError);
  }
  if (statusText) {
    message.body = `Contexto: "${statusText}"\n\nVideo: ${videoAnalysis.description}\nAudio transcrito: ${videoAnalysis.transcribedAudio}\nTexto en video: ${videoAnalysis.extractedText}\n${s3Url}`;
  } else if (typeof message.body === 'string' && message.body.trim().length > 0){
    message.body = `Mensaje escrito: ${message.body}\n\nVideo: ${videoAnalysis.description}\n\nAudio transcrito: ${videoAnalysis.transcribedAudio}\n\nTexto en video: ${videoAnalysis.extractedText}\n${s3Url}`;
  } else {
    message.body = `Video: ${videoAnalysis.description}\n\nAudio transcrito: ${videoAnalysis.transcribedAudio}\n\nTexto en video: ${videoAnalysis.extractedText}\n${s3Url}`;
  }
  return message;
}

export async function handleFileMessage(message: Message, statusText?: string): Promise<Message> {
  const fileDir = 'src/media/files';
  if (!fs.existsSync(fileDir)) {
    fs.mkdirSync(fileDir, { recursive: true });
    console.log(`📁 Directorio creado: ${fileDir}`);
  }
  const media = await message.downloadMedia();
  if (!media || !media.mimetype || !media.data) {
    console.warn('⚠️ No se pudo descargar el archivo de video o está incompleto');
    return message;
  }
  //const extension = media.mimetype.split('/')[1];
  //const filePath = `${fileDir}/${message.id.id}.${extension}`;
  const fileName = media.filename;
  //fs.writeFileSync(filePath, media.data, { encoding: 'base64' });
  //console.log(`📁 Archivo guardado: ${filePath}`);

  console.log(`📁 Archivo guardado: ${fileName}`);

  if (statusText) {
    message.body = `Contexto: "${statusText}"\n\nArchivo adjunto: ${fileName}`;
  } else {
    message.body = `${message.body} Archivo adjunto: ${fileName}`;
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
}): Promise<{ media: MessageMedia; filePath: string } | undefined> {
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
    const media = MessageMedia.fromFilePath(filePath);
    return { media, filePath };
  } catch (err) {
    console.error('Error sending image:', err);
  }
}