import cluster from 'cluster';
import os from 'os';
import dotenv from 'dotenv';

dotenv.config();

// ✅ Forzar NODE_ENV a production si no está definido (para Render)
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
}

// ✅ Determinar cuántos workers crear
const numWorkers = process.env.CLUSTER_WORKERS
  ? parseInt(process.env.CLUSTER_WORKERS)
  : (process.env.NODE_ENV === 'production' ? 3 : 1); // ✅ Optimizado: 3 workers en producción para balance RAM/rendimiento

console.log(`🔄 Cluster Mode: ${numWorkers} workers (${os.cpus().length} CPUs disponibles)`);

if (cluster.isPrimary) {
  console.log(`🎯 Worker principal iniciado (PID: ${process.pid})`);
  
  // ✅ Marcar que estamos en cluster mode
  process.env.CLUSTER_MODE = 'true';
  
  // Crear workers
  for (let i = 0; i < numWorkers; i++) {
    const worker = cluster.fork();
    console.log(`✅ Worker ${worker.id} iniciado (PID: ${worker.process.pid})`);
  }
  
  // Manejar salida de workers
  cluster.on('exit', (worker, code, signal) => {
    console.warn(`⚠️ Worker ${worker.id} (PID: ${worker.process.pid}) salió con código ${code}`);
    
    // Solo reiniciar si no fue intencional
    if (code !== 0 && !signal) {
      console.log(`🔄 Reiniciando worker ${worker.id}...`);
      const newWorker = cluster.fork();
      console.log(`✅ Worker ${newWorker.id} reiniciado (PID: ${newWorker.process.pid})`);
    }
  });
  
  // Manejar desconexión de workers
  cluster.on('disconnect', (worker) => {
    console.warn(`⚠️ Worker ${worker.id} desconectado. Reiniciando...`);
    const newWorker = cluster.fork();
    console.log(`✅ Worker ${newWorker.id} reiniciado (PID: ${newWorker.process.pid})`);
  });
  
  // Logs de estadísticas
  cluster.on('online', (worker) => {
    console.log(`✅ Worker ${worker.id} en línea (PID: ${worker.process.pid})`);
  });
  
  // Manejar señales de terminación
  process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM recibido. Cerrando workers...');
    for (const id in cluster.workers) {
      cluster.workers[id]?.kill();
    }
  });
  
  process.on('SIGINT', () => {
    console.log('🛑 SIGINT recibido. Cerrando workers...');
    for (const id in cluster.workers) {
      cluster.workers[id]?.kill();
    }
  });
  
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`🚀 CLUSTER MODE ACTIVADO`);
      console.log(`📊 Workers: ${numWorkers} (optimizado para 8GB RAM)`);
      console.log(`🔄 Load balancing: Round-robin entre workers`);
      console.log(`💾 RAM estimada: ~${numWorkers * 2}GB (dentro del límite de 8GB)`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  
} else {
  // Este código corre en CADA worker
  console.log(`🔄 Worker ${cluster.worker?.id} iniciando...`);
  
  // Importar y ejecutar el servidor
  require('./server');
}


