import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import convertFbx2Gltf from 'fbx2gltf';
import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import { resample, prune, dedup, draco, textureCompress } from '@gltf-transform/functions';
import draco3d from 'draco3d';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

// Create directories if they don't exist
const uploadDir = path.join(__dirname, 'uploads');
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.fbx' && ext !== '.glb') {
      return cb(new Error('Sadece .fbx veya .glb dosyaları kabul edilir'));
    }
    cb(null, true);
  }
});

// glTF-Transform Setup for Compression
const io = new NodeIO()
  .registerExtensions(KHRONOS_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  });

app.post('/api/upload', upload.single('model'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Dosya yüklenemedi.' });
    }

    const { action } = req.body; // 'original' or 'compress'
    const filePath = req.file.path;
    const originalExt = path.extname(req.file.originalname).toLowerCase();
    const baseName = path.basename(req.file.originalname, originalExt);
    
    const outputFilename = `${baseName}-${Date.now()}.glb`;
    const outputPath = path.join(publicDir, outputFilename);
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const publicUrl = `${protocol}://${req.get('host')}/public/${outputFilename}`;

    console.log(`Processing file: ${req.file.originalname}, Action: ${action}`);

    // If user just wants the original file
    if (action === 'original') {
      const destPath = path.join(publicDir, req.file.filename);
      fs.copyFileSync(filePath, destPath);
      const originalUrl = `${protocol}://${req.get('host')}/public/${req.file.filename}`;
      return res.json({ 
        message: 'Orijinal dosya yüklendi.',
        url: originalUrl,
        originalName: req.file.originalname
      });
    }

    let glbPathToCompress = filePath;

    // Convert FBX to GLB if needed
    if (originalExt === '.fbx') {
      const tempGlbPath = path.join(uploadDir, `${baseName}-temp.glb`);
      console.log('Converting FBX to GLB...');
      await convertFbx2Gltf(filePath, tempGlbPath, ['--binary']);
      glbPathToCompress = tempGlbPath;
    }

    // Compression with glTF-Transform
    console.log('Compressing and optimizing GLB...');
    const document = await io.read(glbPathToCompress);
    
    await document.transform(
      prune(),      // Remove unused nodes/materials
      dedup(),      // Deduplicate accessors/textures
      resample(),   // Resample animations
      draco()       // Draco compression for geometry
      // Note: textureCompress requires 'sharp' module to be installed. We'll skip texture compression for now 
      // unless 'sharp' is added, to keep things simple.
    );

    // Write the final compressed file
    await io.write(outputPath, document);

    // Cleanup temp files
    fs.unlinkSync(filePath);
    if (originalExt === '.fbx' && fs.existsSync(glbPathToCompress)) {
      fs.unlinkSync(glbPathToCompress);
    }

    console.log('Process complete!');

    res.json({
      message: 'Sıkıştırma ve dönüştürme başarılı.',
      glbUrl: publicUrl,
      // USDZ conversion is a placeholder here for Windows. 
      // Real usdz generation requires external tools on Windows.
      usdzUrl: null, 
      originalName: req.file.originalname
    });

  } catch (error) {
    console.error('Error processing file:', error);
    res.status(500).json({ error: 'İşlem sırasında bir hata oluştu: ' + error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
