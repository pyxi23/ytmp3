// api/convert.js
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url, format, quality } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Validate YouTube URL
    const youtubeRegex = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/;
    if (!youtubeRegex.test(url)) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    // Create temp directory
    const tempDir = '/tmp/youtube-downloads';
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const outputPath = path.join(tempDir, `video_${timestamp}`);
    
    // Build yt-dlp command
    let command;
    if (format === 'mp3') {
      command = `yt-dlp --extract-audio --audio-format mp3 --audio-quality ${quality === 'high' ? '0' : quality === 'medium' ? '5' : '9'} -o "${outputPath}.%(ext)s" "${url}"`;
    } else {
      const qualityMap = {
        'high': 'best[height<=1080]',
        'medium': 'best[height<=720]',
        'low': 'best[height<=480]'
      };
      command = `yt-dlp -f "${qualityMap[quality]}" -o "${outputPath}.%(ext)s" "${url}"`;
    }

    // Execute yt-dlp
    const execPromise = new Promise((resolve, reject) => {
      exec(command, { timeout: 300000 }, (error, stdout, stderr) => {
        if (error) {
          console.error('yt-dlp error:', error);
          reject(new Error(`Download failed: ${error.message}`));
          return;
        }
        resolve({ stdout, stderr });
      });
    });

    await execPromise;

    // Find the downloaded file
    const files = fs.readdirSync(tempDir);
    const downloadedFile = files.find(file => file.startsWith(`video_${timestamp}`));
    
    if (!downloadedFile) {
      throw new Error('Downloaded file not found');
    }

    const filePath = path.join(tempDir, downloadedFile);
    const fileBuffer = fs.readFileSync(filePath);
    
    // Clean up
    fs.unlinkSync(filePath);
    
    // Set response headers for download
    res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadedFile}"`);
    
    return res.send(fileBuffer);

  } catch (error) {
    console.error('Conversion error:', error);
    return res.status(500).json({ 
      error: error.message || 'Internal server error',
      success: false 
    });
  }
}
