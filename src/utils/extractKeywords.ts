// Utilidad para extraer keywords relevantes de texto o URL
const STOPWORDS = [
  // Español
  'de', 'la', 'que', 'el', 'en', 'y', 'a', 'los', 'del', 'se', 'las', 'por', 'un', 'para', 'con', 'no', 'una', 'su', 'al', 'lo', 'como', 'más', 'pero', 'sus', 'le', 'ya', 'o', 'este', 'sí', 'porque', 'esta', 'entre', 'cuando', 'muy', 'sin', 'sobre', 'también', 'me', 'hasta', 'hay', 'donde', 'quien', 'desde', 'todo', 'nos', 'durante', 'todos', 'uno', 'les', 'ni', 'contra', 'otros', 'ese', 'eso', 'ante', 'ellos', 'e', 'esto', 'mí', 'antes', 'algunos', 'qué', 'unos', 'yo', 'otro', 'otras', 'otra', 'él', 'tanto', 'esa', 'estos', 'mucho', 'quienes', 'nada', 'muchos', 'cual', 'poco', 'ella', 'estar', 'estas', 'algunas', 'algo', 'nosotros', 'mi', 'mis', 'tú', 'te', 'ti', 'tu', 'tus', 'ellas', 'nosotras', 'vosotros', 'vosotras', 'os', 'mío', 'mía', 'míos', 'mías', 'tuyo', 'tuya', 'tuyos', 'tuyas', 'suyo', 'suya', 'suyos', 'suyas', 'nuestro', 'nuestra', 'nuestros', 'nuestras', 'vuestro', 'vuestra', 'vuestros', 'vuestras', 'esos', 'esas', 'estoy', 'estás', 'está', 'estamos', 'estáis', 'están', 'esté', 'estés', 'estemos', 'estéis', 'estén', 'estaré', 'estarás', 'estará', 'estaremos', 'estaréis', 'estarán', 'estaría', 'estarías', 'estaríamos', 'estaríais', 'estarían', 'estaba', 'estabas', 'estábamos', 'estabais', 'estaban', 'estuve', 'estuviste', 'estuvo', 'estuvimos', 'estuvisteis', 'estuvieron', 'estuviera', 'estuvieras', 'estuviéramos', 'estuvierais', 'estuvieran', 'estuviese', 'estuvieses', 'estuviésemos', 'estuvieseis', 'estuviesen', 'estando', 'estado', 'estada', 'estados', 'estadas', 'estad',
  // Inglés
  'the', 'and', 'for', 'are', 'but', 'not', 'with', 'you', 'this', 'that', 'was', 'from', 'they', 'his', 'her', 'she', 'him', 'all', 'have', 'has', 'had', 'will', 'would', 'can', 'could', 'should', 'about', 'there', 'their', 'what', 'which', 'when', 'where', 'who', 'whom', 'why', 'how', 'your', 'our', 'out', 'in', 'on', 'at', 'by', 'an', 'be', 'if', 'or', 'as', 'of', 'to', 'is', 'it', 'we', 'do', 'does', 'did', 'so', 'no', 'yes', 'just', 'now', 'then', 'than', 'too', 'very', 'also', 'get', 'got', 'go', 'goes', 'went', 'make', 'made', 'see', 'seen', 'use', 'used', 'using', 'up', 'down', 'over', 'under', 'again', 'once', 'only', 'same', 'each', 'any', 'some', 'such', 'own', 'most', 'other', 'another', 'much', 'many', 'more', 'less', 'few', 'may', 'might', 'must', 'shall', 'every', 'because', 'been', 'before', 'after', 'between', 'during', 'through', 'while', 'whereas', 'although', 'though', 'even', 'ever', 'never', 'always', 'sometimes', 'often', 'usually', 'rarely', 'seldom', 'whose', 'either', 'neither', 'both', 'whether', 'whose', 'which', 'what', 'who', 'whom', 'why', 'how', 'here', 'there', 'when', 'where', 'all', 'any', 'some', 'no', 'none', 'not', 'only', 'own', 'same', 'such', 'than', 'too', 'very', 'can', 'will', 'just', 'don', 'should', 'now'
];

function extractKeywords(input: string): string[] {
  if (!input) return [];
  let text = input;
  // Si es una URL, extraer path y query
  try {
    if (/^https?:\/\//.test(input)) {
      const url = new URL(input);
      text = decodeURIComponent(url.pathname + ' ' + url.search);
    }
  } catch {}
  // Limpiar y extraer palabras
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ') // Solo letras y números
    .split(' ')
    .filter(word => word.length > 2 && !STOPWORDS.includes(word));
}

export default extractKeywords; 